// 3.2 Blanket Agreement → dedicated `blanket_agreements` + `blanket_agreement_lines` tables
// (created by migration 002). Previously rode on top of schemes/scheme_rules — that worked
// but the data shape didn't match the spec 1:1, so we moved to a purpose-built table.
const express = require('express');
const { pool, withTx } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required, parseDate, toDecimal } = require('../lib/validate');
const cfg = require('../config');

const router = express.Router();

async function findPartyId(partyCode) {
  const [r] = await pool.query(`SELECT id FROM external_user_profiles WHERE party_code = ? LIMIT 1`, [partyCode]);
  return r[0]?.id || null;
}

async function findProductIdBySku(sku) {
  const [r] = await pool.query(`SELECT id FROM products WHERE sku_code = ? LIMIT 1`, [sku]);
  return r[0]?.id || null;
}

// Spec §4.1: A / Y / 1 → A (Approved/active); T / N / 0 → T (Terminated)
function statusToken(v) {
  const a = toBool(v);
  return a === null ? null : a ? 'A' : 'T';
}

// Identify the agreement to update. Lookup strategy:
//   1. URL :id (numeric) — back-compat
//   2. body.bp_code — finds the BP's most recent agreement regardless of status
//      so a terminated agreement can still be re-opened or amended via SAP push.
async function resolveAgreementId(req) {
  const fromUrl = req.params.id ? String(req.params.id).trim() : '';
  if (/^\d+$/.test(fromUrl)) {
    const [r] = await pool.query(`SELECT id FROM blanket_agreements WHERE id = ? LIMIT 1`, [Number(fromUrl)]);
    return r[0]?.id || null;
  }
  const bpCode = req.body?.bp_code;
  if (bpCode) {
    const [r] = await pool.query(
      `SELECT id FROM blanket_agreements WHERE bp_code = ? ORDER BY id DESC LIMIT 1`,
      [bpCode]
    );
    return r[0]?.id || null;
  }
  return null;
}

// Spec §3.2 rules per shape:
//   Qty/General  : line_number, item_code, item_name, planned_quantity, portion_of_returns
//   Qty/Specific : all of the above + unit_price
//   Financial    : line_number, planned_amount, portion_of_returns
async function validateLines(lines, agreementMethod, agreementType) {
  if (!Array.isArray(lines) || !lines.length) {
    throw new ValidationError({ lines: ['At least one line item is required.'] });
  }
  const seen = new Set();
  for (const ln of lines) {
    if (ln.line_number == null) throw new ValidationError({ lines: ['Each line needs line_number.'] });
    if (seen.has(ln.line_number)) {
      throw new ValidationError({ lines: [`Duplicate line_number ${ln.line_number}.`] });
    }
    seen.add(ln.line_number);

    if (agreementMethod === 'financial') {
      if (toDecimal(ln.planned_amount) == null) {
        throw new ValidationError({ lines: [`Line ${ln.line_number}: planned_amount required for financial agreements.`] });
      }
    } else {
      // qty (general or specific)
      if (!ln.item_code) throw new ValidationError({ lines: [`Line ${ln.line_number}: item_code required.`] });
      if (!ln.item_name) throw new ValidationError({ lines: [`Line ${ln.line_number}: item_name required.`] });
      if (toDecimal(ln.planned_quantity) == null) {
        throw new ValidationError({ lines: [`Line ${ln.line_number}: planned_quantity required.`] });
      }
      if (agreementType === 'specific' && toDecimal(ln.unit_price) == null) {
        throw new ValidationError({ lines: [`Line ${ln.line_number}: unit_price required for specific agreements.`] });
      }
    }
    if (toDecimal(ln.portion_of_returns) == null) {
      throw new ValidationError({ lines: [`Line ${ln.line_number}: portion_of_returns required.`] });
    }
  }
}

async function insertLines(conn, agreementId, lines, agreementMethod, agreementType) {
  for (const ln of lines) {
    let productId = null;
    if (agreementMethod !== 'financial' && ln.item_code) {
      productId = await findProductIdBySku(ln.item_code);
      if (!productId) {
        throw new ValidationError({ lines: [`Product '${ln.item_code}' on line ${ln.line_number} does not exist.`] });
      }
    }
    await conn.query(
      `INSERT INTO blanket_agreement_lines
        (uuid, created_at, updated_at, is_active,
         agreement_id, line_number,
         item_code, item_name, product_id,
         planned_quantity, unit_price, planned_amount, portion_of_returns,
         created_by_id, updated_by_id)
       VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
               ?, ?,
               ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?)`,
      [
        agreementId, ln.line_number,
        ln.item_code || null, ln.item_name || null, productId,
        toDecimal(ln.planned_quantity),
        agreementType === 'specific' ? toDecimal(ln.unit_price) : null,
        agreementMethod === 'financial' ? toDecimal(ln.planned_amount) : null,
        toDecimal(ln.portion_of_returns),
        cfg.systemUserId, cfg.systemUserId,
      ]
    );
  }
}

