// 3.1 BP Master → external_user_profiles (party_code unique).
// We also create/lookup a paired user record (DMS treats every BP as a User).
// Address fields (bill_to_*, ship_to_*) are stashed alongside; if you later want a
// dedicated outlet_profiles entry, that can be a follow-up.
const express = require('express');
const { pool, withTx } = require('../db');
const { toBool } = require('../lib/statusMap');
const { ValidationError, NotFoundError, required, isEmail, parseDate } = require('../lib/validate');
const { findIdByName, findIdByCode, resolveChannelIds } = require('../lib/lookup');
const cfg = require('../config');

const router = express.Router();

const REQUIRED = [
  'customer_code', 'store_name', 'first_name', 'last_name',
  'contact_country_code', 'contact_number',
  'bill_to_address_line_1', 'bill_to_country_name',
  'ship_to_address_line_1', 'ship_to_country_name',
  'vat_number', 'pan_number', 'date_of_joining', 'status',
];

async function validatePayload(body, { mode, partyId }) {
  const errors = {};
  if (mode === 'create') {
    for (const f of REQUIRED) {
      if (body[f] === undefined || body[f] === null || body[f] === '') errors[f] = ['This field is required.'];
    }
  }
  if (body.email_id && !isEmail(body.email_id)) errors.email_id = ['Enter a valid email address.'];
  if (body.contact_country_code && !/^\+\d{1,4}$/.test(body.contact_country_code)) {
    errors.contact_country_code = ['Use international format like +977 or +91.'];
  }
  if (body.date_of_joining !== undefined && !parseDate(body.date_of_joining)) {
    errors.date_of_joining = ['Date has wrong format. Use YYYY-MM-DD.'];
  }
  if (body.date_of_birth && !parseDate(body.date_of_birth)) {
    errors.date_of_birth = ['Date has wrong format. Use YYYY-MM-DD.'];
  }
  if (body.bank_guarantee_expiry && !parseDate(body.bank_guarantee_expiry)) {
    errors.bank_guarantee_expiry = ['Date has wrong format. Use YYYY-MM-DD.'];
  }
  if (body.status !== undefined && toBool(body.status) === null) {
    errors.status = ['Use Y/N or 1/0.'];
  }
  // Spec §3.1: vat_number string(15), pan_number string(15). The DMS `pan` column
  // is only 10 chars (matches Indian PAN format), so we cap at 10 there to avoid
  // a downstream DB truncate / 500.
  if (body.vat_number && String(body.vat_number).length > 15) {
    errors.vat_number = ['Must be 15 characters or fewer.'];
  }
  if (body.pan_number && String(body.pan_number).length > 10) {
    errors.pan_number = ['Must be 10 characters or fewer.'];
  }
  // Spec §3.1: cost_center_master is alphanumeric + space + dot, normalized to UPPER.
  if (body.cost_center_master !== undefined && body.cost_center_master !== null && body.cost_center_master !== '') {
    if (!/^[A-Za-z0-9 .]+$/.test(String(body.cost_center_master))) {
      errors.cost_center_master = ['Only letters, digits, spaces, and dots are allowed.'];
    }
  }
  // Uniqueness checks (skip the row itself on PUT)
  if (body.customer_code) {
    const [r] = await pool.query(
      `SELECT id FROM external_user_profiles WHERE party_code = ? AND id <> ? LIMIT 1`,
      [body.customer_code, partyId || 0]
    );
    if (r.length) errors.customer_code = ['This value already exists.'];
  }
  if (body.contact_number) {
    const [r] = await pool.query(
      `SELECT u.id FROM users u
        LEFT JOIN external_user_profiles e ON e.user_id = u.id
        WHERE u.phone = ? AND (e.id IS NULL OR e.id <> ?) LIMIT 1`,
      [body.contact_number, partyId || 0]
    );
    if (r.length) errors.contact_number = ['This value already exists.'];
  }
  if (body.email_id) {
    const [r] = await pool.query(
      `SELECT u.id FROM users u
        LEFT JOIN external_user_profiles e ON e.user_id = u.id
        WHERE u.email = ? AND (e.id IS NULL OR e.id <> ?) LIMIT 1`,
      [body.email_id, partyId || 0]
    );
    if (r.length) errors.email_id = ['This value already exists.'];
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

async function resolveLookups(body) {
  const out = {};
  const errors = {};
  if (body.role_name) {
    const pid = await findIdByName('positions', body.role_name);
    if (pid) out.position_id = pid;
  }
  if (body.department_name) {
    out.department_id = await findIdByName('departments', body.department_name) || null;
  }
  // Payment Terms FK — accept either `payment_terms` or `payment_term_name`.
  // The value can be the term's name OR its code (case-insensitive on name, exact match on code).
  const ptRef = body.payment_terms || body.payment_term_name;
  if (ptRef) {
    const ref = String(ptRef).trim();
    const [rows] = await pool.query(
      `SELECT id FROM payment_terms
        WHERE LOWER(payment_term_name) = LOWER(?) OR code = ? LIMIT 1`,
      [ref, ref.toUpperCase()]
    );
    if (!rows.length) {
      errors.payment_terms = [`Payment Terms '${ref}' does not exist.`];
    } else {
      out.payment_term_id = rows[0].id;
    }
  }
  if (body.rate_group || body.rate_group_name) {
    out.price_group_id = await findIdByName('price_groups', body.rate_group || body.rate_group_name) || null;
  }
  if (body.organization_name) {
    out.organization_id = await findIdByName('organizations', body.organization_name) || null;
  }
  if (body.production_unit) {
    out.production_unit_id = await findIdByName('production_units', body.production_unit) || null;
  }
  // Greater Circle (3.3) → zones | Circle (3.4) → towns. Both are M2M on the
  // BP profile (external_user_profiles_zones / _towns); resolve to ids here
  // and let the caller persist the M2M rows.
  if (body.greater_circle_name) {
    const zid = await findIdByName('zones', body.greater_circle_name);
    if (!zid) errors.greater_circle_name = [`Zone '${body.greater_circle_name}' does not exist.`];
    else out.zone_id = zid;
  }
  if (body.circle_name) {
    const tid = await findIdByName('towns', body.circle_name);
    if (!tid) errors.circle_name = [`Town '${body.circle_name}' does not exist.`];
    else out.town_id = tid;
  }
  // reporting_to_emp → users.id (internal employee that this BP reports to).
  // SAP now sends the employee CODE; we look it up against users.employee_code
  // (only `user_type='internal'` is eligible). 400 if the code is unknown so
  // the integration surfaces the gap instead of silently dropping the link.
  if (body.reporting_to_emp !== undefined && body.reporting_to_emp !== null && body.reporting_to_emp !== '') {
    const code = String(body.reporting_to_emp).trim();
    const [rows] = await pool.query(
      `SELECT id FROM users WHERE employee_code = ? AND user_type = 'internal' LIMIT 1`,
      [code]
    );
    if (!rows.length) {
      errors.reporting_to_emp = [`Employee code '${code}' does not match any internal user.`];
    } else {
      out.reporting_to_id = rows[0].id;
    }
  }
  // Channels: SAP can send `channels` (array of code/name strings) and/or the
  // convenience singular `channel_code` / `channel_name`. Resolve all references
  // to ids; the caller persists into external_user_profiles_channels.
  const channelInput =
    body.channels !== undefined ? body.channels
    : body.channel_codes !== undefined ? body.channel_codes
    : body.channel_names !== undefined ? body.channel_names
    : body.channel_code !== undefined ? body.channel_code
    : body.channel_name !== undefined ? body.channel_name
    : undefined;
  if (channelInput !== undefined) {
    out.channel_ids = await resolveChannelIds(channelInput, 'channels');
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

// Replace the BP profile's zone/town M2M with the resolved single pair (idempotent).
async function syncBpZonesTowns(conn, externalProfileId, { zoneId, townId }) {
  if (zoneId !== undefined) {
    await conn.query(
      `DELETE FROM external_user_profiles_zones WHERE externaluserprofile_id = ?`,
      [externalProfileId]
    );
    if (zoneId) {
      await conn.query(
        `INSERT INTO external_user_profiles_zones (externaluserprofile_id, zone_id) VALUES (?, ?)`,
        [externalProfileId, zoneId]
      );
    }
  }
  if (townId !== undefined) {
    await conn.query(
      `DELETE FROM external_user_profiles_towns WHERE externaluserprofile_id = ?`,
      [externalProfileId]
    );
    if (townId) {
      await conn.query(
        `INSERT INTO external_user_profiles_towns (externaluserprofile_id, town_id) VALUES (?, ?)`,
        [externalProfileId, townId]
      );
    }
  }
}

// Replace the BP's channel M2M set with `channelIds` (idempotent).
// channelIds: array of channel ids, or null to skip (key absent in payload).
async function syncBpChannels(conn, externalProfileId, channelIds) {
  if (channelIds === null || channelIds === undefined) return;
  await conn.query(
    `DELETE FROM external_user_profiles_channels WHERE externaluserprofile_id = ?`,
    [externalProfileId]
  );
  if (channelIds.length) {
    await conn.query(
      `INSERT INTO external_user_profiles_channels (externaluserprofile_id, channel_id) VALUES ?`,
      [channelIds.map(cid => [externalProfileId, cid])]
    );
  }
}

// Sensible DMS defaults when SAP doesn't supply organization / production_unit:
// pick the first active row from each table so the BP looks like a native DMS row.
async function findDefaultOrgId(conn) {
  const [rows] = await conn.query(`SELECT id FROM organizations WHERE is_active = 1 ORDER BY id LIMIT 1`);
  return rows[0]?.id || null;
}
async function findDefaultProductionUnitId(conn) {
  const [rows] = await conn.query(`SELECT id FROM production_units WHERE is_active = 1 ORDER BY id LIMIT 1`);
  return rows[0]?.id || null;
}

// Defaults the DMS UI marks required but SAP doesn't send:
//   department -> "Sales", position -> "Distributor", gender -> "male".
// Resolved at insert time (case-insensitive name lookup) so the BP profile
// passes the same validation the human form enforces.
async function findDefaultPositionId(conn) {
  const [byName] = await conn.query(
    `SELECT id FROM positions WHERE LOWER(name) = 'distributor' LIMIT 1`
  );
  if (byName.length) return byName[0].id;
  const [ext] = await conn.query(`SELECT id FROM positions WHERE is_external = 1 ORDER BY id LIMIT 1`);
  if (ext.length) return ext[0].id;
  const [any] = await conn.query(`SELECT id FROM positions ORDER BY id LIMIT 1`);
  return any[0]?.id || null;
}

async function findDefaultDepartmentId(conn) {
  const [rows] = await conn.query(
    `SELECT id FROM departments WHERE LOWER(name) = 'sales' LIMIT 1`
  );
  return rows[0]?.id || null;
}

const DEFAULT_GENDER = 'male';

router.post('/', async (req, res, next) => {
  try {
    await validatePayload(req.body, { mode: 'create' });
    const isActive = toBool(req.body.status) ? 1 : 0;
    const lookups = await resolveLookups(req.body);

    const created = await withTx(async (conn) => {
      // 1) Create or reuse a paired user record
      const email = req.body.email_id?.trim() || `${req.body.customer_code.toLowerCase()}@sap.local`;
      let userId;
      const [u] = await conn.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
      if (u.length) {
        userId = u[0].id;
      } else {
        const [r] = await conn.query(
          `INSERT INTO users
            (password, is_superuser, uuid, email, phone, first_name, last_name,
             user_type, is_active, is_staff, date_joined, created_at, updated_at,
             country_code, middle_name, failed_login_attempts)
           VALUES ('!sap', 0, REPLACE(UUID(),'-',''), ?, ?, ?, ?,
                   'external', ?, 0, NOW(6), NOW(6), NOW(6),
                   ?, ?, 0)`,
          [email, req.body.contact_number, req.body.first_name, req.body.last_name,
            isActive, req.body.contact_country_code, req.body.middle_name || null]
        );
        userId = r.insertId;
      }

      // 2) Required position FK
      let positionId = lookups.position_id || await findDefaultPositionId(conn);
      if (!positionId) {
        throw new ValidationError({ role_name: ['No external position configured in DMS — create one in `positions` first.'] });
      }

      // 3) Insert the BP profile
      const orgId = lookups.organization_id || await findDefaultOrgId(conn);
      const productionUnitId = lookups.production_unit_id || await findDefaultProductionUnitId(conn);
      const departmentId = lookups.department_id || await findDefaultDepartmentId(conn);
      const gender = (req.body.gender && String(req.body.gender).trim()) || DEFAULT_GENDER;
      // cost_center_code is NOT NULL on external_user_profiles with no default.
      // SAP sends `cost_center_master` (validated above as alphanumeric+space+dot);
      // spec normalizes to UPPER. Accept either field name; empty string when absent
      // so the BP create doesn't 500 for SAP payloads that omit the cost center.
      const ccRaw = req.body.cost_center_master ?? req.body.cost_center_code ?? '';
      const costCenterCode = String(ccRaw).trim().toUpperCase().slice(0, 50);

      const [r] = await conn.query(
        `INSERT INTO external_user_profiles
           (uuid, created_at, updated_at, is_active,
            party_code, party_name, billing_relationship, date_of_joining,
            gstin, pan, status,
            user_id, position_id, department_id, organization_id, production_unit_id, price_group_id,
            payment_term_id, cost_center_code, reporting_to_id,
            date_of_birth, father_name, mother_name, gender,
            created_by_id, updated_by_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ?,
                 ?, ?, 'principal_direct', ?,
                 ?, ?, ?,
                 ?, ?, ?, ?, ?, ?,
                 ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, ?)`,
        [
          isActive,
          req.body.customer_code, req.body.store_name, parseDate(req.body.date_of_joining),
          req.body.vat_number, req.body.pan_number, isActive ? 'active' : 'inactive',
          userId, positionId, departmentId, orgId, productionUnitId, lookups.price_group_id || null,
          lookups.payment_term_id || null, costCenterCode, lookups.reporting_to_id || null,
          parseDate(req.body.date_of_birth) || null, null, null, gender,
          cfg.systemUserId, cfg.systemUserId,
        ]
      );
      // Greater Circle / Circle → external_user_profiles_zones / _towns
      await syncBpZonesTowns(conn, r.insertId, {
        zoneId: lookups.zone_id,
        townId: lookups.town_id,
      });
      // Channels → external_user_profiles_channels (M2M; multiple allowed)
      await syncBpChannels(conn, r.insertId, lookups.channel_ids ?? null);
      return {
        id: r.insertId,
        user_id: userId,
        payment_term_id: lookups.payment_term_id || null,
        zone_id: lookups.zone_id || null,
        town_id: lookups.town_id || null,
        channel_ids: lookups.channel_ids ?? null,
      };
    });

    res.status(201).json({
      ...created,
      customer_code: req.body.customer_code,
      party_name: req.body.store_name,
      is_active: !!isActive,
      message: 'BP Master created successfully',
    });
  } catch (e) { next(e); }
});

router.put('/:id/', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [exists] = await pool.query(`SELECT id, user_id FROM external_user_profiles WHERE id = ? LIMIT 1`, [id]);
    if (!exists.length) throw new NotFoundError();

    await validatePayload(req.body, { mode: 'update', partyId: id });

    const lookups = await resolveLookups(req.body);
    const sets = [];
    const params = [];

    const map = {
      customer_code: 'party_code',
      store_name: 'party_name',
      vat_number: 'gstin',
      pan_number: 'pan',
    };
    for (const [src, dst] of Object.entries(map)) {
      if (req.body[src] !== undefined) { sets.push(`\`${dst}\` = ?`); params.push(req.body[src]); }
    }
    if (req.body.status !== undefined) {
      const a = toBool(req.body.status);
      sets.push('is_active = ?', `status = ?`);
      params.push(a ? 1 : 0, a ? 'active' : 'inactive');
    }
    if (req.body.date_of_joining !== undefined) {
      sets.push('date_of_joining = ?'); params.push(parseDate(req.body.date_of_joining));
    }
    if (req.body.date_of_birth !== undefined) {
      sets.push('date_of_birth = ?'); params.push(parseDate(req.body.date_of_birth));
    }
    if (req.body.cost_center_master !== undefined || req.body.cost_center_code !== undefined) {
      const ccRaw = req.body.cost_center_master ?? req.body.cost_center_code ?? '';
      sets.push('cost_center_code = ?');
      params.push(String(ccRaw).trim().toUpperCase().slice(0, 50));
    }
    for (const k of ['position_id', 'department_id', 'organization_id', 'production_unit_id', 'price_group_id', 'payment_term_id', 'reporting_to_id']) {
      if (lookups[k] !== undefined) { sets.push(`\`${k}\` = ?`); params.push(lookups[k]); }
    }

    if (sets.length) {
      sets.push('updated_at = NOW(6)', 'updated_by_id = ?'); params.push(cfg.systemUserId, id);
      await pool.query(`UPDATE external_user_profiles SET ${sets.join(', ')} WHERE id = ?`, params);
    }

    // Sync greater_circle / circle M2M (only when those keys are present in the payload).
    if (req.body.greater_circle_name !== undefined || req.body.circle_name !== undefined) {
      const conn = await pool.getConnection();
      try {
        await syncBpZonesTowns(conn, id, {
          zoneId: req.body.greater_circle_name !== undefined ? (lookups.zone_id || null) : undefined,
          townId: req.body.circle_name !== undefined ? (lookups.town_id || null) : undefined,
        });
      } finally {
        conn.release();
      }
    }

    // Sync channels M2M only when one of the channel keys is present in the payload.
    // Sending `"channels": []` clears all channel assignments for this BP.
    if (lookups.channel_ids !== undefined) {
      const conn = await pool.getConnection();
      try {
        await syncBpChannels(conn, id, lookups.channel_ids);
      } finally {
        conn.release();
      }
    }

    // Sync user row for name/phone/email changes
    const userSets = [];
    const userParams = [];
    for (const [src, dst] of Object.entries({
      first_name: 'first_name', middle_name: 'middle_name', last_name: 'last_name',
      contact_country_code: 'country_code', contact_number: 'phone', email_id: 'email',
    })) {
      if (req.body[src] !== undefined) { userSets.push(`\`${dst}\` = ?`); userParams.push(req.body[src] || null); }
    }
    if (userSets.length) {
      userSets.push('updated_at = NOW(6)');
      userParams.push(exists[0].user_id);
      await pool.query(`UPDATE users SET ${userSets.join(', ')} WHERE id = ?`, userParams);
    }
    res.status(200).json({ id, message: 'Record updated successfully' });
  } catch (e) { next(e); }
});

module.exports = router;
