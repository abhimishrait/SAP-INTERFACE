// 3.13 Products (Variants) → products
//
// SAP sends:
//   product_name (FK → master_lookups[PRODUCT_NAME]), hsn_code, variant_code (= sku_code),
//   sujal_matrix (FK → product_domains.name), primary_selling_unit_name / secondary_selling_unit_name
//   (both FK → packaging_types.name), tax_code[] (array of {country, name, percentage}),
//   is_packaging_allow, status, mrp, production_unit, ...
const express = require('express');
const { pool, withTx } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required, toDecimal } = require('../lib/validate');
const { findIdByName, findIdByCode } = require('../lib/lookup');
const cfg = require('../config');

const router = express.Router();

async function lookupProductNameLabel(name) {
  const [rows] = await pool.query(
    `SELECT id FROM master_lookups WHERE category = 'PRODUCT_NAME' AND LOWER(label) = LOWER(?) LIMIT 1`,
    [name]
  );
  return rows[0]?.id || null;
}

async function resolveTax(taxEntry) {
  const { country_name, tax_name, tax_percentage } = taxEntry || {};
  if (!country_name || !tax_name || tax_percentage == null) return { err: 'tax_code entry incomplete' };
  const pct = toDecimal(tax_percentage);
  if (pct === null || pct < 0 || pct > 100) return { err: 'tax_percentage must be 0-100' };
  const [rows] = await pool.query(
    `SELECT t.id FROM taxes t
       JOIN countries c ON c.id = t.country_id
      WHERE LOWER(c.name) = LOWER(?) AND LOWER(t.tax_name) = LOWER(?) AND t.value_percent = ?
      LIMIT 1`,
    [country_name, tax_name, pct]
  );
  return { id: rows[0]?.id || null, country: country_name, tax_name, pct };
}

