// Backfill external_user_profiles.reporting_to_id for past BP-master rows
// whose SAP payload carried `reporting_to_emp` as a person NAME (not a code).
//
// Strategy:
//   1. Pull every successful BP-master POST log
//   2. For each row whose payload has `reporting_to_emp`, look up the matching
//      internal user (user_type='internal') by case-insensitive
//      CONCAT(first_name,' ',last_name). EXACT match only — anything ambiguous
//      or unmatched is skipped (and reported).
//   3. If the BP profile already has reporting_to_id set, leave it alone.
//
// Usage: node backend/scripts/backfill-bp-reporting-to.js          (dry-run)
//        node backend/scripts/backfill-bp-reporting-to.js --apply  (write)
const { pool, query } = require('../src/db');

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'APPLY mode — changes will be written.' : 'DRY-RUN mode — no writes.');

  const rows = await query(
    `SELECT id, customer_code, request_payload
       FROM sap_sync_logs
      WHERE module_id = 'bp-master'
        AND method   = 'POST'
        AND status   = 'OK'
        AND JSON_EXTRACT(request_payload, '$.reporting_to_emp') IS NOT NULL
      ORDER BY id`
  );

  if (!rows.length) {
    console.log('No BP-master logs with reporting_to_emp. Nothing to backfill.');
    return;
  }
  console.log(`Found ${rows.length} BP-master logs carrying reporting_to_emp.`);

  // Cache name→userId so we hit the DB once per distinct reporting name.
  const cache = new Map();
  async function resolveInternalUserByName(name) {
    const key = name.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const matches = await query(
      `SELECT id, first_name, last_name
         FROM users
        WHERE user_type = 'internal'
          AND LOWER(CONCAT(first_name, ' ', last_name)) = LOWER(?)`,
      [name]
    );
    // EXACT match means exactly one internal user with that name.
    const id = matches.length === 1 ? matches[0].id : null;
    cache.set(key, { id, ambiguous: matches.length > 1, candidates: matches });
    return cache.get(key);
  }

  let inspected = 0, alreadySet = 0, noBp = 0,
      noMatch = 0, ambiguous = 0, applied = 0;
  const unmatchedNames = new Map();
  const ambiguousNames = new Map();

  for (const r of rows) {
    inspected++;
    const payload = typeof r.request_payload === 'string'
      ? JSON.parse(r.request_payload)
      : r.request_payload;
    if (!payload || !payload.reporting_to_emp) continue;
    const reportingName = String(payload.reporting_to_emp).trim();
    const partyCode = payload.customer_code || r.customer_code;
    if (!partyCode) { noBp++; continue; }

    const [bp] = await query(
      `SELECT id, reporting_to_id FROM external_user_profiles WHERE party_code = ? LIMIT 1`,
      [partyCode]
    );
    if (!bp) { noBp++; continue; }
    if (bp.reporting_to_id) { alreadySet++; continue; }

    const res = await resolveInternalUserByName(reportingName);
    if (res.ambiguous) {
      ambiguous++;
      ambiguousNames.set(reportingName, (ambiguousNames.get(reportingName) || 0) + 1);
      continue;
    }
    if (!res.id) {
      noMatch++;
      unmatchedNames.set(reportingName, (unmatchedNames.get(reportingName) || 0) + 1);
      continue;
    }

    console.log(`  party=${partyCode} bp.id=${bp.id} reporting='${reportingName}' → users.id=${res.id}`);
    if (apply) {
      await query(
        `UPDATE external_user_profiles SET reporting_to_id = ?, updated_at = NOW(6) WHERE id = ?`,
        [res.id, bp.id]
      );
    }
    applied++;
  }

  console.log('\nSummary');
  console.log(`  logs inspected                : ${inspected}`);
  console.log(`  BP already had reporting_to_id: ${alreadySet}`);
  console.log(`  no BP profile for log         : ${noBp}`);
  console.log(`  name unmatched (skip)         : ${noMatch}`);
  console.log(`  name ambiguous (skip)         : ${ambiguous}`);
  console.log(`  ${apply ? 'updated' : 'would update'} BP rows           : ${applied}`);

  if (unmatchedNames.size) {
    console.log('\nUnmatched names (no internal user with that exact name):');
    for (const [name, count] of unmatchedNames) console.log(`  "${name}" — ${count} log(s)`);
  }
  if (ambiguousNames.size) {
    console.log('\nAmbiguous names (multiple internal users matched):');
    for (const [name, count] of ambiguousNames) console.log(`  "${name}" — ${count} log(s)`);
  }
  if (!apply && applied) console.log('\nRe-run with --apply to write the changes.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
