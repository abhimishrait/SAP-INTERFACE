// 3.15 Balance Status Update — DEFERRED.
// Requires either an `outstanding_balance` column on `external_user_profiles`
// or a new `bp_balances` table. See PENDING.md (Q4).
//
// We still validate the payload and party_code existence, but return 501.
const express = require('express');
const { pool } = require('../db');
const { ValidationError, NotFoundError, required, toDecimal } = require('../lib/validate');

const router = express.Router();

router.put('/', async (req, res, next) => {
  try {
    required(req.body, ['party_code', 'updated_amount']);
    const amount = toDecimal(req.body.updated_amount);
    if (amount === null) throw new ValidationError({ updated_amount: ['Must be a valid decimal.'] });
    const [bp] = await pool.query(
      `SELECT id FROM external_user_profiles WHERE party_code = ? LIMIT 1`,
      [req.body.party_code]
    );
    if (!bp.length) throw new NotFoundError(`Business Partner '${req.body.party_code}' not found.`);
    res.status(501).json({
      detail: 'Balance Status Update is deferred. See backend/PENDING.md (Q4).',
      party_code: req.body.party_code,
      updated_amount: amount,
    });
  } catch (e) { next(e); }
});

module.exports = router;
