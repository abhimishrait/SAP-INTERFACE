// /console/overview — top-line stats for the Overview view.
const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    // module_id IS NOT NULL filters out legacy order-sync rows (pre-migration 004)
    // that don't belong to the multi-module API Logs view.
    const [totals] = await query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS ok,
         SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors,
         AVG(duration_ms) AS avg_ms,
         MAX(created_at) AS latest
       FROM sap_sync_logs
       WHERE module_id IS NOT NULL
         AND created_at > NOW() - INTERVAL 24 HOUR`
    );
    const byModule = await query(
      `SELECT module_id, COUNT(*) AS calls,
              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errs
         FROM sap_sync_logs
        WHERE module_id IS NOT NULL
          AND created_at > NOW() - INTERVAL 24 HOUR
        GROUP BY module_id
        ORDER BY calls DESC`
    );
    const recent = await query(
      `SELECT id, correlation_id AS tx_id, direction, module_id, method, path, status_code, duration_ms,
              distributor_name, customer_code, doc_number, created_at
         FROM sap_sync_logs
        WHERE module_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 8`
    );
    res.json({
      window: '24h',
      totals: {
        calls: Number(totals.total) || 0,
        ok: Number(totals.ok) || 0,
        errors: Number(totals.errors) || 0,
        avg_ms: totals.avg_ms ? Number(totals.avg_ms) : 0,
        latest: totals.latest,
      },
      by_module: byModule,
      recent,
    });
  } catch (e) { next(e); }
});

module.exports = router;
