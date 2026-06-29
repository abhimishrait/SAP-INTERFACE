// Channel master → channels (simple master with explicit, SAP-supplied code)
//
//   POST /sap/channels/
//   {
//     "channel_code": "GT",              -- required, unique, max 50 chars
//     "channel_name": "General Trade",   -- required, unique (case-insensitive), max 255
//     "short_name":   "GT",              -- optional, max 50
//     "description":  "General trade",   -- optional
//     "status":       "Y"                -- Y/N or 1/0
//   }
//
//   PUT /sap/channels/:id/  — partial updates of any of the above
//
// Built on `_simpleMaster` like the other masters; we override the auto-derived
// `code` because the DMS UI lets users pick channel codes explicitly (e.g. "003"
// for a channel named "Kasdf"), so SAP must do the same.
const express = require('express');
const { pool } = require('../db');
const buildSimpleMaster = require('./_simpleMaster');

const router = express.Router();

async function findIdByCode(code, excludeId = null) {
  const params = [String(code).trim()];
  let sql = `SELECT id FROM channels WHERE code = ?`;
  if (excludeId != null) { sql += ' AND id <> ?'; params.push(excludeId); }
  const [rows] = await pool.query(sql + ' LIMIT 1', params);
  return rows[0] ? rows[0].id : null;
}

const { create, update } = buildSimpleMaster({
  table: 'channels',
  nameColumn: 'name',
  payloadNameKey: 'channel_name',
  extra: async ({ body, mode, id }) => {
    const errors = {};
    const columns = {};

    const codeProvided = body.channel_code !== undefined
      && body.channel_code !== null
      && String(body.channel_code).trim() !== '';

    if (codeProvided) {
      const code = String(body.channel_code).trim();
      if (code.length > 50) {
        errors.channel_code = ['Must be at most 50 characters.'];
      } else {
        const dup = await findIdByCode(code, mode === 'update' ? id : null);
        if (dup) errors.channel_code = ['This value already exists.'];
        else columns.code = code;
      }
    } else if (mode === 'create') {
      errors.channel_code = ['This field is required.'];
    }

    if (body.short_name !== undefined && body.short_name !== null) {
      const sn = String(body.short_name).trim();
      if (sn.length > 50) errors.short_name = ['Must be at most 50 characters.'];
      else columns.short_name = sn || null;
    }

    if (body.description !== undefined && body.description !== null) {
      columns.description = String(body.description);
    }

    return { columns, errors };
  },
  createdMessage: 'Channel created successfully',
  updatedMessage: 'Channel updated successfully',
});

router.post('/', create);
router.put('/:id/', update);

module.exports = router;
