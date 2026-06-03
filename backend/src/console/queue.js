// /console/queue — Sync Queue view. We derive a synthetic queue from
// sap_sync_logs rows in flight (none if all completed) + recent rows.
const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const inFlight = await query(
      `SELECT id, correlation_id AS job_id, direction, module_id, method, path, pipeline_stage,
              created_at, duration_ms
         FROM sap_sync_logs
        WHERE module_id IS NOT NULL
          AND pipeline_stage NOT IN ('completed', 'failed', 'rejected')
        ORDER BY created_at DESC
        LIMIT 50`
    );
    const recent = await query(
      `SELECT id, correlation_id AS job_id, direction, module_id, method, path, pipeline_stage,
              status_code, error_message, duration_ms, created_at
         FROM sap_sync_logs
        WHERE module_id IS NOT NULL
          AND pipeline_stage IN ('completed', 'failed', 'rejected')
        ORDER BY created_at DESC
        LIMIT 30`
    );
    res.json({ in_flight: inFlight, recent });
  } catch (e) { next(e); }
});

module.exports = router;
