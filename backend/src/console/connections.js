// /console/connections — health check for the configured connections.
const express = require('express');
const { one } = require('../db');
const cfg = require('../config');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const t0 = Date.now();
    let dbOk = true, dbErr = null;
    try { await one('SELECT 1 AS ok'); } catch (e) { dbOk = false; dbErr = e.message; }
    const dbMs = Date.now() - t0;
    res.json({
      connections: [
        {
          name: 'SalesPort DMS · PROD',
          side: 'dms',
          host: `${cfg.db.host}:${cfg.db.port}/${cfg.db.database}`,
          protocol: 'mysql',
          auth: 'user/password',
          status: dbOk ? 'healthy' : 'down',
          latency: dbMs,
          error: dbErr,
        },
        {
          name: 'SAP · PROD (inbound)',
          side: 'sap',
          host: `localhost:${cfg.port}/sap/*`,
          protocol: 'REST/JSON',
          auth: 'HTTP Basic',
          status: 'healthy',
          latency: 0,
        },
      ],
    });
  } catch (e) { next(e); }
});

module.exports = router;
