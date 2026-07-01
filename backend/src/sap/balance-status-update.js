// 3.15 Balance Status Update — SAP pushes the BP's outstanding balance.
//   PUT /sap/balance-status-update/           (body: { party_code, updated_amount })
//   PUT /sap/balance-status-update/{whatever}/  (URL segment ignored; body wins)
//
// SAP's actual URL includes the DMS party_id (e.g. .../770/) but that segment
// is ignored — body.party_code is canonical. Matches the "prefer body" pattern
// used by BP master / products / delivery-order.
//
// Persists to external_user_profiles.outstanding_balance (+ audit stamps).
const express = require('express');
const { pool } = require('../db');
const { ValidationError, NotFoundError, required, toDecimal } = require('../lib/validate');
const cfg = require('../config');

const router = express.Router();

async function handler(req, res, next) {
  try {
    required(req.body, ['party_code', 'updated_amount']);
    const amount = toDecimal(req.body.updated_amount);
    // updated_amount may legitimately be negative (customer overpaid / credit).
    if (amount === null) throw new ValidationError({ updated_amount: ['Must be a valid decimal.'] });

    const partyCode = String(req.body.party_code).trim();
    const [bp] = await pool.query(
      `SELECT id, party_code, outstanding_balance FROM external_user_profiles WHERE party_code = ? LIMIT 1`,
      [partyCode]
    );
    if (!bp.length) throw new NotFoundError(`Business Partner '${partyCode}' not found.`);
    const previous = bp[0].outstanding_balance;

    await pool.query(
      `UPDATE external_user_profiles
          SET outstanding_balance   = ?,
              balance_updated_at    = NOW(6),
              balance_updated_by_id = ?,
              updated_at            = NOW(6),
              updated_by_id         = ?
        WHERE id = ?`,
      [amount, cfg.systemUserId, cfg.systemUserId, bp[0].id]
    );

    res.status(200).json({
      id: bp[0].id,
      party_code: partyCode,
      previous_balance: Number(previous),
      outstanding_balance: amount,
      message: 'Balance updated.',
    });
  } catch (e) { next(e); }
}

// Two mounts so SAP can hit either shape.
router.put('/', handler);
router.put('/:party_ref/', handler);

module.exports = router;
