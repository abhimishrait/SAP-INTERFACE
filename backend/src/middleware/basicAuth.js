// Spec section 2: HTTP Basic Auth for the SAP-facing endpoints.
const cfg = require('../config');

const expected =
  'Basic ' + Buffer.from(`${cfg.sapAuth.user}:${cfg.sapAuth.pass}`).toString('base64');

function basicAuth(req, res, next) {
  const got = req.header('authorization') || '';
  // Constant-time-ish comparison; small string so length-pad is fine.
  if (got.length !== expected.length || got !== expected) {
    return res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="SalesPort SAP Integration"')
      .json({ detail: 'Authentication credentials were not provided.' });
  }
  next();
}

module.exports = basicAuth;
