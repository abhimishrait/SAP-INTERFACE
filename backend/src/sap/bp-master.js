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
  // Spec §3.1: credit_limit is a non-negative decimal (last-value-wins, stored on the BP row).
  if (body.credit_limit !== undefined && body.credit_limit !== null && body.credit_limit !== '') {
    const n = Number(body.credit_limit);
    if (!Number.isFinite(n) || n < 0) {
      errors.credit_limit = ['Must be a non-negative decimal.'];
    }
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
  //
  // When both greater_circle_name and circle_name are supplied, the town's
  // parent zone (towns.zone_id) must match the resolved greater_circle. This
  // catches SAP payloads that pair a town with the wrong zone, instead of
  // silently persisting the mismatched pair.
  if (body.greater_circle_name) {
    const zid = await findIdByName('zones', body.greater_circle_name);
    if (!zid) errors.greater_circle_name = [`Zone '${body.greater_circle_name}' does not exist.`];
    else out.zone_id = zid;
  }
  if (body.circle_name) {
    const townRef = String(body.circle_name).trim();
    const [rows] = await pool.query(
      `SELECT id, zone_id FROM towns WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [townRef]
    );
    if (!rows.length) {
      errors.circle_name = [`Town '${body.circle_name}' does not exist.`];
    } else {
      out.town_id = rows[0].id;
      out._town_zone_id = rows[0].zone_id;
    }
  }
  // Cross-check: greater_circle ↔ circle parentage.
  if (out.zone_id && out.town_id) {
    if (out._town_zone_id == null) {
      errors.circle_name = [`Greater circle not mapped to circle '${body.circle_name}'.`];
    } else if (Number(out._town_zone_id) !== Number(out.zone_id)) {
      errors.circle_name = [`Greater circle '${body.greater_circle_name}' not mapped to circle '${body.circle_name}'.`];
    }
  }
  delete out._town_zone_id;
  // reporting_to_emp → external_user_profiles.reporting_to_id (FK → users.id).
  //
  // The employee code lives on `internal_user_profiles.employee_code` (UNIQUE),
  // NOT on `users.employee_code` (which is NULL for every row in this DB). Join
  // through internal_user_profiles to get the linked users.id, which is what
  // the FK on external_user_profiles.reporting_to_id targets.
  //
  // 400 if the code is unknown so the integration surfaces the gap instead of
  // silently dropping the link.
  if (body.reporting_to_emp !== undefined && body.reporting_to_emp !== null && body.reporting_to_emp !== '') {
    const code = String(body.reporting_to_emp).trim();
    const [rows] = await pool.query(
      `SELECT u.id
         FROM internal_user_profiles iup
         JOIN users u ON u.id = iup.user_id
        WHERE iup.employee_code = ?
          AND iup.is_active = 1
          AND u.user_type = 'internal'
        LIMIT 1`,
      [code]
    );
    if (!rows.length) {
      errors.reporting_to_emp = [`Employee code '${code}' does not match any active internal employee.`];
    } else {
      out.reporting_to_id = rows[0].id;
    }
  }
  // Channels: BP master is single-channel per business rule (the join table
  // schema allows multiple but the spec says one BP → one channel). Accept
  // either the canonical singular keys (`channel_name` / `channel_code`) or
  // the plural form for forward-compat — but reject any payload that resolves
  // to more than one distinct channel so silent data loss is impossible.
  const channelInput =
    body.channel_name !== undefined ? body.channel_name
    : body.channel_code !== undefined ? body.channel_code
    : body.channels !== undefined ? body.channels
    : body.channel_codes !== undefined ? body.channel_codes
    : body.channel_names !== undefined ? body.channel_names
    : undefined;
  if (channelInput !== undefined) {
    const ids = await resolveChannelIds(channelInput, 'channel_name');
    if (ids.length > 1) {
      throw new ValidationError({
        channel_name: ['Only one channel is allowed per BP — send a single string, not an array of multiple.'],
      });
    }
    out.channel_ids = ids;
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

// Country name → countries.id. Mints a countries row when absent so a fresh
// DMS doesn't 500 on the first BP that references a new country.
async function findOrCreateCountryId(conn, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const [rows] = await conn.query(
    `SELECT id FROM countries WHERE LOWER(name) = LOWER(?) OR UPPER(code) = UPPER(?) LIMIT 1`,
    [trimmed, trimmed]
  );
  if (rows[0]) return rows[0].id;
  // Derive a 3-char code from the name; suffix on collision.
  const base = trimmed.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'XXX';
  let code = base;
  for (let i = 1; i < 50; i++) {
    const [dup] = await conn.query(`SELECT 1 FROM countries WHERE code = ? LIMIT 1`, [code]);
    if (!dup.length) break;
    code = base.slice(0, 2) + i;
  }
  const [r] = await conn.query(
    `INSERT INTO countries (uuid, created_at, updated_at, is_active, name, code, created_by_id, updated_by_id)
     VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, ?, ?, ?, ?)`,
    [trimmed, code, cfg.systemUserId, cfg.systemUserId]
  );
  return r.insertId;
}

// Persist SAP's bill_to_* / ship_to_* into user_addresses. One row per address
// type ('billing' / 'shipping'), idempotent (delete + re-insert on each call).
// Skips the type entirely when its address_line_1 is absent from the payload.
// pincode is NOT NULL on the table but SAP doesn't send one — default to ''.
async function syncBpAddresses(conn, userId, body) {
  const specs = [
    { type: 'billing',  line: body.bill_to_address_line_1, country: body.bill_to_country_name },
    { type: 'shipping', line: body.ship_to_address_line_1, country: body.ship_to_country_name },
  ];
  const touched = specs.filter(s => s.line !== undefined || s.country !== undefined);
  if (!touched.length) return;
  for (const s of touched) {
    await conn.query(
      `DELETE FROM user_addresses WHERE user_id = ? AND address_type = ?`,
      [userId, s.type]
    );
    // Only insert when the caller supplied at least a line — otherwise treat
    // the payload as "clear this address type".
    if (!s.line) continue;
    const countryId = await findOrCreateCountryId(conn, s.country);
    await conn.query(
      `INSERT INTO user_addresses
         (uuid, created_at, updated_at, is_active,
          address_type, address_line_1, address_line_2, pincode, is_default,
          user_id, country_id,
          created_by_id, updated_by_id)
       VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
               ?, ?, NULL, '', 1,
               ?, ?,
               ?, ?)`,
      [s.type, String(s.line).trim().slice(0, 255), userId, countryId, cfg.systemUserId, cfg.systemUserId]
    );
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

      // credit_limit: SAP's push wins; omit → 0 (matches the DB default and
      // avoids resetting an existing value only on create paths).
      const creditLimit =
        req.body.credit_limit === undefined || req.body.credit_limit === null || req.body.credit_limit === ''
          ? 0
          : Number(req.body.credit_limit);

      const [r] = await conn.query(
        `INSERT INTO external_user_profiles
           (uuid, created_at, updated_at, is_active,
            party_code, party_name, billing_relationship, date_of_joining,
            gstin, pan, status,
            user_id, position_id, department_id, organization_id, production_unit_id, price_group_id,
            payment_term_id, cost_center_code, credit_limit, reporting_to_id,
            date_of_birth, father_name, mother_name, gender,
            created_by_id, updated_by_id)
         VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), ?,
                 ?, ?, 'principal_direct', ?,
                 ?, ?, ?,
                 ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, ?, ?, ?,
                 ?, ?)`,
        [
          isActive,
          req.body.customer_code, req.body.store_name, parseDate(req.body.date_of_joining),
          req.body.vat_number, req.body.pan_number, isActive ? 'active' : 'inactive',
          userId, positionId, departmentId, orgId, productionUnitId, lookups.price_group_id || null,
          lookups.payment_term_id || null, costCenterCode, creditLimit, lookups.reporting_to_id || null,
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
      // bill_to_* / ship_to_* → user_addresses (one row per type).
      await syncBpAddresses(conn, userId, req.body);
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
    // SAP sometimes hits the same /sap/bp-master/<id>/ URL for different BPs,
    // putting the actual customer_code in the body. Trusting only the URL id
    // would either overwrite the wrong BP or (as we've seen) 400 with
    // "customer_code / contact_number already exists" because the body's data
    // belongs to a different profile. Prefer body.customer_code when present,
    // fall back to URL id otherwise. Same forgiveness as products PUT /
    // blanket-agreement's resolveAgreementId.
    let exists = [];
    const bodyCode = req.body && req.body.customer_code
      ? String(req.body.customer_code).trim()
      : '';
    if (bodyCode) {
      [exists] = await pool.query(
        `SELECT id, user_id, party_code FROM external_user_profiles WHERE party_code = ? LIMIT 1`,
        [bodyCode]
      );
    }
    if (!exists.length) {
      const fromUrl = Number(req.params.id);
      if (Number.isInteger(fromUrl) && fromUrl > 0) {
        [exists] = await pool.query(
          `SELECT id, user_id, party_code FROM external_user_profiles WHERE id = ? LIMIT 1`,
          [fromUrl]
        );
      }
    }
    if (!exists.length) throw new NotFoundError();
    const id = exists[0].id;

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
    // credit_limit: only touch when the key is in the payload — SAP sends partial
    // PUTs and we must not zero a prior value just because the field was omitted.
    if (req.body.credit_limit !== undefined) {
      const raw = req.body.credit_limit;
      sets.push('credit_limit = ?');
      params.push(raw === null || raw === '' ? 0 : Number(raw));
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

    // bill_to_* / ship_to_* → user_addresses. Only touched when one of the
    // address keys is present in the payload.
    if (
      req.body.bill_to_address_line_1 !== undefined || req.body.bill_to_country_name !== undefined ||
      req.body.ship_to_address_line_1 !== undefined || req.body.ship_to_country_name !== undefined
    ) {
      const conn = await pool.getConnection();
      try {
        await syncBpAddresses(conn, exists[0].user_id, req.body);
      } finally {
        conn.release();
      }
    }

    // Sync user row for name/phone/email changes.
    // `email` is NOT NULL on users — mirror the POST fallback so an empty
    // email_id falls back to "<customer_code>@sap.local" instead of NULL.
    const userSets = [];
    const userParams = [];
    for (const [src, dst] of Object.entries({
      first_name: 'first_name', middle_name: 'middle_name', last_name: 'last_name',
      contact_country_code: 'country_code', contact_number: 'phone',
    })) {
      if (req.body[src] !== undefined) { userSets.push(`\`${dst}\` = ?`); userParams.push(req.body[src] || null); }
    }
    if (req.body.email_id !== undefined) {
      const trimmed = String(req.body.email_id || '').trim();
      const customerCode = req.body.customer_code || exists[0].party_code;
      const email = trimmed || (customerCode ? `${String(customerCode).toLowerCase()}@sap.local` : null);
      if (email) { userSets.push('`email` = ?'); userParams.push(email); }
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
