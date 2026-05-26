// 3.11 Price List → price_lists (header per rate-group) + price_list_items (rows).
//
// SAP can send either a single row OR an array of rows in one POST.
//   - Single:  { rate_group, item_code, container_price, status }
//   - Bulk:    [ { ... }, { ... }, ... ]   (any length)
//
// Each row is processed independently: validation failure on one row does NOT roll
// back the others. The response includes a per-row result so SAP can selectively retry.
//
// Status code: 201 if every row succeeded, 207 Multi-Status if mixed, 400 if all failed.
const express = require('express');
const { pool, withTx } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required, toDecimal } = require('../lib/validate');
const { findIdByName } = require('../lib/lookup');
const cfg = require('../config');

const router = express.Router();

async function ensurePriceListHeader(conn, priceGroupId) {
  const [hdr] = await conn.query(
    `SELECT id FROM price_lists
      WHERE price_group_id = ?
      ORDER BY effective_from DESC, id DESC LIMIT 1`,
    [priceGroupId]
  );
  if (hdr.length) return hdr[0].id;
  const [r] = await conn.query(
    `INSERT INTO price_lists
       (uuid, created_at, updated_at, is_active,
        file_name, effective_from, effective_to, total_skus, status,
        price_group_id, created_by_id, updated_by_id)
     VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
             'sap-sync', CURDATE(), '2099-12-31', 0, 'ACTIVE',
             ?, ?, ?)`,
    [priceGroupId, cfg.systemUserId, cfg.systemUserId]
  );
  return r.insertId;
}

// Processes ONE price-list row in its own transaction.
// Returns { ok: true, ... } on success or { ok: false, error: {...} } on failure.
async function upsertOneRow(row) {
  try {
    const missing = ['rate_group', 'item_code', 'container_price', 'status']
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

    const priceGroupId = await findIdByName('price_groups', row.rate_group);
    if (!priceGroupId) throw new ValidationError({ rate_group: [`'${row.rate_group}' does not exist.`] });
    const [prodRows] = await pool.query(`SELECT id FROM products WHERE sku_code = ? LIMIT 1`, [row.item_code]);
    const productId = prodRows[0]?.id;
    if (!productId) throw new ValidationError({ item_code: [`Product '${row.item_code}' does not exist.`] });

    const out = await withTx(async (conn) => {
      const priceListId = await ensurePriceListHeader(conn, priceGroupId);
      const [dup] = await conn.query(
        `SELECT id FROM price_list_items
          WHERE price_list_id = ? AND product_id = ? AND packaging_id IS NULL LIMIT 1`,
        [priceListId, productId]
      );
      if (dup.length) {
        await conn.query(
          `UPDATE price_list_items
              SET rate = ?, is_active = ?, updated_at = NOW(6), updated_by_id = ?
            WHERE id = ?`,
          [rate, isActive ? 1 : 0, cfg.systemUserId, dup[0].id]
        );
        return { id: dup[0].id, price_list_id: priceListId, updated: true };
      }
      const [r] = await conn.query(
        `INSERT INTO price_list_items
          (uuid, created_at, updated_at, is_active, rate,
           price_list_id, product_id, created_by_id, updated_by_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ?, ?, ?, ?, ?, ?)`,
        [isActive ? 1 : 0, rate, priceListId, productId, cfg.systemUserId, cfg.systemUserId]
      );
      await conn.query(`UPDATE price_lists SET total_skus = total_skus + 1, updated_at = NOW(6) WHERE id = ?`,
        [priceListId]);
      return { id: r.insertId, price_list_id: priceListId };
    });
    return {
      ok: true, status: out.updated ? 200 : 201,
      id: out.id, price_list_id: out.price_list_id,
      rate_group_id: priceGroupId, product_id: productId, rate, is_active: isActive,
      message: out.updated ? 'Updated' : 'Created',
    };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, status: 400, error: err.errors };
    return { ok: false, status: 500, error: { detail: err.message } };
  }
}

router.post('/', async (req, res, next) => {
  try {
    // Detect single vs bulk. Both shapes are accepted.
    const isBulk = Array.isArray(req.body);
    if (!isBulk) {
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
      results.push({ row: i, item_code: req.body[i]?.item_code || null, ...r });
    }
    const succeeded = results.filter(r => r.ok).length;
    const failed = results.length - succeeded;
    // Per HTTP semantics: 201 all-created, 200 all-ok, 207 mixed, 400 all-failed.
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
    const [exists] = await pool.query(`SELECT id FROM price_list_items WHERE id = ? LIMIT 1`, [id]);
    if (!exists.length) throw new NotFoundError();
    const sets = [];
    const params = [];
    if (req.body.container_price !== undefined) {
      const rate = toDecimal(req.body.container_price);
      if (rate === null || rate < 0) throw new ValidationError({ container_price: ['Must be a non-negative decimal.'] });
      sets.push('rate = ?'); params.push(rate);
    }
    if (req.body.status !== undefined) {
      const isActive = toBool(req.body.status);
      if (isActive === null) throw new ValidationError({ status: ['Use Y/N or 1/0.'] });
      sets.push('is_active = ?'); params.push(isActive ? 1 : 0);
    }
    if (!sets.length) return res.status(200).json({ id, updated: false, message: 'Updated' });
    sets.push('updated_at = NOW(6)', 'updated_by_id = ?'); params.push(cfg.systemUserId, id);
    await pool.query(`UPDATE price_list_items SET ${sets.join(', ')} WHERE id = ?`, params);
    res.status(200).json({ id, message: 'Updated' });
  } catch (e) { next(e); }
});

module.exports = router;