async function validateBody(body, { isCreate }) {
  const errors = {};

  if (isCreate) {
    for (const f of ['product_name', 'hsn_code', 'variant_code', 'sujal_matrix',
      'primary_selling_unit_name', 'secondary_selling_unit_name',
      'mrp', 'tax_code', 'is_packaging_allow', 'status']) {
      const v = body?.[f];
      if (v === undefined || v === null || v === '') errors[f] = ['This field is required.'];
    }
    if (!Array.isArray(body.tax_code) || body.tax_code.length === 0) {
      errors.tax_code = ['Must be a non-empty list.'];
    }
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const out = {};

  if (body.product_name !== undefined) {
    const pnId = await lookupProductNameLabel(body.product_name);
    if (!pnId) errors.product_name = [`Product Name '${body.product_name}' does not exist.`];
    out._product_name_label = body.product_name; // we store the literal value too
  }
  if (body.sujal_matrix !== undefined) {
    // Matrix moved from `product_domains` to dedicated `sujal_matrices` (migration
    // shipped alongside matrix.js rewrite). Look up by material_group, which is
    // the natural single-key handle SAP sends in `sujal_matrix`. Fall back to the
    // legacy product_domains table so historical rows still resolve.
    const ref = String(body.sujal_matrix).trim();
    const [sm] = await pool.query(
      `SELECT id FROM sujal_matrices WHERE LOWER(material_group) = LOWER(?) LIMIT 1`, [ref]
    );
    if (sm.length) {
      out._sujal_matrix_id = sm[0].id;
    } else {
      const legacy = await findIdByName('product_domains', ref);
      if (!legacy) {
        errors.sujal_matrix = [`Matrix '${ref}' does not exist.`];
      } else {
        out._matrix_id = legacy; // legacy M2M still wired below
      }
    }
  }
  if (body.primary_selling_unit_name !== undefined) {
    const p = await findIdByName('packaging_types', body.primary_selling_unit_name);
    if (!p) errors.primary_selling_unit_name = [`Container '${body.primary_selling_unit_name}' does not exist.`];
    out.primary_packaging_id = p;
  }
  if (body.secondary_selling_unit_name !== undefined) {
    const p = await findIdByName('packaging_types', body.secondary_selling_unit_name);
    if (!p) errors.secondary_selling_unit_name = [`Container '${body.secondary_selling_unit_name}' does not exist.`];
    out.secondary_packaging_id = p;
  }
  if (body.tax_code !== undefined) {
    if (!Array.isArray(body.tax_code) || body.tax_code.length === 0) {
      errors.tax_code = ['Must be a non-empty list.'];
    } else {
      // Take the FIRST tax entry as the product's primary tax (products.tax_id is single).
      const first = await resolveTax(body.tax_code[0]);
      if (first.err) errors.tax_code = [first.err];
      else if (!first.id) errors.tax_code = [`No matching tax found for country '${first.country}' / '${first.tax_name}' / ${first.pct}%.`];
      else out.tax_id = first.id;
    }
  }
  if (body.hsn_code !== undefined) out.hsn_code = String(body.hsn_code).trim();
  if (body.mrp !== undefined) {
    const m = toDecimal(body.mrp);
    if (m === null || m < 0) errors.mrp = ['Must be a non-negative decimal.'];
    else out.mrp = m;
  }
  if (body.production_unit !== undefined) {
    const pu = String(body.production_unit).trim();
    let pid = await findIdByName('production_units', pu);
    if (!pid && /^\d+$/.test(pu)) pid = Number(pu); // accept literal id too
    if (pid) out.production_unit_id = pid;
  }
  if (body.no_of_secondary_in_primary !== undefined) {
    const v = body.no_of_secondary_in_primary;
    const n = Number(v);
    if (v === '' || v === null || !Number.isInteger(n) || n <= 0) {
      errors.no_of_secondary_in_primary = ['Must be a positive integer.'];
    } else {
      out.pack_size_conversion = String(n);
    }
  }
  if (body.is_packaging_allow !== undefined) {
    const v = toBool(body.is_packaging_allow);
    if (v === null) errors.is_packaging_allow = ['Use Y/N or 1/0.'];
    // No direct column for this; encode in storage_condition meta or skip.
  }
  if (body.status !== undefined) {
    const a = toBool(body.status);
    if (a === null) errors.status = ['Use Y/N or 1/0.'];
    else out.is_active = a ? 1 : 0;
    out.status = a ? 'ACTIVE' : 'INACTIVE';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

router.post('/', async (req, res, next) => {
  try {
    const variantCode = String(req.body.variant_code || '').trim().toUpperCase();
    if (!variantCode) throw new ValidationError({ variant_code: ['This field is required.'] });
    const [dup] = await pool.query(`SELECT id FROM products WHERE sku_code = ? LIMIT 1`, [variantCode]);
    if (dup.length) throw new ValidationError({ variant_code: ['This value already exists.'] });

    const data = await validateBody(req.body, { isCreate: true });
    const productName = String(req.body.product_name).trim();
    const matrixId = data._matrix_id;
    const sujalMatrixId = data._sujal_matrix_id;
    delete data._matrix_id; delete data._sujal_matrix_id; delete data._product_name_label;

    const out = await withTx(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO products
           (uuid, created_at, updated_at, is_active,
            sku_code, product_name, hsn_code, mrp, status,
            primary_packaging_id, secondary_packaging_id, tax_id, production_unit_id,
            pack_size_conversion, sync_type,
            has_tertiary_packaging, saleable, returnable, batch_tracking, expiry_tracking,
            fefo_enforced, mfg_date_required, inward_qc_required, grn_auto_approval,
            damage_tracking, stock_rotation_rule, partial_dispatch_allowed,
            created_by_id, updated_by_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ?,
                 ?, ?, ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, 'sap-sync',
                 0, 1, 0, 0, 0,
                 0, 0, 0, 1,
                 0, 'FIFO', 1,
                 ?, ?)`,
        [
          data.is_active ?? 1,
          variantCode, productName, data.hsn_code || null, data.mrp || 0, data.status || 'ACTIVE',
          data.primary_packaging_id, data.secondary_packaging_id, data.tax_id, data.production_unit_id || null,
          data.pack_size_conversion || null,
          cfg.systemUserId, cfg.systemUserId,
        ]
      );
      const productId = r.insertId;
      if (matrixId) {
        // Legacy product_domains M2M (kept for backward compatibility).
        await conn.query(
          `INSERT INTO products_product_domains (product_id, productdomain_id) VALUES (?, ?)`,
          [productId, matrixId]
        );
      }
      // sujal_matrices has no products M2M yet — once the DMS team adds one,
      // wire sujalMatrixId through here. For now the match validates existence;
      // returning the id in the response so SAP / console can correlate.
      return { id: productId, sujal_matrix_id: sujalMatrixId || null };
    });

    res.status(201).json({ ...out, variant_code: variantCode, product_name: productName, is_active: !!(data.is_active ?? 1), message: 'Created' });
  } catch (e) { next(e); }
});

router.put('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [exists] = await pool.query(`SELECT id FROM products WHERE id = ? LIMIT 1`, [id]);
    if (!exists.length) throw new NotFoundError();
    const data = await validateBody(req.body, { isCreate: false });
    const matrixId = data._matrix_id;
    delete data._matrix_id; delete data._sujal_matrix_id; delete data._product_name_label;

    const sets = [];
    const params = [];
    for (const k of Object.keys(data)) {
      if (k === 'status' && data.is_active === undefined) continue; // status set alongside is_active
      sets.push(`\`${k}\` = ?`); params.push(data[k]);
    }
    if (req.body.product_name !== undefined) { sets.push('product_name = ?'); params.push(String(req.body.product_name).trim()); }

    if (sets.length) {
      sets.push('updated_at = NOW(6)', 'updated_by_id = ?'); params.push(cfg.systemUserId, id);
      await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    if (matrixId) {
      await pool.query(`DELETE FROM products_product_domains WHERE product_id = ?`, [id]);
      await pool.query(`INSERT INTO products_product_domains (product_id, productdomain_id) VALUES (?, ?)`, [id, matrixId]);
    }
    res.status(200).json({ id, message: 'Updated' });
  } catch (e) { next(e); }
});

module.exports = router;
