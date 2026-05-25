const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cfg = require('./config');
const basicAuth = require('./middleware/basicAuth');
const txLogger = require('./middleware/txLogger');
const { notFound, errorHandler } = require('./middleware/errors');
const sapRouter = require('./sap/router');
const consoleRouter = require('./console/router');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(cors({ origin: cfg.corsOrigin, credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

// Liveness
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// SAP-facing: HTTP Basic + transaction logging
app.use('/sap', basicAuth, txLogger, sapRouter);

// Console-facing: open (the Next.js app fronts it).
app.use('/console', consoleRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(cfg.port, () => {
  // eslint-disable-next-line no-console
  console.log(`SalesPort backend listening on http://localhost:${cfg.port}`);
  console.log(`  SAP endpoints (Basic ${cfg.sapAuth.user}):  /sap/*`);
  console.log(`  Console APIs (CORS ${cfg.corsOrigin}):       /console/*`);
});
