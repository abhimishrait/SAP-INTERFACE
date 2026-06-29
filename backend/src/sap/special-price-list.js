// 3.12 Special Price List → special_price_lists (header) + special_price_list_items (rows).
//
// Accepts single object OR array. Uniqueness key: (party_code, item_code).
// Per-row partial success — see /sap/price-list/ for the pattern.
const express = require('express');
const { pool, withTx } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required, toDecimal, parseDate } = require('../lib/validate');
const cfg = require('../config');

const router = express.Router();

async function findPartyId(partyCode) {
  if (!partyCode) return null;
  const [rows] = await pool.query(
    `SELECT id FROM external_user_profiles WHERE party_code = ? LIMIT 1`, [partyCode]
  );
  return rows[0]?.id || null;
}

async function findProductId(itemCode) {
  if (!itemCode) return null;
  const [rows] = await pool.query(`SELECT id FROM products WHERE sku_code = ? LIMIT 1`, [itemCode]);
  return rows[0]?.id || null;
}

async function ensureHeader(conn) {
  const [hdr] = await conn.query(
    `SELECT id FROM special_price_lists WHERE UPPER(status) = 'ACTIVE' ORDER BY id DESC LIMIT 1`
  );
  if (hdr.length) return hdr[0].id;
  const [r] = await conn.query(
    `INSERT INTO special_price_lists
      (uuid, created_at, updated_at, is_active, file_name, total_items, status, created_by_id, updated_by_id)
     VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, 'sap-sync', 0, 'Active', ?, ?)`,
    [cfg.systemUserId, cfg.systemUserId]
  );
  return r.insertId;
}

async function upsertOneRow(row) {
  try {
    const missing = ['item_code', 'container_price', 'discount', 'party_code', 'start_date', 'end_date', 'status']
      .filter(k => row[k] === undefined || row[k] === null || row[k] === '');
    if (missing.length) {
      const errors = {};
      for (const f of missing) errors[f] = ['This field is required.'];
      throw new ValidationError(errors);
    }
    const isActive = toBool(row.status);
    if (isActive === null) throw new ValidationError({ status: ['Use Y/N or 1/0.'] });
    const rate = toDecimal(row.container_price);
    if (rate === null || rate < 0) throw new ValidationError({ container_price: ['Must be a non-negative decimal.'] });
    const discount = toDecimal(row.discount);
    if (discount === null || discount < 0 || discount > 100) {
      throw new ValidationError({ discount: ['Must be between 0 and 100.'] });
    }
    const start = parseDate(row.start_date);
    const end = parseDate(row.end_date);
    if (!start) throw new ValidationError({ start_date: ['Date has wrong format. Use YYYY-MM-DD.'] });
    if (!end) throw new ValidationError({ end_date: ['Date has wrong format. Use YYYY-MM-DD.'] });
    if (start > end) throw new ValidationError({ end_date: ['end_date must be on or after start_date.'] });

    const partyId = await findPartyId(row.party_code);
    if (!partyId) throw new ValidationError({ party_code: [`'${row.party_code}' does not exist.`] });
    const productId = await findProductId(row.item_code);
    if (!productId) throw new ValidationError({ item_code: [`Product '${row.item_code}' does not exist.`] });

    const finalPrice = +(rate * (1 - discount / 100)).toFixed(2);

    const out = await withTx(async (conn) => {
      const headerId = await ensureHeader(conn);
      const [dup] = await conn.query(
        `SELECT id FROM special_price_list_items WHERE party_id = ? AND product_id = ? LIMIT 1`,
        [partyId, productId]
      );
      if (dup.length) {
        await conn.query(
          `UPDATE special_price_list_items
              SET rate=?, discount_percent=?, final_price=?, applicable_from=?, valid_to=?,
                  is_active=?, updated_at=NOW(6), updated_by_id=?
            WHERE id=?`,
          [rate, discount, finalPrice, start, end, isActive ? 1 : 0, cfg.systemUserId, dup[0].id]
        );
        return { id: dup[0].id, special_price_list_id: headerId, updated: true };
      }
      const [r] = await conn.query(
        `INSERT INTO special_price_list_items
          (uuid, created_at, updated_at, is_active,
           rate, discount_percent, final_price, applicable_from, valid_to,
           party_id, product_id, special_price_list_id, created_by_id, updated_by_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ?, ?,?,?,?,?, ?,?,?,?,?)`,
        [isActive ? 1 : 0, rate, discount, finalPrice, start, end,
          partyId, productId, headerId, cfg.systemUserId, cfg.systemUserId]
      );
      await conn.query(`UPDATE special_price_lists SET total_items = total_items + 1, updated_at = NOW(6) WHERE id = ?`,
        [headerId]);
      return { id: r.insertId, special_price_list_id: headerId };
    });
    return {
      ok: true, status: out.updated ? 200 : 201,
      id: out.id, special_price_list_id: out.special_price_list_id,
      party_id: partyId, product_id: productId, rate, discount_pct: discount, final_price: finalPrice,
      message: out.updated ? 'Updated' : 'Created',
    };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, status: 400, error: err.errors };
    return { ok: false, status: 500, error: { detail: err.message } };
  }
}

