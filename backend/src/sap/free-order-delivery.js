// EXT — Free Order Delivery (Blanket Agreement reward)
//
// SAP posts a standalone DO for a dealer who elected the "Free Order"
// path against a Blanket Agreement target. Unlike section 3.14 Delivery
// Order, this DO has NO linked SalesOrder on the DMS side — SAP owns the
// entire lifecycle and DMS just receives the goods.
//
// Side effects (all atomic, in a single tx):
//   1. Resolve party by SAP CardCode (bp_code == external_user_profiles.party_code)
//   2. Resolve product for every do_details[].item_code (SKU lookup on products)
//   3. UPSERT free_order_receipts by sap_do_number (unique)
//   4. On repeat push: reverse the prior stock_transaction (decrement
//      stock_levels for every prior item, then delete the transaction rows)
//   5. Replace-all free_order_receipt_lines with the new set
//   6. Create a fresh stock_transaction (order_id=NULL, source='free_order_receipt')
//      + stock_transaction_items per line
//   7. Upsert stock_levels per (party, product, batch)
//   8. Link stock_transaction_id back to the receipt
//
// Idempotency key: sap_do_number (unique index on free_order_receipts).
// Retries with the same payload are safe — the reversal step guarantees
// stock_levels never double-count.
//
// Not touched (deliberately):
//   • sales_orders / order_items — free-order receipts don't tie to any SO
//   • sap_sync_logs — that table's order_id is NOT NULL; free-order events
//     are logged via IntegrationTransaction on the console side instead
const express = require('express');
const { pool, withTx } = require('../db');
const { ValidationError, NotFoundError, required, parseDate, toDecimal } = require('../lib/validate');
const cfg = require('../config');

const router = express.Router();

async function findProductIdBySku(conn, sku) {
  const [r] = await conn.query(`SELECT id FROM products WHERE sku_code = ? LIMIT 1`, [sku]);
  return r[0]?.id || null;
}

async function findPartyIdByCode(conn, bpCode) {
  const [r] = await conn.query(
    `SELECT id FROM external_user_profiles WHERE party_code = ? LIMIT 1`,
    [bpCode],
  );
  return r[0]?.id || null;
}

