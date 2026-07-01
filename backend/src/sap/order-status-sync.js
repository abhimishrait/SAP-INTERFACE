// 3.16 Order Status Sync → sales_orders.status (+ order_status_history audit row).
const express = require('express');
const { pool, withTx } = require('../db');
const { toOrderStatus } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required } = require('../lib/validate');
const cfg = require('../config');

const router = express.Router();

router.put('/', async (req, res, next) => {
  try {
    required(req.body, ['doc_entry', 'doc_number_so', 'status']);
    const newStatus = toOrderStatus(req.body.status);
    if (!newStatus) {
      throw new ValidationError({ status: ['Supported values: Cancel, Close, Open (or their long forms).'] });
    }
    const docEntry = parseInt(req.body.doc_entry, 10);
    if (!Number.isFinite(docEntry)) throw new ValidationError({ doc_entry: ['Must be numeric.'] });

    const [orders] = await pool.query(
      `SELECT id, status FROM sales_orders
        WHERE sap_doc_entry = ? AND sap_order_number = ? LIMIT 1`,
      [docEntry, req.body.doc_number_so]
    );
    if (!orders.length) throw new NotFoundError('Sales order not found.');

    const order = orders[0];
    await withTx(async (conn) => {
      await conn.query(
        `UPDATE sales_orders
            SET status = ?, updated_at = NOW(6), updated_by_id = ?,
                sap_synced_at = NOW(6), sap_synced_by_id = ?, sap_sync_status = 'synced'
          WHERE id = ?`,
        [newStatus, cfg.systemUserId, cfg.systemUserId, order.id]
      );
      await conn.query(
        `INSERT INTO order_status_history
           (uuid, created_at, updated_at, is_active,
            from_status, to_status, remarks, changed_at, changed_by_id, order_id,
            created_by_id, updated_by_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
                 ?, ?, ?, NOW(6), ?, ?, ?, ?)`,
        [order.status, newStatus, `SAP order-status-sync: ${req.body.status}`,
          cfg.systemUserId, order.id, cfg.systemUserId, cfg.systemUserId]
      );
    });
    res.status(200).json({
      id: order.id,
      doc_entry: docEntry,
      doc_number_so: req.body.doc_number_so,
      previous_status: order.status,
      order_status: newStatus,
      message: 'Order status updated successfully',
    });
  } catch (e) { next(e); }
});

module.exports = router;
