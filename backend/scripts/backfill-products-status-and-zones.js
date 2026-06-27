// Two-step cleanup for products:
//   1. Normalize products.status to Title Case ("Active" / "Inactive").
//      Existing rows have a mix of "ACTIVE", "INACTIVE", and "Active".
//   2. Backfill products_zones so every product is linked to every active zone.
//      The SAP route now does this on POST; older products predate that change.
//
// Usage: node backend/scripts/backfill-products-status-and-zones.js          (dry-run)
//        node backend/scripts/backfill-products-status-and-zones.js --apply  (write)
const { pool, query } = require('../src/db');

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'APPLY mode — changes will be written.' : 'DRY-RUN mode — no writes.');

  // ----- 1) Status casing -----
  console.log('\n[1] products.status casing');
  const before = await query(
    `SELECT status, COUNT(*) AS c FROM products GROUP BY status ORDER BY c DESC`
  );
  console.log('  before:');
  for (const r of before) console.log(`    ${JSON.stringify(r.status).padEnd(12)} ${r.c}`);

  // BINARY ... = forces case-sensitive comparison so we don't no-op the already-good rows.
  const [{ to_active }]   = await query(
    `SELECT COUNT(*) AS to_active   FROM products WHERE BINARY status IN ('ACTIVE','active')`
  );
  const [{ to_inactive }] = await query(
    `SELECT COUNT(*) AS to_inactive FROM products WHERE BINARY status IN ('INACTIVE','inactive','Incative')`
  );
  console.log(`  would rewrite "Active":   ${to_active}`);
  console.log(`  would rewrite "Inactive": ${to_inactive}`);

  if (apply) {
    if (to_active) {
      await query(`UPDATE products SET status = 'Active'   WHERE BINARY status IN ('ACTIVE','active')`);
    }
    if (to_inactive) {
      await query(`UPDATE products SET status = 'Inactive' WHERE BINARY status IN ('INACTIVE','inactive','Incative')`);
    }
    const after = await query(
      `SELECT status, COUNT(*) AS c FROM products GROUP BY status ORDER BY c DESC`
    );
    console.log('  after:');
    for (const r of after) console.log(`    ${JSON.stringify(r.status).padEnd(12)} ${r.c}`);
  }

  // ----- 2) products_zones default fill -----
  console.log('\n[2] products_zones default-all-zones backfill');
  const zoneRows = await query(`SELECT id FROM zones WHERE is_active = 1`);
  const zoneIds = zoneRows.map((z) => z.id);
  console.log(`  active zones: ${zoneIds.length} (ids: ${zoneIds.join(', ')})`);

  if (!zoneIds.length) {
    console.log('  no active zones — nothing to map.');
  } else {
    // For every product, compute which of these zones it ISN'T already mapped to.
    const productRows = await query(`SELECT id FROM products ORDER BY id`);
    console.log(`  products total: ${productRows.length}`);

    const existing = await query(
      `SELECT product_id, zone_id FROM products_zones WHERE zone_id IN (?)`,
      [zoneIds]
    );
    const have = new Set(existing.map((r) => `${r.product_id}:${r.zone_id}`));

    const pending = [];
    for (const p of productRows) {
      for (const zid of zoneIds) {
        if (!have.has(`${p.id}:${zid}`)) pending.push([p.id, zid]);
      }
    }
    console.log(`  missing M2M rows: ${pending.length} (max possible = ${productRows.length * zoneIds.length})`);

    if (pending.length) {
      if (apply) {
        // Bulk insert in chunks of 1000 to stay well under max_allowed_packet.
        const CHUNK = 1000;
        for (let i = 0; i < pending.length; i += CHUNK) {
          await query(
            `INSERT INTO products_zones (product_id, zone_id) VALUES ?`,
            [pending.slice(i, i + CHUNK)]
          );
        }
        const [{ c }] = await query(`SELECT COUNT(*) AS c FROM products_zones`);
        console.log(`  inserted ${pending.length} rows. products_zones total now: ${c}`);
      } else {
        console.log('  (dry-run — pass --apply to insert)');
      }
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
