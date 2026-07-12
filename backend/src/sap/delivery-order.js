// 3.14 Delivery Order → delivery_orders + delivery_order_lines + stock_transactions.
//
// SAP posts a DO for an SO that already exists in DMS (created via portal or
// synced via SAP outbound). We write the DO header + lines, auto-generate a
// stock-in transaction, and RE-COMPUTE the SO's status from cumulative
// delivery_order_lines vs order_items(is_scheme_item=0). Multiple DOs per SO
// (partial delivery, split-per-production-unit) are supported natively:
// each DO is idempotent on sap_do_entry.
//
// Explicitly NOT touched by this handler:
//   • sales_orders.order_number   — DMS-native, shown in the UI
//   • sales_orders.subtotal / tax_amount / total_amount — derived from
//     order_items (buy lines + scheme benefit rows); overwriting from DO
//     totals would wipe scheme accounting.
//   • sales_orders.order_date     — audit-only; DO date lives on delivery_orders.
//   • order_items                 — those belong to the SO. Deleting them
//     violates schemes_utilization.so_line PROTECT FKs and destroys scheme
//     benefit child rows. DO lines live only on delivery_order_lines.
//
// Status ('delivered' vs 'partially_delivered') is Django-compatible lowercase.
// See DeliveryOrderInboundView._update_order_status in the DMS repo for the
// canonical algorithm this mirrors.
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

// Resolve each DO line's product_id up-front so failures surface before any writes.
// DOES NOT touch order_items — those belong to the SO and were written at order-create
// time (buy lines + auto-generated scheme child rows). Overwriting them here would
// destroy scheme benefit lines and blow up on SchemeUtilization.so_line PROTECT FKs.
async function resolveLineProducts(doDetails) {
  const resolved = [];
  for (const d of doDetails) {
    const productId = await findProductIdBySku(d.item_code);
    if (!productId) throw new ValidationError({ do_details: [`Product '${d.item_code}' does not exist.`] });
    resolved.push({ product_id: productId, item_code: d.item_code });
  }
  return resolved;
}

// After the DO + its lines are persisted, compute the SO's new status the same
// way Django's DeliveryOrderInboundView._update_order_status does:
//   • ordered qty per SKU = SUM(order_items.quantity) WHERE is_scheme_item=0
//   • dispatched qty per SKU = SUM(delivery_order_lines.quantity) across ALL DOs for the SO
//   • fully_delivered = every ordered SKU's dispatched >= ordered
// Returns { newStatus, orderedBySku, dispatchedBySku } for logging.
async function computeSoStatus(conn, orderId) {
  const [ordered] = await conn.query(
    `SELECT p.sku_code AS sku, oi.quantity AS qty
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ? AND oi.is_scheme_item = 0`,
    [orderId]
  );
  const orderedBySku = {};
  for (const r of ordered) {
    orderedBySku[r.sku] = (orderedBySku[r.sku] || 0) + Number(r.qty);
  }

  const [dispatched] = await conn.query(
    `SELECT dol.item_code AS sku, dol.quantity AS qty
       FROM delivery_order_lines dol
       JOIN delivery_orders do_hdr ON do_hdr.id = dol.delivery_order_id
      WHERE do_hdr.order_id = ?`,
    [orderId]
  );
  const dispatchedBySku = {};
  for (const r of dispatched) {
    dispatchedBySku[r.sku] = (dispatchedBySku[r.sku] || 0) + Number(r.qty);
  }

  const skuList = Object.keys(orderedBySku);
  let fullyDelivered = skuList.length > 0;
  for (const sku of skuList) {
    if ((dispatchedBySku[sku] || 0) < orderedBySku[sku]) {
      fullyDelivered = false;
      break;
    }
  }
  return {
    newStatus: fullyDelivered ? 'delivered' : 'partially_delivered',
    orderedBySku,
    dispatchedBySku,
  };
}

