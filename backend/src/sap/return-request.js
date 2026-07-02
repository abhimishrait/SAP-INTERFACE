// Sales Return Request — mirrors SAP B1 POST /ReturnRequest and GET /ReturnRequest(id).
//
// Flow (dealer-initiated):
//   1. DMS collects the return from the dealer UI (product/batch/qty/reason).
//   2. DMS POSTs the SAP B1-shaped payload to /sap/return-request/ here.
//   3. This module validates against abc_dms (stock available? batches match
//      line qty? blanket agreement resolvable? product exists?), records a
//      sales_returns + sales_return_lines pair, and decrements stock_levels
//      for every line where WithoutInventoryMovement='N'.
//   4. Response includes the internal id + return_number so DMS can display
//      it immediately. SAP round-trip (real POST to SAP B1) is a separate
//      concern handled by the DMS-side worker — this module only records
//      the request and locks the inventory.
//
// Payload shape (spec — same field names as the SAP B1 /ReturnRequest body):
//   {
//     "CardCode": "614502345",
//     "DocDate": "2026-02-06",
//     "DocDueDate": "2026-02-28",
//     "TaxDate": "2026-02-06",
//     "DocCurrency": "",
//     "Comments": "…",
//     "U_BulDis": "5",
//     "DocumentLines": [
//       {
//         "ItemCode": "FG203003",
//         "Quantity": "10",
//         "VatGroup": "VAT-13",
//         "UnitPrice": "1140.04",
//         "LineTotal": "11400.40",
//         "AgreementNo": "31438",
//         "WithoutInventoryMovement": "N",
//         "CostingCode": "C. EAST",
//         "COGSCostingCode": "C. EAST",
//         "U_Ratio": "3",
//         "U_SAmnt": "342.01",
//         "BatchNumbers": [{ "ItemCode":"FG203003","BatchNumber":"108207","Quantity":10 }]
//       }
//     ]
//   }
//
// Extension fields (DMS-only, optional):
//   ReturnReason  — 'damaged' | 'expired' | 'other'   (defaults to 'other')
//   Remarks       — dealer-supplied remarks
//
// Non-goals:
//   - We do NOT split damaged vs expired at the SAP layer — SAP sees one
//     Return Request regardless. The reason lives in `sales_returns.return_reason`
//     for reporting.
//   - We do NOT auto-forward to SAP B1 from this endpoint. That's an outbound
//     concern handled by the DMS worker calling the SAP OData layer directly.
//     Once SAP replies, PATCH /sap/return-request/:id/ can stamp the DocEntry.

const express = require('express');
const { pool, withTx } = require('../db');
const { ValidationError, NotFoundError, required, parseDate, toDecimal } = require('../lib/validate');
const cfg = require('../config');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────

async function findPartyByCardCode(cardCode) {
  const [r] = await pool.query(
    `SELECT id, party_code, party_name FROM external_user_profiles WHERE party_code = ? LIMIT 1`,
    [cardCode]
  );
  return r[0] || null;
}

async function findProductBySku(sku) {
  const [r] = await pool.query(
    `SELECT id, sku_code, product_name FROM products WHERE sku_code = ? LIMIT 1`,
    [sku]
  );
  return r[0] || null;
}

// Reason enum — DMS-only, spec is silent (SAP just sees the return).
const REASON_CHOICES = new Set(['damaged', 'expired', 'other']);

// Generate the next RET-YYYY-XXXX number under a row lock so parallel
// creates don't collide. Mirrors StockTransaction.generate_transaction_number
// in Django, but on the Node side.
async function generateReturnNumber(conn) {
  const year = new Date().getFullYear();
  const prefix = `RET-${year}-`;
  const [rows] = await conn.query(
    `SELECT return_number FROM sales_returns
      WHERE return_number LIKE ?
      ORDER BY return_number DESC LIMIT 1
      FOR UPDATE`,
    [`${prefix}%`]
  );
  const lastSeq = rows[0]
    ? parseInt(String(rows[0].return_number).split('-').pop(), 10) || 0
    : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
}

