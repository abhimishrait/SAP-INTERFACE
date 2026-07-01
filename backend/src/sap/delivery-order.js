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

// Insert the DO's line items into an existing (or new) sales_orders row.
async function insertOrderItems(conn, orderId, doDetails) {
  const lines = [];
  for (const d of doDetails) {
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
  return lines;
}

router.post('/', async (req, res, next) => {
  try {
    validate(req.body);

    const out = await withTx(async (conn) => {
      // Upsert by SAP order number: the DO always belongs to an SO that already
      // exists in DMS (either created from the UI or from an earlier SAP sync).
      // We look it up by sap_order_number = doc_number_so, then mark it DELIVERED
      // and replace its lines with the DO's lines. This preserves the SO's real
      // customer (party_id) instead of the "first BP" default that used to run
      // here and misassign every DO.
      const docNumberSo = String(req.body.doc_number_so).trim();
      const docEntry    = parseInt(req.body.doc_entry, 10) || null;
      const [existing]  = await conn.query(
        `SELECT id, party_id FROM sales_orders WHERE sap_order_number = ? LIMIT 1`,
        [docNumberSo]
      );

      let orderId;
      let mode;
      if (existing.length) {
        // UPDATE — DO fulfils a known SO
        orderId = existing[0].id;
        mode = 'updated';
        // NOTE: we deliberately do NOT overwrite `order_number` — that's the
        // DMS-native SO number (e.g. SO-2026-0007) that the UI already displays.
        // The SAP-side do_number lives in `remarks` alongside do_entry.
        await conn.query(
          `UPDATE sales_orders SET
             order_date         = ?,
             status             = 'DELIVERED',
             subtotal           = ?,
             tax_amount         = ?,
             total_amount       = ?,
             sap_doc_entry      = ?,
             sap_sync_status    = 'SYNCED',
             sap_synced_at      = NOW(6),
             sap_synced_by_id   = ?,
             updated_at         = NOW(6),
             updated_by_id      = ?,
             remarks            = CONCAT_WS(' | ', NULLIF(remarks, ''), ?)
           WHERE id = ?`,
          [
            parseDate(req.body.do_date),
            toDecimal(req.body.do_amount),
            toDecimal(req.body.do_tax),
            toDecimal(req.body.do_total),
            docEntry,
            cfg.systemUserId,
            cfg.systemUserId,
            `SAP DO ${req.body.do_entry} / ${req.body.do_number}; invoice ${req.body.invoice_number || ''}`,
            orderId,
          ]
        );
        // Replace the SO's lines with the DO's lines
        await conn.query(`DELETE FROM order_items WHERE order_id = ?`, [orderId]);
      } else {
        // No SO with that sap_order_number — the DO arrived before the SO was
        // synced. Reject with a clear error rather than misattributing the DO
        // to a random BP; SAP will retry once the SO exists.
        throw new ValidationError({
          doc_number_so: [`No sales order with sap_order_number '${docNumberSo}' — cannot derive customer. Sync the SO first, then re-push the DO.`],
        });
      }

      const lines = await insertOrderItems(conn, orderId, req.body.do_details);

      await conn.query(
        `INSERT INTO sap_sync_logs
          (uuid, created_at, updated_at, is_active, status, sap_doc_entry, sap_doc_num,
           request_payload, attempted_at, order_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, 'SYNCED', ?, ?, ?, NOW(6), ?)`,
        [docEntry, docNumberSo, JSON.stringify(req.body), orderId]
      );

      return { id: orderId, mode, party_id: existing[0].party_id, lines };
    });

    res.status(out.mode === 'updated' ? 200 : 201).json({
      ...out,
      do_entry: req.body.do_entry,
      do_number: req.body.do_number,
      doc_entry: req.body.doc_entry,
      doc_number_so: req.body.doc_number_so,
      message: out.mode === 'updated'
        ? 'Delivery Order recorded on existing sales order.'
        : 'Delivery Order created successfully',
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
        await insertOrderItems(conn, id, req.body.do_details);
      }
    });
    res.status(200).json({ id, message: 'Record updated successfully' });
  } catch (e) { next(e); }
});

module.exports = router;
