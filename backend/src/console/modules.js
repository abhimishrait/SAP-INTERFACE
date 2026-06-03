// /console/modules — list the 16 SAP modules + live stats per module.
const express = require('express');
const { query } = require('../db');

const router = express.Router();

// Canonical module definitions live on the frontend (src/data/index.ts).
// Here we only return stats keyed by module_id; the frontend joins the two.
router.get('/stats', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT module_id,
              COUNT(*) AS calls_24h,
              SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors_24h,
              AVG(duration_ms) AS avg_ms,
              MAX(created_at) AS last_seen
         FROM sap_sync_logs
        WHERE module_id IS NOT NULL
          AND created_at > NOW() - INTERVAL 24 HOUR
        GROUP BY module_id`
    );
    res.json({ rows });
  } catch (e) { next(e); }
});

router.get('/:moduleId/recent', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, correlation_id AS tx_id, direction, method, path, status_code, duration_ms,
              customer_code, doc_number, distributor_name, created_at
         FROM sap_sync_logs
        WHERE module_id = ?
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.params.moduleId]
    );
    res.json({ module_id: req.params.moduleId, rows });
  } catch (e) { next(e); }
});

module.exports = router;