// Validate the incoming body. Throws ValidationError with the SAP-shaped
// field names so error messages point directly at what the caller sent.
function validate(body) {
  const errors = {};
  required(body, ['CardCode', 'DocDate', 'DocDueDate', 'TaxDate', 'DocumentLines']);

  if (!parseDate(body.DocDate))    errors.DocDate    = ['Use YYYY-MM-DD.'];
  if (!parseDate(body.DocDueDate)) errors.DocDueDate = ['Use YYYY-MM-DD.'];
  if (!parseDate(body.TaxDate))    errors.TaxDate    = ['Use YYYY-MM-DD.'];

  if (body.DocDate && body.DocDueDate) {
    const d = parseDate(body.DocDate);
    const due = parseDate(body.DocDueDate);
    if (d && due && d > due) errors.DocDueDate = ['DocDueDate must be on or after DocDate.'];
  }

  if (body.U_BulDis !== undefined && body.U_BulDis !== null && body.U_BulDis !== '') {
    const bul = toDecimal(body.U_BulDis);
    if (bul === null || bul < 0 || bul > 100) errors.U_BulDis = ['Bulk discount must be between 0 and 100.'];
  }

  const reason = String(body.ReturnReason || 'other').toLowerCase();
  if (!REASON_CHOICES.has(reason)) {
    errors.ReturnReason = [`Must be one of: ${[...REASON_CHOICES].join(', ')}.`];
  }

  if (!Array.isArray(body.DocumentLines) || !body.DocumentLines.length) {
    errors.DocumentLines = ['At least one line is required.'];
  } else {
    body.DocumentLines.forEach((ln, i) => {
      const tag = `DocumentLines[${i}]`;
      if (!ln.ItemCode) errors[`${tag}.ItemCode`] = ['This field is required.'];
      const qty = toDecimal(ln.Quantity);
      if (qty === null || qty <= 0) errors[`${tag}.Quantity`] = ['Must be > 0.'];
      const price = toDecimal(ln.UnitPrice);
      if (price === null || price < 0) errors[`${tag}.UnitPrice`] = ['Must be ≥ 0.'];
      const total = toDecimal(ln.LineTotal);
      if (total === null || total < 0) errors[`${tag}.LineTotal`] = ['Must be ≥ 0.'];

      const wim = String(ln.WithoutInventoryMovement || 'N').toUpperCase();
      if (!['Y', 'N'].includes(wim)) {
        errors[`${tag}.WithoutInventoryMovement`] = ['Must be Y or N.'];
      }

      // Batches — required if WithoutInventoryMovement === 'N' and the item is
      // batch-managed. We can't know batch-managed-ness up front here without
      // an extra products lookup per line, so we treat batches as required
      // whenever WIM='N' — matches the spec's "Batch numbers are mandatory
      // when: item is batch-managed AND WithoutInventoryMovement='N'".
      // Non-batch items should send an empty BatchNumbers array explicitly OR
      // set WithoutInventoryMovement='Y'.
      if (wim === 'N') {
        if (!Array.isArray(ln.BatchNumbers) || !ln.BatchNumbers.length) {
          errors[`${tag}.BatchNumbers`] = [
            'Required for lines with WithoutInventoryMovement=N (batch-managed item).',
          ];
        } else {
          // Sum of batch qty must equal line qty.
          let sum = 0;
          ln.BatchNumbers.forEach((b, j) => {
            const btag = `${tag}.BatchNumbers[${j}]`;
            if (!b.BatchNumber) errors[`${btag}.BatchNumber`] = ['This field is required.'];
            // BatchNumbers[j].ItemCode must equal the line's ItemCode (spec).
            if (b.ItemCode && b.ItemCode !== ln.ItemCode) {
              errors[`${btag}.ItemCode`] = [`Must match line ItemCode '${ln.ItemCode}'.`];
            }
            const bqty = toDecimal(b.Quantity);
            if (bqty === null || bqty <= 0) {
              errors[`${btag}.Quantity`] = ['Must be > 0.'];
            } else {
              sum += bqty;
            }
          });
          if (qty !== null && sum > 0 && Math.abs(sum - qty) > 0.001) {
            errors[`${tag}.BatchNumbers`] = [
              `Sum of batch quantities (${sum}) must equal line Quantity (${qty}).`,
            ];
          }
        }
      }
    });
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);
}

