// Last-mile error formatter: turns ValidationError/NotFoundError into the
// DRF-style body shape the spec documents (section 5).
const { ValidationError, NotFoundError } = require('../lib/validate');

function notFound(req, res) {
  res.status(404).json({ detail: 'Not found.' });
}

function errorHandler(err, req, res, _next) {
  // Persist hint on the request so txLogger can capture it.
  req._error = err;

  if (err instanceof ValidationError) {
    return res.status(400).json(err.errors);
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json(err.errors);
  }
  // MySQL duplicate key
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({ detail: 'This value already exists.' });
  }
  // eslint-disable-next-line no-console
  console.error('[500]', err);
  return res.status(500).json({ detail: 'Internal server error.' });
}

module.exports = { notFound, errorHandler };
