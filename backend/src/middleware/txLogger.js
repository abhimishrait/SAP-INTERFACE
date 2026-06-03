// Logs every SAP-facing request/response into sap_sync_logs so the
// console's API Logs / Overview / Sync Queue views have real data to show.
//
// Direction:
//   - INBOUND  = SAP -> DMS (every request this Express app handles under /sap/*)
//   - OUTBOUND = DMS -> SAP (the SL push side; tagged by whoever writes those rows)
//
// This middleware always tags INBOUND. The order-sync table that already lived
// here keeps its existing rows untouched (they have order_id set); we just
// reuse the same table for all 16 modules now.
const crypto = require('crypto');
const { pool } = require('../db');

// Extract the module-id from a path like '/sap/bp-master/' or '/sap/bp-master/123/'
function moduleIdFromPath(p) {
  const m = /^\/sap\/([a-z-]+)/.exec(p || '');
  return m ? m[1] : 'unknown';
}

function resourceIdFromPath(p) {
  const m = /^\/sap\/[a-z-]+\/([^/]+)\/?$/.exec(p || '');
  return m ? m[1] : null;
}

function safeJson(x) {
  if (x === undefined || x === null) return null;
  try { return JSON.stringify(x); } catch { return null; }
}

// Pull useful denormalized fields out of the request body for fast filtering.
function denorm(body) {
  if (!body || typeof body !== 'object') return {};
  return {
    customer_code: body.customer_code || body.bp_code || body.party_code || null,
    doc_number: body.do_number || body.doc_number_so || null,
    distributor_name: body.store_name || body.bp_name || body.party_name || null,
  };
}

// Map an HTTP status code to the legacy `status` column (varchar(20)) so older
// readers that filter on it keep working.
function statusToken(code) {
  if (code >= 200 && code < 300) return 'OK';
  if (code >= 400 && code < 500) return 'REJECTED';
  if (code >= 500) return 'ERROR';
  return 'PENDING';
}

function txLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const correlationId =
    req.header('x-correlation-id') ||
    'txn_' + crypto.randomBytes(6).toString('hex');
  res.setHeader('x-correlation-id', correlationId);

  // Capture response body by hooking res.json
  let capturedBody = null;
  const origJson = res.json.bind(res);
  res.json = (body) => {
    capturedBody = body;
    return origJson(body);
  };

  res.on('finish', () => {
    // Only log SAP-facing requests; console traffic is internal.
    if (!req.originalUrl.startsWith('/sap/')) return;
    const durationMs = Number((process.hrtime.bigint() - start) / 1000000n);
    const moduleId = moduleIdFromPath(req.originalUrl);
    const resourceId = resourceIdFromPath(req.originalUrl);
    const dn = denorm(req.body);
    const stage = res.statusCode < 400 ? 'completed' : res.statusCode >= 500 ? 'failed' : 'rejected';
    const bytesIn = Number(req.header('content-length') || 0);
    const bytesOut = Buffer.byteLength(safeJson(capturedBody) || '', 'utf8');
    const errorMessage =
      req._error?.message ||
      (capturedBody && typeof capturedBody === 'object' && capturedBody.detail) ||
      null;
    // sap_sync_logs.sap_doc_entry / sap_doc_num were on the original table; if
    // the response carries them (delivery-order push) preserve them so the
    // existing order-sync view keeps showing data.
    const sapDocEntry = (capturedBody && typeof capturedBody === 'object' && Number.isInteger(capturedBody.sap_doc_entry))
      ? capturedBody.sap_doc_entry : null;
    const sapDocNum = (capturedBody && typeof capturedBody === 'object' && capturedBody.sap_doc_num)
      ? String(capturedBody.sap_doc_num) : null;

    pool.query(
      `INSERT INTO sap_sync_logs
        (uuid, direction, correlation_id, module_id, method, path, resource_id,
         status, status_code, pipeline_stage, error_message,
         duration_ms, bytes_in, bytes_out, retry_count,
         request_headers, request_payload, response_payload,
         remote_ip, user_agent,
         distributor_name, customer_code, doc_number,
         sap_doc_entry, sap_doc_num,
         attempted_at, created_at, updated_at)
       VALUES (REPLACE(UUID(),'-',''), 'INBOUND', ?, ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, 0,
               ?, ?, ?,
               ?, ?,
               ?, ?, ?,
               ?, ?,
               NOW(6), NOW(6), NOW(6))`,
      [
        correlationId, moduleId, req.method, req.originalUrl, resourceId,
        statusToken(res.statusCode), res.statusCode, stage, errorMessage,
        durationMs, bytesIn, bytesOut,
        safeJson({
          'content-type': req.header('content-type'),
          'user-agent': req.header('user-agent'),
          'x-correlation-id': correlationId,
        }),
        safeJson(req.body), safeJson(capturedBody),
        req.ip, req.header('user-agent') || null,
        dn.distributor_name, dn.customer_code, dn.doc_number,
        sapDocEntry, sapDocNum,
      ]
    ).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[txLogger] failed to persist:', err.message);
    });
  });

  next();
}

module.exports = txLogger;