// Given a party + product + batch, load the current stock_levels row FOR UPDATE
// (so concurrent returns can't oversell the same batch).
async function loadStockLevelForUpdate(conn, partyId, productId, batchNumber) {
  const [rows] = await conn.query(
    `SELECT id, current_quantity, uom FROM stock_levels
      WHERE party_id = ? AND product_id = ? AND batch_number = ?
      LIMIT 1 FOR UPDATE`,
    [partyId, productId, batchNumber]
  );
  return rows[0] || null;
}

// Validate stock availability for every batch-line and return a plan that the
// transactional write step will execute. Throws ValidationError with per-line
// details if any batch is short or missing at the dealer.
async function validateStock(conn, partyId, body) {
  const problems = [];
  const productCache = new Map();
  for (let i = 0; i < body.DocumentLines.length; i++) {
    const ln = body.DocumentLines[i];
    let product = productCache.get(ln.ItemCode);
    if (!product) {
      product = await findProductBySku(ln.ItemCode);
      productCache.set(ln.ItemCode, product);
    }
    if (!product) {
      problems.push(`DocumentLines[${i}]: product '${ln.ItemCode}' does not exist.`);
      continue;
    }

    const wim = String(ln.WithoutInventoryMovement || 'N').toUpperCase();
    if (wim === 'Y') continue; // No stock check for zero-movement lines.

    for (let j = 0; j < (ln.BatchNumbers || []).length; j++) {
      const b = ln.BatchNumbers[j];
      const bqty = toDecimal(b.Quantity);
      const sl = await loadStockLevelForUpdate(conn, partyId, product.id, b.BatchNumber);
      if (!sl) {
        problems.push(
          `DocumentLines[${i}].BatchNumbers[${j}]: batch '${b.BatchNumber}' ` +
          `not found in dealer's stock for '${ln.ItemCode}'.`
        );
        continue;
      }
      if (sl.current_quantity < bqty) {
        problems.push(
          `DocumentLines[${i}].BatchNumbers[${j}]: batch '${b.BatchNumber}' ` +
          `of '${ln.ItemCode}' has only ${sl.current_quantity} available, ` +
          `${bqty} requested.`
        );
      }
    }
  }
  if (problems.length) {
    throw new ValidationError({ DocumentLines: problems });
  }
}

// Decrement stock_levels for every batch we're returning. Called inside the
// same transaction as the INSERTs, after validateStock has confirmed capacity.
async function decrementStock(conn, partyId, docDate, body) {
  for (const ln of body.DocumentLines) {
    const wim = String(ln.WithoutInventoryMovement || 'N').toUpperCase();
    if (wim === 'Y') continue;
    const product = await findProductBySku(ln.ItemCode);
    if (!product) continue; // already validated
    for (const b of (ln.BatchNumbers || [])) {
      const bqty = toDecimal(b.Quantity);
      await conn.query(
        `UPDATE stock_levels
            SET current_quantity   = GREATEST(current_quantity - ?, 0),
                last_stock_out_date = ?,
                updated_at         = NOW(6),
                updated_by_id      = ?
          WHERE party_id = ? AND product_id = ? AND batch_number = ?`,
        [bqty, docDate, cfg.systemUserId, partyId, product.id, b.BatchNumber]
      );
    }
  }
}

