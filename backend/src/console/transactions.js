// /console/transactions — feeds the API Logs view.
const express = require('express');
const { query, one } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const where = [];
    // Only show rows written by the new logger; legacy order-sync rows
    // (no module_id) stay hidden from the multi-module console views.
    where.push('module_id IS NOT NULL');
    if (req.query.module) { where.push('module_id = ?'); params.push(req.query.module); }
    if (req.query.method) { where.push('method = ?'); params.push(req.query.method); }
    if (req.query.status) { where.push('status_code = ?'); params.push(Number(req.query.status)); }
    if (req.query.direction) { where.push('direction = ?'); params.push(String(req.query.direction).toUpperCase()); }
    if (req.query.q) {
      where.push('(correlation_id LIKE ? OR distributor_name LIKE ? OR customer_code LIKE ? OR doc_number LIKE ? OR path LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like, like, like, like);
    }
    const wsql = 'WHERE ' + where.join(' AND ');
    const rows = await query(
      `SELECT id, correlation_id AS tx_id, direction, module_id, method, path, resource_id,
              status_code, pipeline_stage, error_message,
              duration_ms, bytes_in, bytes_out, retry_count,
              distributor_name, customer_code, doc_number,
              created_at
         FROM sap_sync_logs
         ${wsql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const total = await one(
      `SELECT COUNT(*) AS c FROM sap_sync_logs ${wsql}`, params
    );
    res.json({ total: Number(total.c), limit, offset, rows });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await one(
      `SELECT id, correlation_id AS tx_id, direction, module_id, method, path, resource_id,
              status_code, pipeline_stage, error_message,
              duration_ms, bytes_in, bytes_out, retry_count,
              distributor_name, customer_code, doc_number,
              remote_ip, user_agent,
              request_headers,
              request_payload  AS request_body,
              response_payload AS response_body,
              correlation_id,
              created_at
         FROM sap_sync_logs
         WHERE id = ? LIMIT 1`, [id]
    );
    if (!row) return res.status(404).json({ detail: 'Not found.' });
    res.json(row);
  } catch (e) { next(e); }
});

module.exports = router;
