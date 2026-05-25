// 3.8 Product Name — no dedicated table in DMS (products.product_name is just a column).
// Per Q2, store the master in master_lookups with category='PRODUCT_NAME'.
// The link to Product Class is informational (stored in master_lookups.value).
const express = require('express');
const { pool } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required } = require('../lib/validate');
const { findIdByName } = require('../lib/lookup');
const cfg = require('../config');

const router = express.Router();
const CATEGORY = 'PRODUCT_NAME';

async function findByLabel(label, excludeId = null) {
  const params = [CATEGORY, label.trim()];
  let sql = `SELECT id FROM master_lookups
              WHERE category = ? AND LOWER(label) = LOWER(?)`;
  if (excludeId != null) { sql += ' AND id <> ?'; params.push(excludeId); }
  const [rows] = await pool.query(sql + ' LIMIT 1', params);
  return rows[0] ? rows[0].id : null;
}

router.post('/', async (req, res, next) => {
  try {
    required(req.body, ['name', 'status']);
    const name = String(req.body.name).trim();
    const isActive = toBool(req.body.status);
    if (isActive === null) throw new ValidationError({ status: ['Use Y/N or 1/0.'] });

    if (await findByLabel(name)) {
      throw new ValidationError({ name: ['This value already exists.'] });
    }
    // Validate the Product Class reference if supplied.
    let classRef = null;
    if (req.body.product_class_name) {
      const classId = await findIdByName('production_categories', req.body.product_class_name);
      if (!classId) {
        throw new ValidationError({
          product_class_name: [`Product Class '${req.body.product_class_name}' does not exist.`],
        });
      }
      classRef = String(classId);
    }

    const [r] = await pool.query(
      `INSERT INTO master_lookups
         (uuid, created_at, updated_at, is_active, category, label, value, sort_order, created_by_id, updated_by_id)
       VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ?, ?, ?, ?, 0, ?, ?)`,
      [isActive ? 1 : 0, CATEGORY, name, classRef || '', cfg.systemUserId, cfg.systemUserId]
    );
    res.status(201).json({ id: r.insertId, product_name: name, product_class_id: classRef, is_active: isActive });
  } catch (e) { next(e); }
});

router.put('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [exists] = await pool.query(
      `SELECT id FROM master_lookups WHERE id = ? AND category = ? LIMIT 1`,
      [id, CATEGORY]
    );
    if (!exists.length) throw new NotFoundError();

    const sets = [];
    const params = [];
    if (req.body.name !== undefined) {
      const dup = await findByLabel(req.body.name, id);
      if (dup) throw new ValidationError({ name: ['This value already exists.'] });
      sets.push('label = ?'); params.push(String(req.body.name).trim());
    }
    if (req.body.product_class_name !== undefined) {
      const classId = await findIdByName('production_categories', req.body.product_class_name);
      if (!classId) {
        throw new ValidationError({
          product_class_name: [`Product Class '${req.body.product_class_name}' does not exist.`],
        });
      }
      sets.push('value = ?'); params.push(String(classId));
    }
    if (req.body.status !== undefined) {
      const isActive = toBool(req.body.status);
      if (isActive === null) throw new ValidationError({ status: ['Use Y/N or 1/0.'] });
      sets.push('is_active = ?'); params.push(isActive ? 1 : 0);
    }
    if (!sets.length) return res.status(200).json({ id, updated: false });
    sets.push('updated_at = NOW(6)', 'updated_by_id = ?'); params.push(cfg.systemUserId);
    params.push(id);
    await pool.query(`UPDATE master_lookups SET ${sets.join(', ')} WHERE id = ?`, params);
    res.status(200).json({ id });
  } catch (e) { next(e); }
});

module.exports = router;
