// 3.14 Delivery Order → sales_orders + order_items.
// SAP delivers; we create a sales order in DMS with status 'DELIVERED' (closest existing token),
// and stamp the SAP doc references so the order can be reconciled.
const express = require('express');
const { pool, withTx } = require('../db');
const { ValidationError, NotFoundError, required, parseDate, toDecimal } = require('../lib/validate');
const cfg = require('../config');

const router = express.Router();

async function findProductIdBySku(sku) {
  const [r] = await pool.query(`SELECT id FROM products WHERE sku_code = ? LIMIT 1`, [sku]);
  return r[0]?.id || null;
}

// mode === 'create' enforces the spec's required-fields list; mode === 'update'
// only validates the fields actually present in the body so PUT can be partial.
function validate(body, mode = 'create') {
  const errors = {};
  if (mode === 'create') {
    for (const f of ['do_entry', 'do_number', 'doc_entry', 'doc_number_so', 'do_date',
      'do_amount', 'do_tax', 'do_total', 'do_details']) {
      if (body[f] === undefined || body[f] === null || body[f] === '') errors[f] = ['This field is required.'];
    }
  }
  for (const k of ['do_amount', 'do_tax', 'do_total']) {
    if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
      const n = toDecimal(body[k]);
      if (n === null || n < 0) errors[k] = ['Must be a non-negative decimal.'];
    }
  }
  if (body.do_date !== undefined && body.do_date !== null && body.do_date !== '' && !parseDate(body.do_date)) {
    errors.do_date = ['Use YYYY-MM-DD.'];
  }
  if (body.do_details !== undefined) {
    if (!Array.isArray(body.do_details) || !body.do_details.length) {
      errors.do_details = ['At least one item is required.'];
    } else {
      const seen = new Set();
      body.do_details.forEach((d, i) => {
        if (seen.has(d.item_code)) errors.do_details = [`Duplicate item_code '${d.item_code}' in lines.`];
        seen.add(d.item_code);
        if (!d.item_code) errors.do_details = ['item_code is required on every line.'];
        if (toDecimal(d.rate) === null || toDecimal(d.rate) < 0) errors.do_details = [`Line ${i + 1}: rate must be ≥ 0.`];
        if (toDecimal(d.quantity) === null || toDecimal(d.quantity) <= 0) errors.do_details = [`Line ${i + 1}: quantity must be > 0.`];
        if (toDecimal(d.amount) === null || toDecimal(d.amount) < 0) errors.do_details = [`Line ${i + 1}: amount must be ≥ 0.`];
        if (d.mfg_date && !parseDate(d.mfg_date)) errors.do_details = [`Line ${i + 1}: bad mfg_date.`];
        if (d.expiry_date && !parseDate(d.expiry_date)) errors.do_details = [`Line ${i + 1}: bad expiry_date.`];
        if (d.mfg_date && d.expiry_date && parseDate(d.mfg_date) > parseDate(d.expiry_date)) {
          errors.do_details = [`Line ${i + 1}: expiry_date must be on or after mfg_date.`];
        }
      });
    }
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

async function findPartyId(req) {
  // The SAP DO payload doesn't include a BP code; we fall back to the system user.
  // If you map DO → BP via doc_number_so, plug it in here.
  return null;
}

router.post('/', async (req, res, next) => {
  try {
    validate(req.body);

    const out = await withTx(async (conn) => {
      // The sales_orders.party_id is NOT NULL. We need *some* BP — pick the first one as a fallback,
      // unless your integration is supposed to derive it from another field.
      const [bp] = await conn.query(`SELECT id FROM external_user_profiles ORDER BY id LIMIT 1`);
      if (!bp.length) throw new ValidationError({ detail: ['No BP exists in DMS yet — sync at least one BP Master first.'] });
      const partyId = bp[0].id;

      const orderNum = req.body.do_number.slice(0, 20);
      const [r] = await conn.query(
        `INSERT INTO sales_orders
           (uuid, created_at, updated_at, is_active,
            order_number, order_date, billing_address, shipping_address, status,
            subtotal, tax_amount, discount_amount, total_amount, total_scheme_benefit,
            ordered_by_id, party_id, created_by_id, updated_by_id,
            sap_doc_entry, sap_order_number, sap_sync_status, sap_synced_at, sap_synced_by_id,
            order_source, order_type, remarks)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                 ?, ?, '', '', 'DELIVERED',
                 ?, ?, 0, ?, 0,
                 ?, ?, ?, ?,
                 ?, ?, 'SYNCED', NOW(6), ?,
                 'SAP', 'STANDARD', ?)`,
        [
          orderNum, parseDate(req.body.do_date),
          toDecimal(req.body.do_amount), toDecimal(req.body.do_tax), toDecimal(req.body.do_total),
          cfg.systemUserId, partyId, cfg.systemUserId, cfg.systemUserId,
          parseInt(req.body.doc_entry, 10) || null, req.body.doc_number_so, cfg.systemUserId,
          `SAP DO ${req.body.do_entry} / ${req.body.do_number}; invoice ${req.body.invoice_number || ''}`,
        ]
      );
      const orderId = r.insertId;

      const lines = [];
      for (const d of req.body.do_details) {
        const productId = await findProductIdBySku(d.item_code);
        if (!productId) throw new ValidationError({ do_details: [`Product '${d.item_code}' does not exist.`] });
        const qty = toDecimal(d.quantity);
        const rate = toDecimal(d.rate);
        const amount = toDecimal(d.amount);
        const [li] = await conn.query(
          `INSERT INTO order_items
             (uuid, created_at, updated_at, is_active,
              packaging_level, quantity, quantity_in_primary, rate, amount,
              tax_rate, tax_amount, discount_percent, discount_amount, line_total,
              qty_delivered, qty_received,
              product_id, order_id, created_by_id, updated_by_id,
              funded_by_snapshot, gst_treatment_applied, is_scheme_item, scheme_benefit_text)
           VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                   'PRIMARY', ?, ?, ?, ?,
                   0, 0, 0, 0, ?,
                   ?, 0,
                   ?, ?, ?, ?,
                   'COMPANY', 'EXCLUSIVE', 0, '')`,
          [qty, Math.round(qty), rate, amount, amount,
            Math.round(qty),
            productId, orderId, cfg.systemUserId, cfg.systemUserId]
        );
        lines.push({ id: li.insertId, item_code: d.item_code });
      }

      // Existing sap_sync_logs table can mirror this — opportunistic insert.
      await conn.query(
        `INSERT INTO sap_sync_logs
          (uuid, created_at, updated_at, is_active, status, sap_doc_entry, sap_doc_num,
           request_payload, attempted_at, order_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, 'SYNCED', ?, ?, ?, NOW(6), ?)`,
        [parseInt(req.body.doc_entry, 10) || null, req.body.doc_number_so, JSON.stringify(req.body), orderId]
      );

      return { id: orderId, lines };
    });

    res.status(201).json({
      ...out,
      do_entry: req.body.do_entry,
      do_number: req.body.do_number,
      doc_entry: req.body.doc_entry,
      doc_number_so: req.body.doc_number_so,
      message: 'Delivery Order created successfully',
    });
  } catch (e) { next(e); }
});

router.put('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [exists] = await pool.query(`SELECT id FROM sales_orders WHERE id = ? LIMIT 1`, [id]);
    if (!exists.length) throw new NotFoundError();
    // PUT is partial — only validate fields that were sent.
    validate(req.body, 'update');

    await withTx(async (conn) => {
      const sets = [];
      const params = [];
      if (req.body.do_amount !== undefined) { sets.push('subtotal = ?'); params.push(toDecimal(req.body.do_amount)); }
      if (req.body.do_tax !== undefined) { sets.push('tax_amount = ?'); params.push(toDecimal(req.body.do_tax)); }
      if (req.body.do_total !== undefined) { sets.push('total_amount = ?'); params.push(toDecimal(req.body.do_total)); }
      if (req.body.do_date !== undefined) { sets.push('order_date = ?'); params.push(parseDate(req.body.do_date)); }
      if (sets.length) {
        sets.push('updated_at = NOW(6)', 'updated_by_id = ?'); params.push(cfg.systemUserId, id);
        await conn.query(`UPDATE sales_orders SET ${sets.join(', ')} WHERE id = ?`, params);
      }
      if (Array.isArray(req.body.do_details) && req.body.do_details.length) {
        // PUT replaces all lines (per spec).
        await conn.query(`DELETE FROM order_items WHERE order_id = ?`, [id]);
        for (const d of req.body.do_details) {
          const productId = await findProductIdBySku(d.item_code);
          if (!productId) throw new ValidationError({ do_details: [`Product '${d.item_code}' does not exist.`] });
          await conn.query(
            `INSERT INTO order_items
               (uuid, created_at, updated_at, is_active,
                packaging_level, quantity, quantity_in_primary, rate, amount,
                tax_rate, tax_amount, discount_percent, discount_amount, line_total,
                qty_delivered, qty_received, product_id, order_id,
                created_by_id, updated_by_id, funded_by_snapshot, gst_treatment_applied, is_scheme_item, scheme_benefit_text)
             VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                     'PRIMARY', ?, ?, ?, ?,
                     0, 0, 0, 0, ?,
                     ?, 0, ?, ?, ?, ?, 'COMPANY', 'EXCLUSIVE', 0, '')`,
            [
              toDecimal(d.quantity), Math.round(toDecimal(d.quantity)), toDecimal(d.rate),
              toDecimal(d.amount), toDecimal(d.amount), Math.round(toDecimal(d.quantity)),
              productId, id, cfg.systemUserId, cfg.systemUserId,
            ]
          );
        }
      }
    });
    res.status(200).json({ id, message: 'Record updated successfully' });
  } catch (e) { next(e); }
});

module.exports = router;
