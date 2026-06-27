// Backfill external_user_profiles_zones / _towns for BP-master rows whose
// SAP payload carried greater_circle_name / circle_name but never got the
// M2M rows written (the original bp-master.js route ignored those fields).
//
// Source of truth: sap_sync_logs (module_id='bp-master', INBOUND, OK).
// Strategy:
//   1. Pull every successful BP-master POST log
//   2. Parse request_payload — only consider rows that actually carry the
//      greater_circle_name / circle_name keys
//   3. Look up the corresponding external_user_profiles row by party_code
//   4. If a zone/town row is already mapped, skip; otherwise resolve names
//      to ids in zones/towns (case-insensitive) and INSERT the M2M row.
//
// Usage: node backend/scripts/backfill-bp-zones-towns.js          (dry-run)
//        node backend/scripts/backfill-bp-zones-towns.js --apply  (write)
const { pool, query } = require('../src/db');
const { findIdByName } = require('../src/lib/lookup');

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'APPLY mode — changes will be written.' : 'DRY-RUN mode — no writes.');

  // Pull successful BP-master POSTs whose payload carries either key.
  // JSON_EXTRACT returns NULL when the key is absent, so filtering on
  // (greater_circle_name IS NOT NULL OR circle_name IS NOT NULL) trims noise.
  const rows = await query(
    `SELECT id, attempted_at, customer_code, request_payload
       FROM sap_sync_logs
      WHERE module_id = 'bp-master'
        AND method   = 'POST'
        AND status   = 'OK'
        AND (
          JSON_EXTRACT(request_payload, '$.greater_circle_name') IS NOT NULL
          OR JSON_EXTRACT(request_payload, '$.circle_name')      IS NOT NULL
        )
      ORDER BY id`
  );

  if (!rows.length) {
    console.log('No matching BP-master logs found. Nothing to backfill.');
    return;
  }
  console.log(`Found ${rows.length} BP-master logs with greater_circle / circle in payload.`);

  let inspected = 0, skippedAlreadyMapped = 0, skippedNoBp = 0, skippedUnknownZone = 0,
      skippedUnknownTown = 0, addedZone = 0, addedTown = 0;

  for (const r of rows) {
    inspected++;
    const payload = typeof r.request_payload === 'string'
      ? JSON.parse(r.request_payload)
      : r.request_payload;
    if (!payload) continue;
    const partyCode = payload.customer_code || r.customer_code;
    if (!partyCode) { skippedNoBp++; continue; }

    const [bp] = await query(
      `SELECT id FROM external_user_profiles WHERE party_code = ? LIMIT 1`,
      [partyCode]
    );
    if (!bp) {
      console.log(`  log#${r.id} customer_code=${partyCode}: no BP profile — skip`);
      skippedNoBp++;
      continue;
    }
    const bpId = bp.id;

    // ---- Zone (greater_circle_name) ----
    if (payload.greater_circle_name) {
      const zoneName = String(payload.greater_circle_name).trim();
      const [existing] = await query(
        `SELECT id FROM external_user_profiles_zones WHERE externaluserprofile_id = ? LIMIT 1`,
        [bpId]
      );
      if (existing) {
        skippedAlreadyMapped++;
      } else {
        const zoneId = await findIdByName('zones', zoneName);
        if (!zoneId) {
          console.log(`  log#${r.id} party=${partyCode}: zone '${zoneName}' not in zones — skip`);
          skippedUnknownZone++;
        } else {
          console.log(`  log#${r.id} party=${partyCode}: zone '${zoneName}' → zones.id=${zoneId} → bp.id=${bpId}`);
          if (apply) {
            await query(
              `INSERT INTO external_user_profiles_zones (externaluserprofile_id, zone_id) VALUES (?, ?)`,
              [bpId, zoneId]
            );
          }
          addedZone++;
        }
      }
    }

    // ---- Town (circle_name) ----
    if (payload.circle_name) {
      const townName = String(payload.circle_name).trim();
      const [existing] = await query(
        `SELECT id FROM external_user_profiles_towns WHERE externaluserprofile_id = ? LIMIT 1`,
        [bpId]
      );
      if (existing) {
        skippedAlreadyMapped++;
      } else {
        const townId = await findIdByName('towns', townName);
        if (!townId) {
          console.log(`  log#${r.id} party=${partyCode}: town '${townName}' not in towns — skip`);
          skippedUnknownTown++;
        } else {
          console.log(`  log#${r.id} party=${partyCode}: town '${townName}' → towns.id=${townId} → bp.id=${bpId}`);
          if (apply) {
            await query(
              `INSERT INTO external_user_profiles_towns (externaluserprofile_id, town_id) VALUES (?, ?)`,
              [bpId, townId]
            );
          }
          addedTown++;
        }
      }
    }
  }

  console.log('\nSummary');
  console.log(`  logs inspected         : ${inspected}`);
  console.log(`  already-mapped (skip)  : ${skippedAlreadyMapped}`);
  console.log(`  no BP profile          : ${skippedNoBp}`);
  console.log(`  zone name unknown      : ${skippedUnknownZone}`);
  console.log(`  town name unknown      : ${skippedUnknownTown}`);
  console.log(`  ${apply ? 'inserted' : 'would insert'} zone rows  : ${addedZone}`);
  console.log(`  ${apply ? 'inserted' : 'would insert'} town rows  : ${addedTown}`);
  if (!apply && (addedZone + addedTown)) {
    console.log('\nRe-run with --apply to write the changes.');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
