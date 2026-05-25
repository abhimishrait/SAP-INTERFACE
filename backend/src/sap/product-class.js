// 3.7 Product Class → production_categories
//
// Spec rules:
//   - name must be unique (case-insensitive)   — enforced by the factory
//   - unit (Kg/Ltr/Pcs/etc.) Required          — validated here
//   - status Y/N or 1/0                        — enforced by the factory
//
// Our `production_categories.production_line_id` is NOT NULL — fall back to the
// configured default line if SAP didn't send one.
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');
const { defaultProductionLineId } = require('../lib/lookup');
const cfg = require('../config');

// Common SAP/DMS units. The spec says "Kg, Ltr, Pcs, etc." so we accept the
// canonical short forms plus a few obvious extras. Anything case-insensitively
// outside this list is rejected with a clear 400 (instead of silently persisting
// junk into `description`).
const ALLOWED_UNITS = new Set(
  ['kg','ltr','liter','litre','pcs','pc','box','crate','pouch','bottle','ea','each','g','gm','gram','ml','dz','dozen']
);

const router = express.Router();
const { create, update } = buildSimpleMaster({
  table: 'production_categories',
  extra: async ({ body, mode }) => {
    const errors = {};
    const columns = {};

    // Unit is required on CREATE; on UPDATE it's optional but still validated when present.
    if (mode === 'create' && (body.unit === undefined || body.unit === null || body.unit === '')) {
      errors.unit = ['This field is required.'];
    } else if (body.unit !== undefined && body.unit !== null && body.unit !== '') {
      const u = String(body.unit).trim();
      if (!ALLOWED_UNITS.has(u.toLowerCase())) {
        errors.unit = [`Must be one of: ${[...ALLOWED_UNITS].slice(0,8).join(', ')}, etc.`];
      } else {
        columns.description = `UOM: ${u}`;
      }
    }

    if (mode === 'create') {
      columns.production_line_id = await defaultProductionLineId(cfg.defaults.productionLineCode);
    }
    return { columns, errors };
  },
});
router.post('/', create);
router.put('/', update);
router.put('/:id/', update);
module.exports = router;