// Shared handler used by both POST /sap/delivery-order/ and PUT /:id/.
// Idempotency: the DO's identity is `sap_do_entry` (unique on delivery_orders).
// Repeat calls with the same sap_do_entry replace the DO's lines + reverse the
// prior stock-in, so retries can never double-count inventory.
async function handleDoUpsert(req, res, next) {
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
      // Multi-production-unit orders: DMS pushes one SO to SAP per
      // production unit and gets N distinct DocNums back. Only the
      // FIRST push's DocNum lands on sales_orders.sap_order_number;
      // every push is recorded in sap_sync_logs with its own
      // sap_doc_num / sap_doc_entry. Match via either table so DOs
      // for the 2nd/3rd/… PU still resolve to their parent SO.
      const [existing]  = await conn.query(
        `SELECT so.id, so.party_id, so.status
           FROM sales_orders so
          WHERE so.sap_order_number = ?
             OR (? IS NOT NULL AND so.sap_doc_entry = ?)
             OR so.id IN (
                  SELECT order_id FROM sap_sync_logs
                   WHERE status = 'success'
                     AND (sap_doc_num = ? OR (? IS NOT NULL AND sap_doc_entry = ?))
                )
          LIMIT 1`,
        [docNumberSo, docEntry, docEntry, docNumberSo, docEntry, docEntry]
      );

      let orderId;
      let currentStatus;
      if (existing.length) {
        // DO fulfils a known SO. Stamp SAP sync metadata + append DO ref to remarks.
        // Deliberately DO NOT touch:
        //   • order_number  — that's the DMS-native SO number the UI already displays
        //   • subtotal / tax_amount / total_amount — those are derived from order_items
        //     (buy lines + scheme child rows). Overwriting them from DO totals would
        //     wipe scheme benefit accounting.
        //   • order_date — the SO's original order date must stay for audit; the DO's
        //     do_date is stored separately on delivery_orders.
        //   • status — computed below from cumulative dispatched vs ordered qty.
        orderId = existing[0].id;
        currentStatus = existing[0].status;
        await conn.query(
          `UPDATE sales_orders SET
             sap_doc_entry      = COALESCE(?, sap_doc_entry),
             sap_sync_status    = 'synced',
             sap_synced_at      = NOW(6),
             sap_synced_by_id   = ?,
             updated_at         = NOW(6),
             updated_by_id      = ?,
             remarks            = CONCAT_WS(' | ', NULLIF(remarks, ''), ?)
           WHERE id = ?`,
          [
            docEntry,
            cfg.systemUserId,
            cfg.systemUserId,
            `SAP DO ${req.body.do_entry} / ${req.body.do_number}; invoice ${req.body.invoice_number || ''}`,
            orderId,
          ]
        );
      } else {
        // No SO with that sap_order_number — the DO arrived before the SO was
        // synced. Reject with a clear error rather than misattributing the DO
        // to a random BP; SAP will retry once the SO exists.
        throw new ValidationError({
          doc_number_so: [`No sales order with sap_order_number '${docNumberSo}' — cannot derive customer. Sync the SO first, then re-push the DO.`],
        });
      }

      // Resolve product IDs for every DO line (no order_items writes — DO lines
      // live only on delivery_order_lines below).
      const lines = await resolveLineProducts(req.body.do_details);

      // ── delivery_orders header + lines ────────────────────────
      // The DMS FE reads has_delivery_order via
      //   SalesOrder.delivery_orders.exists()
      // to gate the "Download DO" action, and the /do-download/
      // endpoint reads DO + DO lines to render the Sujal template.
      // If we skip these tables, the SO looks delivered but the
      // download button never appears. Upsert both here.
      const [doExisting] = await conn.query(
        `SELECT id, stock_transaction_id FROM delivery_orders WHERE sap_do_entry = ? LIMIT 1`,
        [String(req.body.do_entry)]
      );

      let deliveryOrderId;
      if (doExisting.length) {
        // Replace-all semantics on repeat push
        deliveryOrderId = doExisting[0].id;
        await conn.query(`DELETE FROM delivery_order_lines WHERE delivery_order_id = ?`, [deliveryOrderId]);
        await conn.query(
          `UPDATE delivery_orders SET
             updated_at            = NOW(6),
             updated_by_id         = ?,
             order_id              = ?,
             sap_do_number         = ?,
             sap_doc_entry         = ?,
             sap_doc_number_so     = ?,
             invoice_number        = ?,
             do_date               = ?,
             do_amount             = ?,
             do_tax                = ?,
             do_total              = ?,
             production_unit_name  = ?
           WHERE id = ?`,
          [
            cfg.systemUserId,
            orderId,
            String(req.body.do_number),
            String(req.body.doc_entry || ''),
            docNumberSo,
            req.body.invoice_number || null,
            parseDate(req.body.do_date),
            toDecimal(req.body.do_amount),
            toDecimal(req.body.do_tax),
            toDecimal(req.body.do_total),
            String(req.body.production_unit || ''),
            deliveryOrderId,
          ]
        );
      } else {
        const [ins] = await conn.query(
          `INSERT INTO delivery_orders
             (uuid, created_at, updated_at, is_active,
              created_by_id, updated_by_id,
              sap_do_entry, sap_do_number,
              order_id, sap_doc_entry, sap_doc_number_so,
              invoice_number, do_date, do_amount, do_tax, do_total,
              production_unit_name)
           VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                   ?, ?,
                   ?, ?,
                   ?, ?, ?,
                   ?, ?, ?, ?, ?,
                   ?)`,
          [
            cfg.systemUserId, cfg.systemUserId,
            String(req.body.do_entry), String(req.body.do_number),
            orderId, String(req.body.doc_entry || ''), docNumberSo,
            req.body.invoice_number || null,
            parseDate(req.body.do_date),
            toDecimal(req.body.do_amount),
            toDecimal(req.body.do_tax),
            toDecimal(req.body.do_total),
            String(req.body.production_unit || ''),
          ]
        );
        deliveryOrderId = ins.insertId;
      }

      // Insert DO lines — one row per do_details entry.
      for (const d of req.body.do_details) {
        const productId = await findProductIdBySku(d.item_code);
        if (!productId) throw new ValidationError({
          do_details: [`Product '${d.item_code}' does not exist.`],
        });
        await conn.query(
          `INSERT INTO delivery_order_lines
             (uuid, created_at, updated_at, is_active,
              created_by_id, updated_by_id,
              delivery_order_id, item_code, product_id,
              rate, quantity, uom, amount,
              batch_number, mfg_date, expiry_date)
           VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                   ?, ?,
                   ?, ?, ?,
                   ?, ?, ?, ?,
                   ?, ?, ?)`,
          [
            cfg.systemUserId, cfg.systemUserId,
            deliveryOrderId, d.item_code, productId,
            toDecimal(d.rate), toDecimal(d.quantity), d.uom || 'CTN', toDecimal(d.amount),
            d.batch_number || null, parseDate(d.mfg_date), parseDate(d.expiry_date),
          ]
        );
      }

      // ── Auto stock-in on the dealer + StockLevel increment ─────────
      // The DMS FE's My Inventory report reads directly from stock_levels
      // (party × product × batch → current_quantity). Without this block
      // the SO shows Delivered but the dealer's inventory never moves.
      //
      // On a re-push of the same DO (sap_do_entry match), we reverse the
      // prior stock-in first: decrement stock_levels for each item then
      // delete the transaction rows. Then insert fresh transaction +
      // items and re-increment stock_levels. Keeps replays idempotent.
      const partyId = existing[0].party_id;

      // Reverse prior stock_transaction linked to this DO (if any).
      const [priorTxn] = await conn.query(
        `SELECT stock_transaction_id FROM delivery_orders WHERE id = ? LIMIT 1`,
        [deliveryOrderId]
      );
      const priorTxnId = priorTxn[0]?.stock_transaction_id || null;
      if (priorTxnId) {
        const [priorItems] = await conn.query(
          `SELECT product_id, batch_number, quantity FROM stock_transaction_items WHERE stock_transaction_id = ?`,
          [priorTxnId]
        );
        for (const it of priorItems) {
          await conn.query(
            `UPDATE stock_levels
                SET current_quantity = GREATEST(current_quantity - ?, 0),
                    updated_at = NOW(6)
              WHERE party_id = ? AND product_id = ? AND batch_number = ?`,
            [it.quantity, partyId, it.product_id, it.batch_number || '']
          );
        }
        await conn.query(`UPDATE delivery_orders SET stock_transaction_id = NULL WHERE id = ?`, [deliveryOrderId]);
        await conn.query(`DELETE FROM stock_transaction_items WHERE stock_transaction_id = ?`, [priorTxnId]);
        await conn.query(`DELETE FROM stock_transactions WHERE id = ?`, [priorTxnId]);
      }

      // Generate the next SI-YYYY-XXXX transaction number.
      const year = new Date().getFullYear();
      const prefix = `SI-${year}-`;
      const [lastTxn] = await conn.query(
        `SELECT transaction_number FROM stock_transactions
          WHERE transaction_number LIKE ?
          ORDER BY transaction_number DESC LIMIT 1`,
        [`${prefix}%`]
      );
      const lastSeq = lastTxn[0]
        ? parseInt(String(lastTxn[0].transaction_number).split('-').pop(), 10) || 0
        : 0;
      const txnNumber = `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;

      const [txnInsert] = await conn.query(
        `INSERT INTO stock_transactions
           (uuid, created_at, updated_at, is_active,
            created_by_id, updated_by_id,
            transaction_number, transaction_type, transaction_date,
            order_id, party_id,
            grn_number, invoice_number, invoice_date,
            remarks)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                 ?, ?,
                 ?, 'stock_in', ?,
                 ?, ?,
                 ?, ?, ?,
                 ?)`,
        [
          cfg.systemUserId, cfg.systemUserId,
          txnNumber, parseDate(req.body.do_date),
          orderId, partyId,
          String(req.body.do_number),
          req.body.invoice_number || null, parseDate(req.body.do_date),
          `Auto stock-in from SAP DO ${req.body.do_number}`,
        ]
      );
      const stockTxnId = txnInsert.insertId;

      // Insert items + increment stock_levels per line.
      for (const d of req.body.do_details) {
        const productId = await findProductIdBySku(d.item_code);
        if (!productId) continue;  // already validated above; safe fallback
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
                   ?, ?, ?, ?,
                   ?, ?, ?,
                   ?, ?)`,
          [
            cfg.systemUserId, cfg.systemUserId,
            stockTxnId, productId,
            batch, uom, qty,
            mfg, exp,
          ]
        );

        // Upsert stock_levels — unique on (party, product, batch).
        // Existing row: current_quantity += qty, refresh dates. New row: insert with qty.
        const [existingSL] = await conn.query(
          `SELECT id, current_quantity FROM stock_levels
            WHERE party_id = ? AND product_id = ? AND batch_number = ? LIMIT 1`,
          [partyId, productId, batch]
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
            [qty, parseDate(req.body.do_date), mfg, exp, cfg.systemUserId, existingSL[0].id]
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
              mfg, exp, parseDate(req.body.do_date),
            ]
          );
        }
      }

      // Link the stock transaction back to the delivery order.
      await conn.query(
        `UPDATE delivery_orders SET stock_transaction_id = ? WHERE id = ?`,
        [stockTxnId, deliveryOrderId]
      );

      // Compute the SO's new status from cumulative delivery_order_lines vs
      // ordered qty per SKU. Multi-DO scenarios (partial delivery, split by
      // production unit) work correctly here because every previously-inserted
      // DO's lines already exist and are summed with the current one.
      // Terminal states (cancelled/closed) are preserved.
      let statusChanged = false;
      let newStatus = currentStatus;
      if (currentStatus !== 'cancelled' && currentStatus !== 'closed') {
        const { newStatus: computed } = await computeSoStatus(conn, orderId);
        if (computed !== currentStatus) {
          await conn.query(
            `UPDATE sales_orders SET status = ?, updated_at = NOW(6), updated_by_id = ? WHERE id = ?`,
            [computed, cfg.systemUserId, orderId]
          );
          // Audit trail row so the SO history in the UI reflects who/why.
          await conn.query(
            `INSERT INTO order_status_history
               (uuid, created_at, updated_at, is_active,
                created_by_id, updated_by_id, changed_by_id,
                order_id, from_status, to_status, remarks)
             VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                     ?, ?, ?,
                     ?, ?, ?, ?)`,
            [
              cfg.systemUserId, cfg.systemUserId, cfg.systemUserId,
              orderId, currentStatus, computed,
              `Auto: SAP DO ${req.body.do_number} received (do_entry=${req.body.do_entry})`,
            ]
          );
          statusChanged = true;
          newStatus = computed;
        }
      }

      await conn.query(
        `INSERT INTO sap_sync_logs
          (uuid, created_at, updated_at, is_active, status, sap_doc_entry, sap_doc_num,
           request_payload, attempted_at, order_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, 'success', ?, ?, ?, NOW(6), ?)`,
        [docEntry, docNumberSo, JSON.stringify(req.body), orderId]
      );

      return {
        id: orderId,
        mode: doExisting.length ? 'do_updated' : 'do_created',
        party_id: partyId,
        lines,
        delivery_order_id: deliveryOrderId,
        stock_transaction_number: txnNumber,
        so_status: newStatus,
        so_status_changed: statusChanged,
      };
    });

    res.status(out.mode === 'do_updated' ? 200 : 201).json({
      ...out,
      do_entry: req.body.do_entry,
      do_number: req.body.do_number,
      doc_entry: req.body.doc_entry,
      doc_number_so: req.body.doc_number_so,
      message: out.mode === 'do_updated'
        ? 'Delivery Order updated on existing sales order.'
        : 'Delivery Order created successfully',
    });
  } catch (e) { next(e); }
}