router.post('/', async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) {
      const result = await upsertOneRow(req.body);
      if (result.ok) return res.status(result.status).json(result);
      return res.status(result.status).json(result.error);
    }

    if (req.body.length === 0) {
      throw new ValidationError({ detail: ['Bulk payload must contain at least one row.'] });
    }
    const MAX_BULK = 1000;
    if (req.body.length > MAX_BULK) {
      throw new ValidationError({ detail: [`Bulk payload too large: ${req.body.length} rows (max ${MAX_BULK}).`] });
    }

    const results = [];
    for (let i = 0; i < req.body.length; i++) {
      const r = await upsertOneRow(req.body[i]);
      results.push({
        row: i,
        party_code: req.body[i]?.party_code || null,
        item_code: req.body[i]?.item_code || null,
        ...r,
      });
    }
    const succeeded = results.filter(r => r.ok).length;
    const failed = results.length - succeeded;
    const httpStatus =
      failed === 0 ? (results.every(r => r.status === 200) ? 200 : 201)
      : succeeded === 0 ? 400
      : 207;
    res.status(httpStatus).json({ total: results.length, succeeded, failed, results });
  } catch (e) { next(e); }
});

router.put('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [exists] = await pool.query(`SELECT id, rate, discount_percent FROM special_price_list_items WHERE id = ? LIMIT 1`, [id]);
    if (!exists.length) throw new NotFoundError();
    const cur = exists[0];

    const sets = [];
    const params = [];
    let rate = cur.rate, discount = cur.discount_percent;

    if (req.body.container_price !== undefined) {
      rate = toDecimal(req.body.container_price);
      if (rate === null || rate < 0) throw new ValidationError({ container_price: ['Must be a non-negative decimal.'] });
      sets.push('rate = ?'); params.push(rate);
    }
    if (req.body.discount !== undefined) {
      discount = toDecimal(req.body.discount);
      if (discount === null || discount < 0 || discount > 100) throw new ValidationError({ discount: ['Must be 0-100.'] });
      sets.push('discount_percent = ?'); params.push(discount);
    }
    if (req.body.container_price !== undefined || req.body.discount !== undefined) {
      const finalPrice = +(rate * (1 - discount / 100)).toFixed(2);
      sets.push('final_price = ?'); params.push(finalPrice);
    }
    if (req.body.start_date !== undefined) {
      const d = parseDate(req.body.start_date);
      if (!d) throw new ValidationError({ start_date: ['Use YYYY-MM-DD.'] });
      sets.push('applicable_from = ?'); params.push(d);
    }
    if (req.body.end_date !== undefined) {
      const d = parseDate(req.body.end_date);
      if (!d) throw new ValidationError({ end_date: ['Use YYYY-MM-DD.'] });
      sets.push('valid_to = ?'); params.push(d);
    }
    if (req.body.status !== undefined) {
      const isActive = toBool(req.body.status);
      if (isActive === null) throw new ValidationError({ status: ['Use Y/N or 1/0.'] });
      sets.push('is_active = ?'); params.push(isActive ? 1 : 0);
    }
    if (!sets.length) return res.status(200).json({ id, updated: false, message: 'Updated' });
    sets.push('updated_at = NOW(6)', 'updated_by_id = ?'); params.push(cfg.systemUserId, id);
    await pool.query(`UPDATE special_price_list_items SET ${sets.join(', ')} WHERE id = ?`, params);
    res.status(200).json({ id, message: 'Updated' });
  } catch (e) { next(e); }
});

module.exports = router;