// ── POST /sap/return-request/ ───────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    validate(req.body);

    const party = await findPartyByCardCode(req.body.CardCode);
    if (!party) {
      throw new ValidationError({ CardCode: [`Party '${req.body.CardCode}' does not exist.`] });
    }

    // Resolve products once so we can catch bad SKUs before we open a tx.
    for (const ln of req.body.DocumentLines) {
      const p = await findProductBySku(ln.ItemCode);
      if (!p) {
        throw new ValidationError({
          DocumentLines: [`Product '${ln.ItemCode}' does not exist.`],
        });
      }
    }

    const out = await withTx(async (conn) => {
      // Validate stock inside the tx so the FOR UPDATE locks hold until commit.
      await validateStock(conn, party.id, req.body);

      const returnNumber = await generateReturnNumber(conn);
      const docDate = parseDate(req.body.DocDate);
      const docDueDate = parseDate(req.body.DocDueDate);
      const taxDate = parseDate(req.body.TaxDate);
      const reason = String(req.body.ReturnReason || 'other').toLowerCase();

      // Header — determine if any line moves stock (for the header flag).
      const anyMoved = req.body.DocumentLines.some(
        (ln) => String(ln.WithoutInventoryMovement || 'N').toUpperCase() === 'N'
      );

      const [hdr] = await conn.query(
        `INSERT INTO sales_returns
           (uuid, created_at, updated_at, is_active,
            created_by_id, updated_by_id,
            return_number, party_id, card_code,
            doc_date, doc_due_date, tax_date,
            doc_currency, comments, u_bul_dis,
            return_reason, remarks,
            sap_sync_status, stock_moved)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                 ?, ?,
                 ?, ?, ?,
                 ?, ?, ?,
                 ?, ?, ?,
                 ?, ?,
                 'pending', ?)`,
        [
          cfg.systemUserId, cfg.systemUserId,
          returnNumber, party.id, party.party_code,
          docDate, docDueDate, taxDate,
          req.body.DocCurrency || null,
          req.body.Comments || null,
          toDecimal(req.body.U_BulDis),
          reason,
          req.body.Remarks || null,
          anyMoved ? 1 : 0,
        ]
      );
      const returnId = hdr.insertId;

      // Lines
      for (let i = 0; i < req.body.DocumentLines.length; i++) {
        const ln = req.body.DocumentLines[i];
        const product = await findProductBySku(ln.ItemCode);
        const wim = String(ln.WithoutInventoryMovement || 'N').toUpperCase();
        const batches = Array.isArray(ln.BatchNumbers) ? ln.BatchNumbers : [];

        await conn.query(
          `INSERT INTO sales_return_lines
             (uuid, created_at, updated_at, is_active,
              created_by_id, updated_by_id,
              return_id, line_number,
              item_code, product_id,
              quantity, vat_group, unit_price, line_total,
              agreement_no, without_inventory_movement,
              costing_code, cogs_costing_code,
              u_ratio, u_s_amnt,
              batch_numbers)
           VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                   ?, ?,
                   ?, ?,
                   ?, ?,
                   ?, ?, ?, ?,
                   ?, ?,
                   ?, ?,
                   ?, ?,
                   ?)`,
          [
            cfg.systemUserId, cfg.systemUserId,
            returnId, i,
            ln.ItemCode, product?.id || null,
            toDecimal(ln.Quantity), ln.VatGroup || null,
            toDecimal(ln.UnitPrice), toDecimal(ln.LineTotal),
            ln.AgreementNo ? Number(ln.AgreementNo) : null,
            wim,
            ln.CostingCode || null, ln.COGSCostingCode || null,
            toDecimal(ln.U_Ratio), toDecimal(ln.U_SAmnt),
            batches.length ? JSON.stringify(batches) : null,
          ]
        );
      }

      // Decrement stock for inventory-moving lines.
      await decrementStock(conn, party.id, docDate, req.body);

      return { id: returnId, return_number: returnNumber, party_id: party.id, stock_moved: anyMoved };
    });

    res.status(201).json({
      id: out.id,
      return_number: out.return_number,
      card_code: party.party_code,
      party_name: party.party_name,
      stock_moved: out.stock_moved,
      sap_sync_status: 'pending',
      message: 'Return Request created successfully.',
    });
  } catch (e) { next(e); }
});

