// 3.13 Products (Variants) → products
//
// SAP sends:
//   product_name (free text — stored verbatim), hsn_code, variant_code (= sku_code),
//   sujal_matrix (FK → sujal_matrices.name), primary_selling_unit_name / secondary_selling_unit_name
//   (both FK → packaging_types.name), tax_code[] (array of {country, name, percentage}),
//   is_packaging_allow, status, mrp, production_unit, ...
const express = require('express');
const { pool, withTx } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required, toDecimal } = require('../lib/validate');
const { findIdByName, defaultProductionLineId } = require('../lib/lookup');
const cfg = require('../config');

const router = express.Router();

// Find-or-create the (country, tax) pair. The DMS doesn't pre-seed these
// masters, so a fresh install would otherwise 400 on every product POST.
// We mint a country row (code = first 3 letters of name, suffix on collision)
// and a tax row when missing, then return the tax id.
async function deriveCountryCode(name) {
  const base = String(name || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'XXX';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 2)}${i}`;
    const [rows] = await pool.query(`SELECT 1 FROM countries WHERE code = ? LIMIT 1`, [candidate]);
    if (!rows.length) return candidate;
  }
  return `${base}_${Date.now() % 10000}`;
}

async function findOrCreateCountry(name) {
  const trimmed = String(name).trim();
  const [existing] = await pool.query(
    `SELECT id FROM countries WHERE LOWER(name) = LOWER(?) LIMIT 1`, [trimmed]
  );
  if (existing[0]) return existing[0].id;
  const code = await deriveCountryCode(trimmed);
  const [r] = await pool.query(
    `INSERT INTO countries (uuid, created_at, updated_at, is_active, name, code, created_by_id, updated_by_id)
     VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, ?, ?, ?, ?)`,
    [trimmed, code, cfg.systemUserId, cfg.systemUserId]
  );
  return r.insertId;
}

async function findOrCreateTax(countryId, taxName, pct) {
  const trimmed = String(taxName).trim();
  const [existing] = await pool.query(
    `SELECT id FROM taxes
      WHERE country_id = ? AND LOWER(tax_name) = LOWER(?) AND value_percent = ?
      LIMIT 1`,
    [countryId, trimmed, pct]
  );
  if (existing[0]) return existing[0].id;
  const [r] = await pool.query(
    `INSERT INTO taxes (uuid, created_at, updated_at, is_active, tax_name, value_percent, country_id, created_by_id, updated_by_id)
     VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, ?, ?, ?, ?, ?)`,
    [trimmed, pct, countryId, cfg.systemUserId, cfg.systemUserId]
  );
  return r.insertId;
}

async function findOrCreateProductCategory(value) {
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const [existing] = await pool.query(
    `SELECT id FROM production_categories WHERE LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?) LIMIT 1`,
    [trimmed, trimmed]
  );
  if (existing[0]) return existing[0].id;
  const code = trimmed.toUpperCase().slice(0, 50);
  const lineId = await defaultProductionLineId(cfg.defaults.productionLineCode);
  const [r] = await pool.query(
    `INSERT INTO production_categories
       (uuid, created_at, updated_at, is_active, name, code, production_line_id, created_by_id, updated_by_id)
     VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, ?, ?, ?, ?, ?)`,
    [trimmed, code, lineId, cfg.systemUserId, cfg.systemUserId]
  );
  return r.insertId;
}

async function findOrCreateUom(value) {
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const [existing] = await pool.query(
    `SELECT id FROM uoms WHERE LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?) LIMIT 1`,
    [trimmed, trimmed]
  );
  if (existing[0]) return existing[0].id;
  const code = trimmed.toUpperCase().slice(0, 50);
  const [r] = await pool.query(
    `INSERT INTO uoms (uuid, created_at, updated_at, is_active, name, code, created_by_id, updated_by_id)
     VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, ?, ?, ?, ?)`,
    [trimmed, code, cfg.systemUserId, cfg.systemUserId]
  );
  return r.insertId;
}

async function resolveTax(taxEntry) {
  const { country_name, tax_name, tax_percentage } = taxEntry || {};
  if (!country_name || !tax_name || tax_percentage == null) return { err: 'tax_code entry incomplete' };
  const pct = toDecimal(tax_percentage);
  if (pct === null || pct < 0 || pct > 100) return { err: 'tax_percentage must be 0-100' };
  const countryId = await findOrCreateCountry(country_name);
  const taxId = await findOrCreateTax(countryId, tax_name, pct);
  return { id: taxId, country: country_name, tax_name, pct };
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

  // product_name is free text — written verbatim to products.product_name.
  if (body.sujal_matrix !== undefined) {
    // Matrix lives in `sujal_matrices` (simple-master shape: name + code +
    // is_active). SAP sends the matrix `name` in `sujal_matrix`.
    const ref = String(body.sujal_matrix).trim();
    const smId = await findIdByName('sujal_matrices', ref);
    if (!smId) errors.sujal_matrix = [`Matrix '${ref}' does not exist.`];
    else out.sujal_matrix_id = smId;
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
      else out.tax_id = first.id;
    }
  }
  if (body.hsn_code !== undefined) out.hsn_code = String(body.hsn_code).trim();
  if (body.mrp !== undefined) {
    const m = toDecimal(body.mrp);
    if (m === null || m < 0) errors.mrp = ['Must be a non-negative decimal.'];
    else out.mrp = m;
  }
  if (body.production_unit_id !== undefined) {
    const v = body.production_unit_id;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      errors.production_unit_id = ['Must be a positive integer.'];
    } else {
      const [rows] = await pool.query(
        `SELECT id FROM production_units WHERE id = ? LIMIT 1`, [n]
      );
      if (!rows.length) errors.production_unit_id = [`Production unit id '${n}' does not exist.`];
      else out.production_unit_id = n;
    }
  } else if (body.production_unit !== undefined) {
    const pu = String(body.production_unit).trim();
    let pid = await findIdByName('production_units', pu);
    if (!pid && /^\d+$/.test(pu)) pid = Number(pu); // accept literal id too
    if (pid) out.production_unit_id = pid;
  }
  if (body.product_category_id !== undefined) {
    const v = body.product_category_id;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      errors.product_category_id = ['Must be a positive integer.'];
    } else {
      const [rows] = await pool.query(
        `SELECT id, production_line_id FROM production_categories WHERE id = ? LIMIT 1`, [n]
      );
      if (!rows.length) errors.product_category_id = [`Product Category id '${n}' does not exist.`];
      else { out.production_category_id = n; out.production_line_id = rows[0].production_line_id; }
    }
  } else if (body.product_category !== undefined) {
    const pc = String(body.product_category).trim();
    if (!pc) {
      errors.product_category = ['Cannot be blank.'];
    } else if (/^\d+$/.test(pc)) {
      const n = Number(pc);
      const [rows] = await pool.query(
        `SELECT id, production_line_id FROM production_categories WHERE id = ? LIMIT 1`, [n]
      );
      if (!rows.length) errors.product_category = [`Product Category id '${n}' does not exist.`];
      else { out.production_category_id = n; out.production_line_id = rows[0].production_line_id; }
    } else {
      // Find-or-create so SAP can introduce new categories on the fly.
      // Pull the category's production_line_id so the product mirrors it.
      const catId = await findOrCreateProductCategory(pc);
      out.production_category_id = catId;
      const [catRows] = await pool.query(
        `SELECT production_line_id FROM production_categories WHERE id = ? LIMIT 1`, [catId]
      );
      if (catRows[0]) out.production_line_id = catRows[0].production_line_id;
    }
  }
  if (body.uom_type_id !== undefined) {
    const v = body.uom_type_id;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      errors.uom_type_id = ['Must be a positive integer.'];
    } else {
      const [rows] = await pool.query(`SELECT id FROM uoms WHERE id = ? LIMIT 1`, [n]);
      if (!rows.length) errors.uom_type_id = [`UOM Type id '${n}' does not exist.`];
      else out.base_uom_id = n;
    }
  } else if (body.uom_type !== undefined) {
    const u = String(body.uom_type).trim();
    if (!u) {
      errors.uom_type = ['Cannot be blank.'];
    } else if (/^\d+$/.test(u)) {
      const n = Number(u);
      const [rows] = await pool.query(`SELECT id FROM uoms WHERE id = ? LIMIT 1`, [n]);
      if (!rows.length) errors.uom_type = [`UOM Type id '${n}' does not exist.`];
      else out.base_uom_id = n;
    } else {
      // Find-or-create by name/code so SAP can introduce new units on the fly.
      out.base_uom_id = await findOrCreateUom(u);
    }
  }
  if (body.product_variant_size !== undefined) {
    const m = toDecimal(body.product_variant_size);
    if (m === null || m < 0) errors.product_variant_size = ['Must be a non-negative decimal.'];
    else out.net_content = m;
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
    // Title-case so the column reads "Active"/"Inactive" instead of SCREAMING.
    out.status = a ? 'Active' : 'Inactive';
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
    const sujalMatrixId = data.sujal_matrix_id;

    const out = await withTx(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO products
           (uuid, created_at, updated_at, is_active,
            sku_code, product_name, short_name, hsn_code, mrp, status,
            primary_packaging_id, secondary_packaging_id, tax_id, sujal_matrix_id, production_unit_id, base_uom_id, production_category_id, production_line_id,
            net_content, pack_size_conversion, sync_type,
            has_tertiary_packaging, saleable, returnable, batch_tracking, expiry_tracking,
            fefo_enforced, mfg_date_required, inward_qc_required, grn_auto_approval,
            damage_tracking, stock_rotation_rule, partial_dispatch_allowed,
            created_by_id, updated_by_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ?,
                 ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, 'sap-sync',
                 0, 1, 0, 0, 0,
                 0, 0, 0, 1,
                 0, 'FIFO', 1,
                 ?, ?)`,
        [
          data.is_active ?? 1,
          variantCode, productName, productName.slice(0, 100), data.hsn_code || null, data.mrp || 0, data.status || 'Active',
          data.primary_packaging_id, data.secondary_packaging_id, data.tax_id, sujalMatrixId || null, data.production_unit_id || null, data.base_uom_id || null, data.production_category_id || null, data.production_line_id || null,
          data.net_content ?? null, data.pack_size_conversion || null,
          cfg.systemUserId, cfg.systemUserId,
        ]
      );
      const productId = r.insertId;

      // SAP doesn't send a zone list per product — every product is sellable
      // in every active zone by default. Insert one products_zones row per
      // active zone (no-op when there are no active zones).
      const [zoneRows] = await conn.query(
        `SELECT id FROM zones WHERE is_active = 1`
      );
      if (zoneRows.length) {
        await conn.query(
          `INSERT INTO products_zones (product_id, zone_id) VALUES ?`,
          [zoneRows.map((z) => [productId, z.id])]
        );
      }

      return { id: productId, sujal_matrix_id: sujalMatrixId || null, zones_mapped: zoneRows.length };
    });

    res.status(201).json({
      ...out,
      variant_code: variantCode,
      product_name: productName,
      mrp: data.mrp ?? 0,
      is_active: !!(data.is_active ?? 1),
      message: 'Created',
    });
  } catch (e) { next(e); }
});

router.put('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [exists] = await pool.query(`SELECT id FROM products WHERE id = ? LIMIT 1`, [id]);
    if (!exists.length) throw new NotFoundError();
    const data = await validateBody(req.body, { isCreate: false });

    const sets = [];
    const params = [];
    for (const k of Object.keys(data)) {
      if (k === 'status' && data.is_active === undefined) continue; // status set alongside is_active
      sets.push(`\`${k}\` = ?`); params.push(data[k]);
    }
    if (req.body.product_name !== undefined) {
      const pn = String(req.body.product_name).trim();
      sets.push('product_name = ?'); params.push(pn);
      sets.push('short_name = ?'); params.push(pn.slice(0, 100));
    }

    if (sets.length) {
      sets.push('updated_at = NOW(6)', 'updated_by_id = ?'); params.push(cfg.systemUserId, id);
      await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    res.status(200).json({
      id,
      ...(data.mrp !== undefined ? { mrp: data.mrp } : {}),
      message: 'Updated',
    });
  } catch (e) { next(e); }
});

module.exports = router;