router.post('/', async (req, res, next) => {
  try {
    required(req.body, ['bp_code', 'agreement_method', 'start_date', 'end_date', 'status']);
    const start = parseDate(req.body.start_date);
    const end = parseDate(req.body.end_date);
    if (!start) throw new ValidationError({ start_date: ['Use YYYY-MM-DD.'] });
    if (!end) throw new ValidationError({ end_date: ['Use YYYY-MM-DD.'] });
    if (start > end) throw new ValidationError({ end_date: ['end_date must be on or after start_date.'] });

    const method = String(req.body.agreement_method).toLowerCase();
    if (!['qty', 'quantitative', 'financial'].includes(method)) {
      throw new ValidationError({ agreement_method: ['Must be qty or financial.'] });
    }
    const normalizedMethod = method === 'financial' ? 'financial' : 'qty';
    const agreementType = req.body.agreement_type ? String(req.body.agreement_type).toLowerCase() : null;
    if (agreementType && !['general', 'specific'].includes(agreementType)) {
      throw new ValidationError({ agreement_type: ['Must be general or specific.'] });
    }
    const statusCode = statusToken(req.body.status);
    if (!statusCode) throw new ValidationError({ status: ['Use A/T or Y/N.'] });

    const partyId = await findPartyId(req.body.bp_code);
    if (!partyId) throw new ValidationError({ bp_code: [`'${req.body.bp_code}' does not exist.`] });

    // Spec rule: only one OPEN (status='A') agreement per BP.
    if (statusCode === 'A') {
      const [open] = await pool.query(
        `SELECT id FROM blanket_agreements WHERE bp_code = ? AND status = 'A' LIMIT 1`,
        [req.body.bp_code]
      );
      if (open.length) throw new ValidationError({ bp_code: ['An open agreement already exists for this BP.'] });
    }

    const lines = req.body.lines || req.body.blanket_agreement_lines || [];
    await validateLines(lines, normalizedMethod, agreementType);

    const out = await withTx(async (conn) => {
      const [hdr] = await conn.query(
        `INSERT INTO blanket_agreements
          (uuid, created_at, updated_at, is_active,
           bp_code, bp_name, party_id,
           agreement_method, agreement_type, scheme_name,
           start_date, end_date, status,
           created_by_id, updated_by_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ?,
                 ?, ?, ?,
                 ?, ?, ?,
                 ?, ?, ?,
                 ?, ?)`,
        [
          statusCode === 'A' ? 1 : 0,
          req.body.bp_code, req.body.bp_name || req.body.bp_code, partyId,
          normalizedMethod, agreementType, req.body.scheme_name || null,
          start, end, statusCode,
          cfg.systemUserId, cfg.systemUserId,
        ]
      );
      const agreementId = hdr.insertId;
      await insertLines(conn, agreementId, lines, normalizedMethod, agreementType);
      return { id: agreementId };
    });

    res.status(201).json({
      ...out,
      bp_code: req.body.bp_code,
      method: normalizedMethod,
      agreement_type: agreementType,
      status: statusCode,
      lines_count: lines.length,
    });
  } catch (e) { next(e); }
});

router.put('/', updateHandler);
router.put('/:id/', updateHandler);

async function updateHandler(req, res, next) {
  try {
    // ---- Phase 1: validate body shape FIRST (so bad values → 400, not 404) ----
    const sets = [];
    const params = [];

    if (req.body.status !== undefined) {
      const st = statusToken(req.body.status);
      if (!st) throw new ValidationError({ status: ['Use A/T or Y/N.'] });
      sets.push('status = ?', 'is_active = ?');
      params.push(st, st === 'A' ? 1 : 0);
    }
    if (req.body.start_date !== undefined) {
      const d = parseDate(req.body.start_date);
      if (!d) throw new ValidationError({ start_date: ['Use YYYY-MM-DD.'] });
      sets.push('start_date = ?'); params.push(d);
    }
    if (req.body.end_date !== undefined) {
      const d = parseDate(req.body.end_date);
      if (!d) throw new ValidationError({ end_date: ['Use YYYY-MM-DD.'] });
      sets.push('end_date = ?'); params.push(d);
    }
    if (req.body.scheme_name !== undefined) { sets.push('scheme_name = ?'); params.push(req.body.scheme_name); }
    if (req.body.bp_name !== undefined) { sets.push('bp_name = ?'); params.push(req.body.bp_name); }
    // If client passed both, sanity-check the range.
    if (req.body.start_date !== undefined && req.body.end_date !== undefined) {
      const s = parseDate(req.body.start_date);
      const e = parseDate(req.body.end_date);
      if (s && e && s > e) throw new ValidationError({ end_date: ['end_date must be on or after start_date.'] });
    }

    // ---- Phase 2: resolve the record ----
    const agreementId = await resolveAgreementId(req);
    if (!agreementId) throw new NotFoundError();

    // Optional: replace the line set if `lines` (or `blanket_agreement_lines`) is in body
    const newLines = req.body.lines || req.body.blanket_agreement_lines;
    let linesReplaced = false;

    await withTx(async (conn) => {
      if (sets.length) {
        sets.push('updated_at = NOW(6)', 'updated_by_id = ?');
        params.push(cfg.systemUserId, agreementId);
        await conn.query(`UPDATE blanket_agreements SET ${sets.join(', ')} WHERE id = ?`, params);
      }
      if (Array.isArray(newLines) && newLines.length) {
        // Use the header's current method/type to validate the incoming lines correctly.
        const [hdr] = await conn.query(`SELECT agreement_method, agreement_type FROM blanket_agreements WHERE id = ?`, [agreementId]);
        const method = hdr[0]?.agreement_method || 'qty';
        const type = hdr[0]?.agreement_type || null;
        await validateLines(newLines, method, type);
        await conn.query(`DELETE FROM blanket_agreement_lines WHERE agreement_id = ?`, [agreementId]);
        await insertLines(conn, agreementId, newLines, method, type);
        linesReplaced = true;
      }
    });

    res.status(200).json({ id: agreementId, lines_replaced: linesReplaced });
  } catch (e) { next(e); }
}

module.exports = router;