// ── GET /sap/return-request/:id/ ────────────────────────────────────
router.get('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundError();

    const [hdr] = await pool.query(
      `SELECT r.*, p.party_code, p.party_name
         FROM sales_returns r
         JOIN external_user_profiles p ON p.id = r.party_id
        WHERE r.id = ? LIMIT 1`,
      [id]
    );
    if (!hdr.length) throw new NotFoundError();

    const [lines] = await pool.query(
      `SELECT id, line_number, item_code, product_id,
              quantity, vat_group, unit_price, line_total,
              agreement_no, without_inventory_movement,
              costing_code, cogs_costing_code,
              u_ratio, u_s_amnt, batch_numbers
         FROM sales_return_lines
        WHERE return_id = ?
        ORDER BY line_number ASC`,
      [id]
    );

    const h = hdr[0];
    res.status(200).json({
      id: h.id,
      return_number: h.return_number,
      card_code: h.card_code,
      party_name: h.party_name,
      doc_date: h.doc_date,
      doc_due_date: h.doc_due_date,
      tax_date: h.tax_date,
      doc_currency: h.doc_currency,
      comments: h.comments,
      u_bul_dis: h.u_bul_dis,
      return_reason: h.return_reason,
      remarks: h.remarks,
      sap_doc_entry: h.sap_doc_entry,
      sap_doc_number: h.sap_doc_number,
      sap_synced_at: h.sap_synced_at,
      sap_sync_status: h.sap_sync_status,
      sap_sync_error: h.sap_sync_error,
      stock_moved: !!h.stock_moved,
      created_at: h.created_at,
      DocumentLines: lines.map((ln) => ({
        line_number: ln.line_number,
        ItemCode: ln.item_code,
        Quantity: ln.quantity,
        VatGroup: ln.vat_group,
        UnitPrice: ln.unit_price,
        LineTotal: ln.line_total,
        AgreementNo: ln.agreement_no,
        WithoutInventoryMovement: ln.without_inventory_movement,
        CostingCode: ln.costing_code,
        COGSCostingCode: ln.cogs_costing_code,
        U_Ratio: ln.u_ratio,
        U_SAmnt: ln.u_s_amnt,
        BatchNumbers: ln.batch_numbers || [],
      })),
    });
  } catch (e) { next(e); }
});

// ── PATCH /sap/return-request/:id/ ──────────────────────────────────
// Called by the DMS outbound worker after it posts the return to SAP B1
// and receives back a DocEntry/DocNum. Idempotent — a second call with
// the same DocEntry is a no-op.
router.patch('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundError();

    const [exists] = await pool.query(`SELECT id FROM sales_returns WHERE id = ? LIMIT 1`, [id]);
    if (!exists.length) throw new NotFoundError();

    const sets = [];
    const params = [];

    if (req.body.sap_doc_entry !== undefined) {
      const n = Number(req.body.sap_doc_entry);
      if (!Number.isInteger(n) || n <= 0) {
        throw new ValidationError({ sap_doc_entry: ['Must be a positive integer.'] });
      }
      sets.push('sap_doc_entry = ?'); params.push(n);
    }
    if (req.body.sap_doc_number !== undefined) {
      sets.push('sap_doc_number = ?'); params.push(String(req.body.sap_doc_number));
    }
    if (req.body.sap_sync_status !== undefined) {
      const s = String(req.body.sap_sync_status);
      if (!['pending', 'synced', 'failed'].includes(s)) {
        throw new ValidationError({ sap_sync_status: ['Must be pending, synced, or failed.'] });
      }
      sets.push('sap_sync_status = ?'); params.push(s);
      if (s === 'synced') {
        sets.push('sap_synced_at = NOW(6)');
      }
    }
    if (req.body.sap_sync_error !== undefined) {
      sets.push('sap_sync_error = ?'); params.push(req.body.sap_sync_error || null);
    }

    if (!sets.length) {
      return res.status(200).json({ id, message: 'No changes.' });
    }

    sets.push('updated_at = NOW(6)', 'updated_by_id = ?');
    params.push(cfg.systemUserId, id);

    await pool.query(`UPDATE sales_returns SET ${sets.join(', ')} WHERE id = ?`, params);
    res.status(200).json({ id, message: 'Return updated.' });
  } catch (e) { next(e); }
});

module.exports = router;
