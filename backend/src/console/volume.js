// /console/volume — time-bucketed request counts split by method.
// Default: last 48 buckets of 30 min each (24h window) for the Overview bar chart.
const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const bucketMin = Math.max(1, Math.min(Number(req.query.bucketMinutes) || 30, 1440));
    const buckets   = Math.max(1, Math.min(Number(req.query.buckets) || 48, 200));
    const winMin    = bucketMin * buckets;

    // Group by bucket index from "now" going backwards. We round down each row's
    // created_at to its bucket boundary and count by method.
    const rows = await query(
      `SELECT
         FLOOR(TIMESTAMPDIFF(MINUTE, created_at, NOW()) / ?) AS bucket_idx,
         method,
         COUNT(*) AS c
       FROM sap_sync_logs
       WHERE module_id IS NOT NULL
         AND created_at >= NOW() - INTERVAL ? MINUTE
       GROUP BY bucket_idx, method`,
      [bucketMin, winMin]
    );

    // Pre-fill array of buckets (newest at end, like the chart expects)
    const arr = Array.from({ length: buckets }, () => ({ post: 0, put: 0, total: 0 }));
    for (const r of rows) {
      const idx = buckets - 1 - Number(r.bucket_idx); // newest bucket = last
      if (idx < 0 || idx >= buckets) continue;
      const c = Number(r.c);
      if (r.method === 'POST') arr[idx].post += c;
      else if (r.method === 'PUT') arr[idx].put += c;
      arr[idx].total += c;
    }

    const peak = arr.reduce((m, b) => Math.max(m, b.total), 0);
    res.json({
      bucket_minutes: bucketMin,
      buckets,
      window_minutes: winMin,
      peak_total: peak,
      data: arr,
    });
  } catch (e) { next(e); }
});

module.exports = router;
