// Helpers for "find by name/code (case-insensitive)" against DMS lookup tables.
const { one, query } = require('../db');
const { ValidationError } = require('./validate');

// Generic CI-lookup. Returns id or null.
async function findIdByName(table, name, col = 'name') {
  if (!name) return null;
  const row = await one(
    `SELECT id FROM \`${table}\` WHERE LOWER(\`${col}\`) = LOWER(?) LIMIT 1`,
    [String(name).trim()]
  );
  return row ? row.id : null;
}

async function findIdByCode(table, code) {
  if (!code) return null;
  const row = await one(
    `SELECT id FROM \`${table}\` WHERE \`code\` = ? LIMIT 1`,
    [String(code).trim()]
  );
  return row ? row.id : null;
}

// Resolve a name to an id; throws ValidationError({ field: [msg] }) if not found.
async function mustResolve(table, name, fieldOnPayload, { col = 'name', msg } = {}) {
  const id = await findIdByName(table, name, col);
  if (!id) {
    throw new ValidationError({
      [fieldOnPayload]: [msg || `${fieldOnPayload} '${name}' does not exist.`],
    });
  }
  return id;
}

// Used by Product Class (3.7) — production_categories.production_line_id is NOT NULL,
// SAP doesn't send a line; use the configured default code.
async function defaultProductionLineId(defaultCode) {
  const id = await findIdByCode('production_lines', defaultCode);
  if (id) return id;
  // create one if missing — keeps the integration self-healing on a fresh DB.
  const { pool } = require('../db');
  const [res] = await pool.query(
    `INSERT INTO production_lines
       (uuid, created_at, updated_at, is_active, name, code)
     VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, ?, ?)`,
    [defaultCode, defaultCode]
  );
  return res.insertId;
}

// Resolve channels for M2M links on BP and Product masters.
// Accepts:
//   - undefined / null  → returns null   (caller treats as "field absent, don't touch M2M")
//   - "GT"              → returns [<id>] (single string)
//   - ["GT", "MT", ...] → returns ids in input order, deduped
//   - []                → returns []     ("clear all assignments")
// Each item is matched against `channels.code` first, then `channels.name` (CI).
// Throws ValidationError({ [fieldName]: ["Channel 'X' does not exist."] }) on miss.
async function resolveChannelIds(input, fieldName = 'channels') {
  if (input === undefined || input === null) return null;
  const list = Array.isArray(input) ? input : [input];
  const cleaned = list.map(x => String(x ?? '').trim()).filter(Boolean);
  if (!cleaned.length) return [];
  const ids = [];
  for (const ref of cleaned) {
    let id = await findIdByCode('channels', ref);
    if (!id) id = await findIdByName('channels', ref);
    if (!id) throw new ValidationError({ [fieldName]: [`Channel '${ref}' does not exist.`] });
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

module.exports = { findIdByName, findIdByCode, mustResolve, defaultProductionLineId, resolveChannelIds };
