// Factory: builds POST/PUT handlers for "simple master" tables that have
//   id (PK), uuid, created_at, updated_at, is_active, name, code, ...optional cols
// — i.e. zones, towns, packaging_types, product_domains, payment_preferences, price_groups, ...
//
// The factory wraps SAP payload conventions:
//   - `name` (or a configured payload key) → DB column
//   - `status` Y/N/1/0 → is_active
//   - case-insensitive uniqueness on `name`
//
// Pass `extra` to add additional columns + validation:
//   extra: async ({ body, conn }) => ({ columns: { foo_id: 12 }, errors: {...} })

const { query, pool } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required, hasAlpha } = require('../lib/validate');
const cfg = require('../config');

function buildSimpleMaster({
  table,
  nameColumn = 'name',
  payloadNameKey = 'name',
  rejectNumericOnly = true,
  extra = null,
}) {
  async function findByNameCI(name, excludeId = null) {
    const params = [String(name).trim()];
    let sql = `SELECT id FROM \`${table}\` WHERE LOWER(\`${nameColumn}\`) = LOWER(?)`;
    if (excludeId != null) { sql += ' AND id <> ?'; params.push(excludeId); }
    const [rows] = await pool.query(sql + ' LIMIT 1', params);
    return rows[0] ? rows[0].id : null;
  }

  // Derive a `code` automatically when the target table requires one but
  // SAP doesn't send it. Strategy: uppercase + underscore, fall back to numeric suffix on collision.
  async function ensureUniqueCode(name) {
    const base = String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40) || 'X';
    let code = base;
    for (let i = 1; i < 50; i++) {
      const [rows] = await pool.query(`SELECT 1 FROM \`${table}\` WHERE code = ? LIMIT 1`, [code]);
      if (!rows.length) return code;
      code = base + '_' + i;
    }
    throw new ValidationError({ name: ['Could not derive a unique code; please pass a different name.'] });
  }

  // Look up a row by user-supplied code (case-sensitive, like all `code` cols in DMS).
  async function findByCode(code, excludeId = null) {
    if (!code) return null;
    const params = [String(code).trim()];
    let sql = `SELECT id FROM \`${table}\` WHERE \`code\` = ?`;
    if (excludeId != null) { sql += ' AND id <> ?'; params.push(excludeId); }
    const [rows] = await pool.query(sql + ' LIMIT 1', params);
    return rows[0] ? rows[0].id : null;
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

      // Accept an explicit `code` from the SAP payload. If provided we must enforce
      // uniqueness on it so updates can be addressed by code later. If absent, we
      // fall through and the auto-derive logic below kicks in.
      if (req.body.code !== undefined && req.body.code !== null && req.body.code !== '') {
        const userCode = String(req.body.code).trim().toUpperCase();
        const dup = await findByCode(userCode);
        if (dup) throw new ValidationError({ code: ['This value already exists.'] });
        cols.code = userCode;
      }

      let extraCols = {};
      if (extra) {
        const result = await extra({ body: req.body, mode: 'create' });
        if (result?.errors && Object.keys(result.errors).length) throw new ValidationError(result.errors);
        extraCols = result?.columns || {};
      }
      Object.assign(cols, extraCols);

      // Auto-fill NOT-NULL-without-default columns the SAP payload doesn't carry.
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
      if (needsValue('code') && !cols.code) cols.code = await ensureUniqueCode(name);
      if (needsValue('sort_order') && cols.sort_order === undefined) cols.sort_order = 0;
      if (needsValue('description') && cols.description === undefined) cols.description = '';

      cols.is_active = isActive ? 1 : 0;
      // Standard Django-style audit columns
      cols.created_by_id = cfg.systemUserId;
      cols.updated_by_id = cfg.systemUserId;

      const keys = Object.keys(cols);
      const placeholders = keys.map(() => '?').join(',');
      const sql = `INSERT INTO \`${table}\`
        (uuid, created_at, updated_at, ${keys.map(k => `\`${k}\``).join(',')})
        VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ${placeholders})`;
      const [result] = await pool.query(sql, keys.map(k => cols[k]));
      res.status(201).json({ id: result.insertId, ...cols, is_active: !!cols.is_active });
    } catch (e) { next(e); }
  }

  async function update(req, res, next) {
    try {
      // Identification strategy (in order):
      //   1. body.code            — preferred; the URL stays clean
      //   2. /sap/<m>/CARTON_12/  — code in URL path (back-compat)
      //   3. /sap/<m>/123/        — numeric DB id (legacy / debug)
      const fromUrl = String(req.params.id || '').trim();
      const fromBody = req.body && req.body.code ? String(req.body.code).trim().toUpperCase() : '';
      const raw = fromBody || fromUrl;
      if (!raw) {
        throw new ValidationError({ code: ['Required: pass `code` in the request body to identify the record.'] });
      }
      let id = null;
      if (/^\d+$/.test(raw)) {
        id = Number(raw);
        const [exists] = await pool.query(`SELECT id FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]);
        if (!exists.length) throw new NotFoundError();
      } else {
        id = await findByCode(raw);
        if (!id) throw new NotFoundError();
      }

      const sets = {};
      if (payloadNameKey in req.body) {
        const name = String(req.body[payloadNameKey]).trim();
        if (rejectNumericOnly && !hasAlpha(name)) {
          throw new ValidationError({ [payloadNameKey]: ['Purely numeric names are not allowed.'] });
        }
        const dup = await findByNameCI(name, id);
        if (dup) throw new ValidationError({ [payloadNameKey]: ['This value already exists.'] });
        sets[nameColumn] = name;
      }
      // Allow renaming the `code` too (rare, but possible — e.g. SAP rationalizes codes).
      if (req.body.code !== undefined && req.body.code !== null && req.body.code !== '') {
        const userCode = String(req.body.code).trim().toUpperCase();
        const dup = await findByCode(userCode, id);
        if (dup) throw new ValidationError({ code: ['This value already exists.'] });
        sets.code = userCode;
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
      if (!Object.keys(sets).length) return res.status(200).json({ id, updated: false });

      sets.updated_by_id = cfg.systemUserId;
      const keys = Object.keys(sets);
      const sql = `UPDATE \`${table}\`
        SET updated_at = NOW(6), ${keys.map(k => `\`${k}\` = ?`).join(', ')}
        WHERE id = ?`;
      await pool.query(sql, [...keys.map(k => sets[k]), id]);
      res.status(200).json({ id, ...sets, is_active: 'is_active' in sets ? !!sets.is_active : undefined });
    } catch (e) { next(e); }
  }

  return { create, update };
}

module.exports = buildSimpleMaster;
