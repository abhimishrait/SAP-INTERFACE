// Invoice Order — SAP pushes the invoice for a sales order already present
// in DMS (created via SO sync + delivered via delivery-order). The invoice
// is a document that follows delivery — we do NOT change SO.status. The
// SO stays 'delivered' (physical business state); the presence of an
// invoice is signalled to the DMS UI by the sap_invoice_* columns, which
// the FE uses to gate the "Download Invoice" action button.
//
// The DMS side (Django) added these columns in migration
// 0007_salesorder_invoice_fields — sap_invoice_doc_entry,
// sap_invoice_number, sap_invoice_date, sap_invoice_due_date,
// sap_invoice_received_at, sap_invoice_payload. We populate all of them
// so the SO detail view has everything it needs to render the invoice
// without another SAP round-trip.
//
// Payload shape (from live SAP capture, 2026-07-01):
//   {
//     "card_code":      "600032447",           // BP code (must match SO.party)
//     "card_name":      "S.K. STORES",
//     "doc_date":       "2026-07-01",
//     "doc_due_date":   "2026-07-31",
//     "tax_date":       "2026-07-01",
//     "comments":       "SO-... Based On ...",
//     "group_num":      5,
//     "doc_entry_so":   "23047",               // → SO.sap_doc_entry
//     "doc_number_so":  "4786",                // → SO.sap_order_number (lookup key)
//     "invoice_details": [
//       {
//         "line_number": 0, "item_code": "FG102010",
//         "quantity": 100.0, "price": 1536.38,
//         "line_total": 153638.0, "line_total_with_tax": 153638.0,
//         "vat_group": "VAT-13", "ocr_code": "BAG 1", "cogs_ocr_code": "BAG 1",
//         "agr_no": 35247, "batch_number": "STORE100",
//         "mfg_date": "1899-12-30", "expiry_date": "2028-07-02"
//       }, ...
//     ]
//   }
const express = require('express');
const { pool, withTx } = require('../db');
const { ValidationError, NotFoundError, required, parseDate, toDecimal } = require('../lib/validate');
const cfg = require('../config');

const router = express.Router();

