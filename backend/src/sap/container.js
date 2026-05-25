// 3.5 Container → packaging_types
//
// SAP payload accepts:
//   - name   (required) — packaging name, e.g. "CRATE", "POUCH"
//   - code   (optional) — stable identifier; auto-derived from name if absent
//   - level  (optional) — PRIMARY (default), SECONDARY, or TERTIARY.
//                         Products(3.13) references primary_selling_unit_name AND
//                         secondary_selling_unit_name, so SAP must be able to push
//                         containers at either level.
//   - status (required) — Y/N or 1/0
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');
const { ValidationError } = require('../lib/validate');

const ALLOWED_LEVELS = new Set(['PRIMARY', 'SECONDARY', 'TERTIARY']);

function normalizeLevel(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  // Friendly aliases
  if (s === 'PRIMARY' || s === 'P' || s === '1') return 'PRIMARY';
  if (s === 'SECONDARY' || s === 'S' || s === '2') return 'SECONDARY';
  if (s === 'TERTIARY' || s === 'T' || s === '3') return 'TERTIARY';
  return s; // returned as-is so the validator can flag it
}

const router = express.Router();
const { create, update } = buildSimpleMaster({
  table: 'packaging_types',
  extra: async ({ body, mode }) => {
    const lvl = normalizeLevel(body.level);
    if (lvl !== null) {
      if (!ALLOWED_LEVELS.has(lvl)) {
        return { errors: { level: ['Must be one of: PRIMARY, SECONDARY, TERTIARY.'] } };
      }
      return { columns: { level: lvl } };
    }
    // Default to PRIMARY on create when SAP did not send a level.
    if (mode === 'create') return { columns: { level: 'PRIMARY' } };
    return {};
  },
});
router.post('/', create);
router.put('/', update);
router.put('/:id/', update);
module.exports = router;