router.post('/', handleDoUpsert);

// PUT — SAP re-push of the same DO. Contract: the URL :id was originally the
// sales_orders.id, but the DO's own identity is sap_do_entry (unique per DO).
// A single SO can have many DOs (partial delivery, split by production unit),
// so we let the body's sap_do_entry drive the upsert and treat :id as a
// consistency check: the resolved SO must match. Behaviour is otherwise
// identical to POST — same status recomputation, same stock reversal, same
// delivery_order_lines replace-all semantics on the matching DO.
router.put('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [exists] = await pool.query(`SELECT id, sap_order_number FROM sales_orders WHERE id = ? LIMIT 1`, [id]);
    if (!exists.length) throw new NotFoundError();

    // Force full-body validation — a PUT-replace still needs every field the
    // handler references, so falling back to 'update' mode masked missing
    // required fields and produced silent corruption on partial payloads.
    validate(req.body, 'create');

    // Sanity: if body carries doc_number_so, it must reference the URL's SO
    // to avoid cross-SO writes. Multi-production-unit SOs have multiple
    // valid SAP DocNums (one per push, tracked in sap_sync_logs); accept
    // any of them, not just the one stored on sales_orders.sap_order_number.
    if (req.body.doc_number_so) {
      const provided = String(req.body.doc_number_so).trim();
      if (provided !== exists[0].sap_order_number) {
        const [logMatch] = await pool.query(
          `SELECT 1 FROM sap_sync_logs
            WHERE order_id = ? AND status = 'success' AND sap_doc_num = ?
            LIMIT 1`,
          [id, provided]
        );
        if (!logMatch.length) {
          throw new ValidationError({
            doc_number_so: [`doc_number_so does not match any SAP DocNum on sales_order id=${id}.`],
          });
        }
      }
    }

    // Delegate to the shared upsert handler — identical behavior to POST.
    return handleDoUpsert(req, res, next);
  } catch (e) { next(e); }
});

module.exports = router;