function validate(body) {
  const errors = {};
  for (const f of ['card_code', 'doc_date', 'doc_number_so', 'invoice_details']) {
    if (body[f] === undefined || body[f] === null || body[f] === '') errors[f] = ['This field is required.'];
  }
  for (const f of ['doc_date', 'doc_due_date', 'tax_date']) {
    if (body[f] !== undefined && body[f] !== null && body[f] !== '' && !parseDate(body[f])) {
      errors[f] = ['Use YYYY-MM-DD.'];
    }
  }
  if (Array.isArray(body.invoice_details)) {
    if (!body.invoice_details.length) errors.invoice_details = ['At least one line is required.'];
    body.invoice_details.forEach((d, i) => {
      if (!d.item_code) errors.invoice_details = [`Line ${i + 1}: item_code is required.`];
      if (toDecimal(d.quantity) === null || toDecimal(d.quantity) <= 0) {
        errors.invoice_details = [`Line ${i + 1}: quantity must be > 0.`];
      }
      if (toDecimal(d.price) === null || toDecimal(d.price) < 0) {
        errors.invoice_details = [`Line ${i + 1}: price must be ≥ 0.`];
      }
    });
  } else if (body.invoice_details !== undefined) {
    errors.invoice_details = ['Must be a non-empty list.'];
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

router.post('/', async (req, res, next) => {
  try {
    validate(req.body);

    const out = await withTx(async (conn) => {
      const docNumberSo = String(req.body.doc_number_so).trim();
      const cardCode    = String(req.body.card_code).trim();

      // Locate the existing SO — invoices always follow an order in DMS.
      const [existing] = await conn.query(
        `SELECT so.id, so.party_id, eup.party_code
           FROM sales_orders so
           LEFT JOIN external_user_profiles eup ON eup.id = so.party_id
          WHERE so.sap_order_number = ?
          LIMIT 1`,
        [docNumberSo]
      );
      if (!existing.length) {
        throw new NotFoundError(
          `No sales order with sap_order_number '${docNumberSo}' — cannot record invoice. Sync SO + DO first, then re-push the invoice.`
        );
      }
      const so = existing[0];

      // Defensive: reject if SAP's card_code doesn't match the SO's linked BP.
      // Prevents accidentally invoicing the wrong customer if SAP references
      // the wrong SO number.
      if (so.party_code && cardCode && so.party_code !== cardCode) {
        throw new ValidationError({
          card_code: [`Card code '${cardCode}' does not match sales order's BP ('${so.party_code}').`],
        });
      }

      const orderId = so.id;
      const invoiceRemark =
        `SAP INV ${req.body.doc_entry_so || ''}/${docNumberSo}; ` +
        `doc_date ${req.body.doc_date}; ` +
        `due ${req.body.doc_due_date || '-'}`;

      // SAP invoice fields — parsed once for both the UPDATE and the log.
      // doc_entry / doc_number here are for the INVOICE (not the SO); SAP
      // sometimes omits them (e.g. on preview pushes), so we tolerate NULL.
      const invoiceDocEntry = parseInt(req.body.doc_entry, 10) || null;
      const invoiceDocNum   = req.body.doc_number ? String(req.body.doc_number) : null;
      const invoiceDate     = parseDate(req.body.doc_date) || null;
      const invoiceDueDate  = req.body.doc_due_date ? (parseDate(req.body.doc_due_date) || null) : null;

      // DO NOT change status — the SO stays 'delivered' (the physical
      // business state). Invoice presence is signalled by the
      // sap_invoice_* columns, which drive the FE "Download Invoice"
      // action.
      await conn.query(
        `UPDATE sales_orders SET
           sap_invoice_doc_entry   = ?,
           sap_invoice_number      = ?,
           sap_invoice_date        = ?,
           sap_invoice_due_date    = ?,
           sap_invoice_received_at = NOW(6),
           sap_invoice_payload     = ?,
           sap_sync_status         = 'SYNCED',
           sap_synced_at           = NOW(6),
           sap_synced_by_id        = ?,
           updated_at              = NOW(6),
           updated_by_id           = ?,
           remarks                 = CONCAT_WS(' | ', NULLIF(remarks, ''), ?)
         WHERE id = ?`,
        [
          invoiceDocEntry,
          invoiceDocNum,
          invoiceDate,
          invoiceDueDate,
          JSON.stringify(req.body),
          cfg.systemUserId,
          cfg.systemUserId,
          invoiceRemark,
          orderId,
        ]
      );

      // Keep the raw payload in sap_sync_logs too — this is the audit
      // trail that the "SAP Sync Details" modal reads, and it's
      // independent of the sap_invoice_payload column (which the FE
      // uses just for the download endpoint).
      await conn.query(
        `INSERT INTO sap_sync_logs
           (uuid, created_at, updated_at, is_active, status, sap_doc_entry, sap_doc_num,
            request_payload, attempted_at, order_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, 'SYNCED', ?, ?, ?, NOW(6), ?)`,
        [invoiceDocEntry || parseInt(req.body.doc_entry_so, 10) || null, invoiceDocNum || docNumberSo, JSON.stringify(req.body), orderId]
      );

      return {
        id: orderId,
        party_id: so.party_id,
        lines_count: req.body.invoice_details.length,
        sap_invoice_doc_entry: invoiceDocEntry,
        sap_invoice_number: invoiceDocNum,
      };
    });

    res.status(200).json({
      ...out,
      card_code: req.body.card_code,
      doc_number_so: req.body.doc_number_so,
      doc_entry_so: req.body.doc_entry_so,
      message: 'Invoice recorded on sales order (status unchanged; SO remains at its current stage).',
    });
  } catch (e) { next(e); }
});

module.exports = router;