function validate(body, mode = 'create') {
  const errors = {};
  if (mode === 'create') {
    for (const f of ['bp_code', 'sap_do_number', 'sap_do_entry', 'do_date', 'do_details']) {
      if (body[f] === undefined || body[f] === null || body[f] === '') {
        errors[f] = ['This field is required.'];
      }
    }
  }
  for (const k of ['do_amount', 'do_tax', 'do_total']) {
    if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
      const n = toDecimal(body[k]);
      if (n === null || n < 0) errors[k] = ['Must be a non-negative decimal.'];
    }
  }
  if (body.do_date !== undefined && body.do_date !== null && body.do_date !== ''
      && !parseDate(body.do_date)) {
    errors.do_date = ['Use YYYY-MM-DD.'];
  }
  if (body.blanket_agreement_no !== undefined && body.blanket_agreement_no !== null
      && body.blanket_agreement_no !== '') {
    const n = Number(body.blanket_agreement_no);
    if (!Number.isFinite(n) || n < 0) {
      errors.blanket_agreement_no = ['Must be a non-negative integer.'];
    }
  }
  if (body.do_details !== undefined) {
    if (!Array.isArray(body.do_details) || !body.do_details.length) {
      errors.do_details = ['At least one item is required.'];
    } else {
      // Free-order pushes can carry the same item across multiple batches
      // on a single receipt, so de-dupe by (item_code, batch_number) —
      // NOT by item_code alone (that would falsely reject legit splits).
      const seen = new Set();
      body.do_details.forEach((d, i) => {
        const key = `${d.item_code}::${(d.batch_number || '').trim()}`;
        if (seen.has(key)) errors.do_details = [`Duplicate (item_code, batch_number) '${key}' in lines.`];
        seen.add(key);
        if (!d.item_code) errors.do_details = ['item_code is required on every line.'];
        if (d.rate !== undefined && d.rate !== null && d.rate !== ''
            && (toDecimal(d.rate) === null || toDecimal(d.rate) < 0)) {
          errors.do_details = [`Line ${i + 1}: rate must be ≥ 0.`];
        }
        if (toDecimal(d.quantity) === null || toDecimal(d.quantity) <= 0) {
          errors.do_details = [`Line ${i + 1}: quantity must be > 0.`];
        }
        if (d.amount !== undefined && d.amount !== null && d.amount !== ''
            && (toDecimal(d.amount) === null || toDecimal(d.amount) < 0)) {
          errors.do_details = [`Line ${i + 1}: amount must be ≥ 0.`];
        }
        if (d.mfg_date && !parseDate(d.mfg_date)) {
          errors.do_details = [`Line ${i + 1}: bad mfg_date.`];
        }
        if (d.expiry_date && !parseDate(d.expiry_date)) {
          errors.do_details = [`Line ${i + 1}: bad expiry_date.`];
        }
        if (d.mfg_date && d.expiry_date
            && parseDate(d.mfg_date) > parseDate(d.expiry_date)) {
          errors.do_details = [`Line ${i + 1}: expiry_date must be on or after mfg_date.`];
        }
      });
    }
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

// Shared handler for POST and PUT — the DO's identity is sap_do_number
// (unique on free_order_receipts). Repeat calls with the same number
// replace lines + reverse the prior stock-in, so retries can never
// double-count inventory.
async function handleFreeOrderUpsert(req, res, next) {
  try {
    validate(req.body, 'create');

    const out = await withTx(async (conn) => {
      const bpCode = String(req.body.bp_code).trim();
      const sapDoNumber = String(req.body.sap_do_number).trim();
      const sapDoEntry = String(req.body.sap_do_entry).trim();

      // 1. Resolve dealer
      const partyId = await findPartyIdByCode(conn, bpCode);
      if (!partyId) {
        throw new ValidationError({
          bp_code: [`No dealer found for bp_code '${bpCode}'.`],
        });
      }

      // 2. Resolve products up-front so an unknown SKU rolls the tx back
      //    before any writes.
      const productIds = {};
      for (const d of req.body.do_details) {
        const pid = await findProductIdBySku(conn, d.item_code);
        if (!pid) {
          throw new ValidationError({
            do_details: [`Product '${d.item_code}' does not exist.`],
          });
        }
        productIds[d.item_code] = pid;
      }

      // 3. UPSERT free_order_receipts header
      const [existing] = await conn.query(
        `SELECT id, stock_transaction_id FROM free_order_receipts WHERE sap_do_number = ? LIMIT 1`,
        [sapDoNumber],
      );

      const doDate = parseDate(req.body.do_date);
      const invoiceNumber = req.body.invoice_number || null;
      const doAmount = toDecimal(req.body.do_amount) ?? 0;
      const doTax = toDecimal(req.body.do_tax) ?? 0;
      const doTotal = toDecimal(req.body.do_total) ?? 0;
      const blanketAgreementNo = req.body.blanket_agreement_no != null
        && req.body.blanket_agreement_no !== ''
          ? parseInt(req.body.blanket_agreement_no, 10)
          : null;
      const remarks = String(req.body.remarks || '').slice(0, 5000);

      let receiptId;
      const isUpdate = existing.length > 0;

      if (isUpdate) {
        receiptId = existing[0].id;

        // 4. Reverse prior stock-in — decrement stock_levels for every
        //    item on the prior transaction, then delete the items +
        //    transaction rows. Keeps replays idempotent.
        const priorTxnId = existing[0].stock_transaction_id;
        if (priorTxnId) {
          const [priorItems] = await conn.query(
            `SELECT product_id, batch_number, quantity
               FROM stock_transaction_items
              WHERE stock_transaction_id = ?`,
            [priorTxnId],
          );
          for (const it of priorItems) {
            await conn.query(
              `UPDATE stock_levels
                  SET current_quantity = GREATEST(current_quantity - ?, 0),
                      updated_at = NOW(6)
                WHERE party_id = ? AND product_id = ? AND batch_number = ?`,
              [it.quantity, partyId, it.product_id, it.batch_number || ''],
            );
          }
          await conn.query(
            `UPDATE free_order_receipts SET stock_transaction_id = NULL WHERE id = ?`,
            [receiptId],
          );
          await conn.query(
            `DELETE FROM stock_transaction_items WHERE stock_transaction_id = ?`,
            [priorTxnId],
          );
          await conn.query(
            `DELETE FROM stock_transactions WHERE id = ?`,
            [priorTxnId],
          );
        }

        // Replace-all lines
        await conn.query(
          `DELETE FROM free_order_receipt_lines WHERE receipt_id = ?`,
          [receiptId],
        );
        await conn.query(
          `UPDATE free_order_receipts SET
             updated_at = NOW(6),
             updated_by_id = ?,
             party_id = ?,
             sap_do_entry = ?,
             blanket_agreement_no = ?,
             do_date = ?,
             invoice_number = ?,
             do_amount = ?,
             do_tax = ?,
             do_total = ?,
             remarks = ?
           WHERE id = ?`,
          [
            cfg.systemUserId,
            partyId,
            sapDoEntry,
            blanketAgreementNo,
            doDate,
            invoiceNumber,
            doAmount,
            doTax,
            doTotal,
            remarks,
            receiptId,
          ],
        );
      } else {
        const [ins] = await conn.query(
          `INSERT INTO free_order_receipts
             (uuid, created_at, updated_at, is_active,
              created_by_id, updated_by_id,
              party_id,
              sap_do_number, sap_do_entry, blanket_agreement_no,
              do_date, invoice_number,
              do_amount, do_tax, do_total,
              remarks)
           VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                   ?, ?,
                   ?,
                   ?, ?, ?,
                   ?, ?,
                   ?, ?, ?,
                   ?)`,
          [
            cfg.systemUserId, cfg.systemUserId,
            partyId,
            sapDoNumber, sapDoEntry, blanketAgreementNo,
            doDate, invoiceNumber,
            doAmount, doTax, doTotal,
            remarks,
          ],
        );
        receiptId = ins.insertId;
      }

      // 5. Insert receipt lines
      req.body.do_details.forEach((_, i) => { /* line_number is 1-indexed */ });
      let lineNumber = 0;
      for (const d of req.body.do_details) {
        lineNumber += 1;
        await conn.query(
          `INSERT INTO free_order_receipt_lines
             (uuid, created_at, updated_at, is_active,
              created_by_id, updated_by_id,
              receipt_id, line_number,
              item_code, product_id,
              quantity, uom, rate, amount,
              batch_number, mfg_date, expiry_date)
           VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                   ?, ?,
                   ?, ?,
                   ?, ?,
                   ?, ?, ?, ?,
                   ?, ?, ?)`,
          [
            cfg.systemUserId, cfg.systemUserId,
            receiptId, lineNumber,
            d.item_code, productIds[d.item_code],
            toDecimal(d.quantity), d.uom || 'CTN',
            toDecimal(d.rate) ?? 0, toDecimal(d.amount) ?? 0,
            d.batch_number || null, parseDate(d.mfg_date), parseDate(d.expiry_date),
          ],
        );
      }

      // 6. Generate next SI-YYYY-XXXX transaction number
      const year = new Date().getFullYear();
      const prefix = `SI-${year}-`;
      const [lastTxn] = await conn.query(
        `SELECT transaction_number FROM stock_transactions
          WHERE transaction_number LIKE ?
          ORDER BY transaction_number DESC LIMIT 1`,
        [`${prefix}%`],
      );
      const lastSeq = lastTxn[0]
        ? parseInt(String(lastTxn[0].transaction_number).split('-').pop(), 10) || 0
        : 0;
      const txnNumber = `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;

      // 7. Insert stock_transaction — order_id=NULL, source='free_order_receipt'
      const [txnInsert] = await conn.query(
        `INSERT INTO stock_transactions
           (uuid, created_at, updated_at, is_active,
            created_by_id, updated_by_id,
            transaction_number, transaction_type, source, transaction_date,
            order_id, party_id,
            grn_number, invoice_number, invoice_date,
            remarks)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                 ?, ?,
                 ?, 'stock_in', 'free_order_receipt', ?,
                 NULL, ?,
                 ?, ?, ?,
                 ?)`,
        [
          cfg.systemUserId, cfg.systemUserId,
          txnNumber, doDate,
          partyId,
          sapDoNumber, invoiceNumber, doDate,
          `Auto stock-in from SAP Free Order ${sapDoNumber}`
            + (blanketAgreementNo ? ` (Agreement #${blanketAgreementNo})` : ''),
        ],
      );
      const stockTxnId = txnInsert.insertId;

      // 8. Insert stock_transaction_items + upsert stock_levels per line
      for (const d of req.body.do_details) {
        const productId = productIds[d.item_code];
        const qty = Math.round(toDecimal(d.quantity));
        const batch = d.batch_number || '';
        const uom = d.uom || 'CTN';
        const mfg = parseDate(d.mfg_date);
        const exp = parseDate(d.expiry_date);

        await conn.query(
          `INSERT INTO stock_transaction_items
             (uuid, created_at, updated_at, is_active,
              created_by_id, updated_by_id,
              stock_transaction_id, product_id,
              batch_number, uom, quantity,
              manufacturing_date, expiry_date)
           VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                   ?, ?,
                   ?, ?,
                   ?, ?, ?,
                   ?, ?)`,
          [
            cfg.systemUserId, cfg.systemUserId,
            stockTxnId, productId,
            batch, uom, qty,
            mfg, exp,
          ],
        );

        const [existingSL] = await conn.query(
          `SELECT id, current_quantity FROM stock_levels
            WHERE party_id = ? AND product_id = ? AND batch_number = ? LIMIT 1`,
          [partyId, productId, batch],
        );
        if (existingSL.length) {
          await conn.query(
            `UPDATE stock_levels SET
               current_quantity = current_quantity + ?,
               last_stock_in_date = ?,
               manufacturing_date = COALESCE(manufacturing_date, ?),
               expiry_date        = COALESCE(expiry_date, ?),
               updated_at = NOW(6),
               updated_by_id = ?
             WHERE id = ?`,
            [qty, doDate, mfg, exp, cfg.systemUserId, existingSL[0].id],
          );
        } else {
          await conn.query(
            `INSERT INTO stock_levels
               (uuid, created_at, updated_at, is_active,
                created_by_id, updated_by_id,
                party_id, product_id, batch_number, uom,
                current_quantity,
                manufacturing_date, expiry_date, last_stock_in_date)
             VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                     ?, ?,
                     ?, ?, ?, ?,
                     ?,
                     ?, ?, ?)`,
            [
              cfg.systemUserId, cfg.systemUserId,
              partyId, productId, batch, uom,
              qty,
              mfg, exp, doDate,
            ],
          );
        }
      }

      // 9. Link stock_transaction back to the receipt
      await conn.query(
        `UPDATE free_order_receipts SET stock_transaction_id = ? WHERE id = ?`,
        [stockTxnId, receiptId],
      );

      return {
        id: receiptId,
        mode: isUpdate ? 'receipt_updated' : 'receipt_created',
        party_id: partyId,
        bp_code: bpCode,
        sap_do_number: sapDoNumber,
        sap_do_entry: sapDoEntry,
        blanket_agreement_no: blanketAgreementNo,
        line_count: req.body.do_details.length,
        stock_transaction_number: txnNumber,
      };
    });

    res.status(out.mode === 'receipt_updated' ? 200 : 201).json({
      ...out,
      message: out.mode === 'receipt_updated'
        ? 'Free Order Receipt updated — stock re-applied.'
        : 'Free Order Receipt created — stock added to dealer inventory.',
    });
  } catch (e) { next(e); }
}

router.post('/', handleFreeOrderUpsert);

// PUT — SAP re-push of the same free-order DO. Contract mirrors the paid
// DO PUT: :id is the free_order_receipts.id and the body's sap_do_number
// must resolve to the same row. Otherwise the handler is identical to POST
// — same reversal, same replace-all lines, same stock re-application.
router.put('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [exists] = await pool.query(
      `SELECT id, sap_do_number FROM free_order_receipts WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!exists.length) throw new NotFoundError();

    validate(req.body, 'create');

    if (req.body.sap_do_number
        && String(req.body.sap_do_number).trim() !== exists[0].sap_do_number) {
      throw new ValidationError({
        sap_do_number: [`sap_do_number does not match receipt id=${id}.`],
      });
    }
    return handleFreeOrderUpsert(req, res, next);
  } catch (e) { next(e); }
});

module.exports = router;
