// Factory: builds POST/PUT handlers for "simple master" tables that have
//   id (PK), uuid, created_at, updated_at, is_active, name, code, ...optional cols
// — i.e. zones, towns, packaging_types, product_domains, payment_terms, price_groups, ...
//
// Spec-strict surface (PDF v1.2, sections 3.3 – 3.10):
//   - POST body: `{ name, status, [module-specific fields] }`  — NO `code` field
//   - PUT path : `/sap/<module>/{id}/` only, where {id} is the integer primary key
//   - Status   : Y/N or 1/0
//   - Names    : case-insensitive uniqueness, allowed chars handled per module
//
// We populate the DMS `code` column server-side by copying the literal name
// (verbatim, including spaces and case). A collision-safe numeric suffix is
// appended only if two distinct rows would otherwise share a code.

const { pool } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required, hasAlpha } = require('../lib/validate');
const cfg = require('../config');

function buildSimpleMaster({
  table,
  nameColumn = 'name',
  payloadNameKey = 'name',
  rejectNumericOnly = true,
  extra = null,
  // Spec response messages — defaults to the generic phrases used for §3.3 – §3.10.
  // Per-module overrides (e.g. "BP Master created successfully") can pass these.
  createdMessage = 'Created',
  updatedMessage = 'Updated',
}) {
  async function findByNameCI(name, excludeId = null) {
    const params = [String(name).trim()];
    let sql = `SELECT id FROM \`${table}\` WHERE LOWER(\`${nameColumn}\`) = LOWER(?)`;
    if (excludeId != null) { sql += ' AND id <> ?'; params.push(excludeId); }
    const [rows] = await pool.query(sql + ' LIMIT 1', params);
    return rows[0] ? rows[0].id : null;
  }

  // The DMS `code` column is NOT NULL with no default for all 7 tables we cover here.
  // The spec doesn't expose `code` to SAP, so we store the literal `name`. If another
  // row already uses that code (e.g. casing collision), suffix `_2`, `_3`, … so the
  // unique constraint holds without forcing SAP to know about it.
  async function deriveUniqueCode(name) {
    const base = String(name || '').trim().slice(0, 48) || 'X';
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}_${i + 1}`;
      const [rows] = await pool.query(`SELECT 1 FROM \`${table}\` WHERE code = ? LIMIT 1`, [candidate]);
      if (!rows.length) return candidate;
    }
    throw new ValidationError({ [payloadNameKey]: ['Could not derive a unique code; please choose a different name.'] });
  }

  async function create(req, res, next) {
    try {
      required(req.body, [payloadNameKey, 'status']);
      const name = String(req.body[payloadNameKey]).trim();
      if (rejectNumericOnly && !hasAlpha(name)) {
        throw new ValidationError({ [payloadNameKey]: ['Purely numeric names are not allowed.'] });
      }
      const isActive = toBool(req.body.status);
      if (isActive === null) throw new ValidationError({ status: ['Use Y/N or 1/0.'] });

      const existing = await findByNameCI(name);
      if (existing) throw new ValidationError({ [payloadNameKey]: ['This value already exists.'] });

      const cols = { [nameColumn]: name };

      let extraCols = {};
      if (extra) {
        const result = await extra({ body: req.body, mode: 'create' });
        if (result?.errors && Object.keys(result.errors).length) throw new ValidationError(result.errors);
        extraCols = result?.columns || {};
      }
      Object.assign(cols, extraCols);

      // Discover NOT-NULL columns without defaults so we can fill them in.
      const [tableCols] = await pool.query(
        `SELECT COLUMN_NAME AS col, IS_NULLABLE AS nul, COLUMN_DEFAULT AS def
           FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = ?`,
        [table]
      );
      const colByName = Object.fromEntries(tableCols.map(c => [c.col.toLowerCase(), c]));
      const needsValue = (colName) => {
        const c = colByName[colName.toLowerCase()];
        return !!(c && c.nul === 'NO' && c.def === null);
      };
      // Always populate `code` from the literal name when the DB has a `code` column.
      if (colByName.code && !cols.code) cols.code = await deriveUniqueCode(name);
      if (needsValue('sort_order') && cols.sort_order === undefined) cols.sort_order = 0;
      if (needsValue('description') && cols.description === undefined) cols.description = '';

      cols.is_active = isActive ? 1 : 0;
      cols.created_by_id = cfg.systemUserId;
      cols.updated_by_id = cfg.systemUserId;

      const keys = Object.keys(cols);
      const placeholders = keys.map(() => '?').join(',');
      const sql = `INSERT INTO \`${table}\`
        (uuid, created_at, updated_at, ${keys.map(k => `\`${k}\``).join(',')})
        VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ${placeholders})`;
      const [result] = await pool.query(sql, keys.map(k => cols[k]));
      res.status(201).json({
        id: result.insertId,
        ...cols,
        is_active: !!cols.is_active,
        message: createdMessage,
      });
    } catch (e) { next(e); }
  }

  async function update(req, res, next) {
    try {
      // Spec-strict: identification is via the integer primary key in the URL path.
      const raw = String(req.params.id || '').trim();
      if (!/^\d+$/.test(raw)) {
        throw new ValidationError({ id: ['Must be the integer primary key from the create response.'] });
      }
      const id = Number(raw);
      const [exists] = await pool.query(`SELECT id FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]);
      if (!exists.length) throw new NotFoundError();

      const sets = {};
      if (payloadNameKey in req.body) {
        const name = String(req.body[payloadNameKey]).trim();
        if (rejectNumericOnly && !hasAlpha(name)) {
          throw new ValidationError({ [payloadNameKey]: ['Purely numeric names are not allowed.'] });
        }
        const dup = await findByNameCI(name, id);
        if (dup) throw new ValidationError({ [payloadNameKey]: ['This value already exists.'] });
        sets[nameColumn] = name;
        // Keep code synced with the (renamed) name verbatim, again with collision suffix if needed.
        const [colCheck] = await pool.query(
          `SELECT 1 FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'code' LIMIT 1`,
          [table]
        );
        if (colCheck.length) {
          // Generate a new code from the new name, but allow the same row to keep its current code.
          let candidate = name.slice(0, 48) || 'X';
          for (let i = 0; i < 50; i++) {
            const c = i === 0 ? candidate : `${candidate}_${i + 1}`;
            const [r] = await pool.query(`SELECT id FROM \`${table}\` WHERE code = ? AND id <> ? LIMIT 1`, [c, id]);
            if (!r.length) { sets.code = c; break; }
          }
        }
      }
      if ('status' in req.body) {
        const isActive = toBool(req.body.status);
        if (isActive === null) throw new ValidationError({ status: ['Use Y/N or 1/0.'] });
        sets.is_active = isActive ? 1 : 0;
      }
      if (extra) {
        const result = await extra({ body: req.body, mode: 'update', id });
        if (result?.errors && Object.keys(result.errors).length) throw new ValidationError(result.errors);
        Object.assign(sets, result?.columns || {});
      }
      if (!Object.keys(sets).length) {
        return res.status(200).json({ id, updated: false, message: updatedMessage });
      }

      sets.updated_by_id = cfg.systemUserId;
      const keys = Object.keys(sets);
      const sql = `UPDATE \`${table}\`
        SET updated_at = NOW(6), ${keys.map(k => `\`${k}\` = ?`).join(', ')}
        WHERE id = ?`;
      await pool.query(sql, [...keys.map(k => sets[k]), id]);
      res.status(200).json({
        id,
        ...sets,
        is_active: 'is_active' in sets ? !!sets.is_active : undefined,
        message: updatedMessage,
      });
    } catch (e) { next(e); }
  }

  return { create, update };
}

module.exports = buildSimpleMaster;
