// 3.6 Matrix → sujal_matrices
//
// Replaces the previous mapping onto `product_domains`. The DMS team added a
// dedicated `sujal_matrices` table whose shape mirrors what SAP actually pushes:
//   material_group, product_class_name, hsn_code, order_of, unit (+ status).
//
// Uniqueness: (material_group, product_class_name, hsn_code) — enforced by DB.
// PUT is by integer primary key returned at create.
const express = require('express');
const { pool } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, parseDate } = require('../lib/validate');
const cfg = require('../config');

const router = express.Router();

const REQUIRED = ['material_group', 'product_class_name', 'hsn_code', 'order_of', 'unit', 'status'];

function validateOrderOf(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function validatePayload(body, { mode }) {
  const errors = {};
  if (mode === 'create') {
    for (const f of REQUIRED) {
      if (body[f] === undefined || body[f] === null || body[f] === '') errors[f] = ['This field is required.'];
    }
  }
  if (body.material_group !== undefined && String(body.material_group).length > 100) {
    errors.material_group = ['Must be 100 characters or fewer.'];
  }
  if (body.product_class_name !== undefined && String(body.product_class_name).length > 255) {
    errors.product_class_name = ['Must be 255 characters or fewer.'];
  }
  if (body.hsn_code !== undefined && String(body.hsn_code).length > 20) {
    errors.hsn_code = ['Must be 20 characters or fewer.'];
  }
  if (body.unit !== undefined && String(body.unit).length > 4) {
    errors.unit = ['Must be 4 characters or fewer.'];
  }
  if (body.order_of !== undefined && body.order_of !== null && body.order_of !== '' && validateOrderOf(body.order_of) === null) {
    errors.order_of = ['Must be a non-negative integer.'];
  }
  if (body.status !== undefined && toBool(body.status) === null) {
    errors.status = ['Use Y/N or 1/0.'];
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

async function findDuplicate(mg, pcn, hsn, excludeId = null) {
  const params = [String(mg).trim(), String(pcn).trim(), String(hsn).trim()];
  let sql = `SELECT id FROM sujal_matrices
              WHERE material_group = ? AND product_class_name = ? AND hsn_code = ?`;
  if (excludeId != null) { sql += ' AND id <> ?'; params.push(excludeId); }
  const [rows] = await pool.query(sql + ' LIMIT 1', params);
  return rows[0]?.id || null;
}

router.post('/', async (req, res, next) => {
  try {
    validatePayload(req.body, { mode: 'create' });
    const dup = await findDuplicate(req.body.material_group, req.body.product_class_name, req.body.hsn_code);
    if (dup) throw new ValidationError({ material_group: ['This material_group + product_class_name + hsn_code combination already exists.'] });

    const isActive = toBool(req.body.status) ? 1 : 0;
    const [r] = await pool.query(
      `INSERT INTO sujal_matrices
         (uuid, created_at, updated_at, is_active,
          material_group, product_class_name, hsn_code, order_of, unit,
          created_by_id, updated_by_id)
        VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ?,
                ?, ?, ?, ?, ?,
                ?, ?)`,
      [
        isActive,
        String(req.body.material_group).trim(),
        String(req.body.product_class_name).trim(),
        String(req.body.hsn_code).trim(),
        validateOrderOf(req.body.order_of),
        String(req.body.unit).trim(),
        cfg.systemUserId, cfg.systemUserId,
      ]
    );
    res.status(201).json({
      id: r.insertId,
      material_group: req.body.material_group,
      product_class_name: req.body.product_class_name,
      hsn_code: req.body.hsn_code,
      order_of: validateOrderOf(req.body.order_of),
      unit: req.body.unit,
      is_active: !!isActive,
      message: 'Created',
    });
  } catch (e) { next(e); }
});

router.put('/:id/', async (req, res, next) => {
  try {
    const raw = String(req.params.id || '').trim();
    if (!/^\d+$/.test(raw)) {
      throw new ValidationError({ id: ['Must be the integer primary key from the create response.'] });
    }
    const id = Number(raw);
    const [exists] = await pool.query(
      `SELECT material_group, product_class_name, hsn_code FROM sujal_matrices WHERE id = ? LIMIT 1`, [id]
    );
    if (!exists.length) throw new NotFoundError();

    validatePayload(req.body, { mode: 'update' });

    // Need to dup-check against the *new* (mg, pcn, hsn) tuple — fall back to
    // existing value for any field the caller didn't send.
    const mg  = req.body.material_group     !== undefined ? String(req.body.material_group).trim()     : exists[0].material_group;
    const pcn = req.body.product_class_name !== undefined ? String(req.body.product_class_name).trim() : exists[0].product_class_name;
    const hsn = req.body.hsn_code           !== undefined ? String(req.body.hsn_code).trim()           : exists[0].hsn_code;
    const dup = await findDuplicate(mg, pcn, hsn, id);
    if (dup) throw new ValidationError({ material_group: ['This material_group + product_class_name + hsn_code combination already exists.'] });

    const sets = [];
    const params = [];
    for (const k of ['material_group', 'product_class_name', 'hsn_code', 'unit']) {
      if (req.body[k] !== undefined) { sets.push(`\`${k}\` = ?`); params.push(String(req.body[k]).trim()); }
    }
    if (req.body.order_of !== undefined) { sets.push('order_of = ?'); params.push(validateOrderOf(req.body.order_of)); }
    if (req.body.status !== undefined) { sets.push('is_active = ?'); params.push(toBool(req.body.status) ? 1 : 0); }

    if (!sets.length) {
      return res.status(200).json({ id, updated: false, message: 'Updated' });
    }
    sets.push('updated_at = NOW(6)', 'updated_by_id = ?'); params.push(cfg.systemUserId, id);
    await pool.query(`UPDATE sujal_matrices SET ${sets.join(', ')} WHERE id = ?`, params);
    res.status(200).json({ id, message: 'Updated' });
  } catch (e) { next(e); }
});

module.exports = router;
