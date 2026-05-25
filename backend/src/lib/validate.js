// DRF-style validation error: throw ValidationError({ field: [msg, ...] }) and the
// errors middleware will turn it into HTTP 400 with the spec's response body shape.
class ValidationError extends Error {
  constructor(errors) {
    super('Validation failed');
    this.errors = errors;
    this.statusCode = 400;
  }
}

class NotFoundError extends Error {
  constructor(detail = 'Not found.') {
    super(detail);
    this.errors = { detail };
    this.statusCode = 404;
  }
}

// Reject empty/null/undefined/blank strings. Treats 0 and false as present.
function required(obj, fields) {
  const errs = {};
  for (const f of fields) {
    const v = obj?.[f];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      errs[f] = ['This field is required.'];
    }
  }
  if (Object.keys(errs).length) throw new ValidationError(errs);
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s));
}

// Returns YYYY-MM-DD if parseable, else null.
function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  return str;
}

function toDecimal(s) {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function hasAlpha(s) {
  return /[A-Za-z]/.test(String(s));
}

module.exports = {
  ValidationError, NotFoundError,
  required, isEmail, parseDate, toDecimal, hasAlpha,
};
