// 3.9 Payment Terms → dedicated `payment_terms` table (created by migration 002).
//
// Spec fields:
//   - payment_term_name (string 50, required, unique)
//   - term_days         (string → int, optional)
//   - code              (added by us, optional; auto-derived from name)
//   - status            (Y/N or 1/0)
const express = require('express');
const buildSimpleMaster = require('./_simpleMaster');

const router = express.Router();

const { create, update } = buildSimpleMaster({
  table: 'payment_terms',
  payloadNameKey: 'payment_term_name',
  nameColumn: 'payment_term_name',
  rejectNumericOnly: false,
  extra: async ({ body }) => {
    const columns = {};
    if (body.term_days !== undefined && body.term_days !== null && body.term_days !== '') {
      const n = parseInt(body.term_days, 10);
      if (Number.isFinite(n) && n >= 0) columns.term_days = n;
      else return { errors: { term_days: ['Must be a non-negative integer.'] } };
    }
    return { columns };
  },
});

router.post('/', create);
router.put('/', update);
router.put('/:id/', update);

module.exports = router;
