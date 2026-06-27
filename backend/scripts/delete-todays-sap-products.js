// One-off cleanup: delete products created today by the SAP integration,
// plus all dependent child rows (no FK has ON DELETE CASCADE, so we cascade
// manually inside a transaction).
//
// Filter:  sync_type = 'sap-sync' AND DATE(created_at) = CURDATE()
// Usage:   node backend/scripts/delete-todays-sap-products.js
// Skip prompt (CI / non-interactive): pass --yes
const readline = require('readline');
const { pool, query, withTx } = require('../src/db');

const PRODUCT_FILTER = `sync_type = 'sap-sync' AND DATE(created_at) = CURDATE()`;

// Child tables that FK to products.id, in delete order (most dependent first).
// Each entry: [table, "column IN (?) [OR other_column IN (?)]" predicate].
const CHILD_DELETES = [
  ['stock_transaction_items',     'product_id IN (?)'],
  ['stock_levels',                'product_id IN (?)'],
  ['mobile_counter_demand_items', 'product_id IN (?)'],
  ['order_items',                 'product_id IN (?)'],
  ['price_list_items',            'product_id IN (?)'],
  ['special_price_list_items',    'product_id IN (?)'],
  ['product_images',              'product_id IN (?)'],
  ['products_channels',           'product_id IN (?)'],
  ['products_product_domains',    'product_id IN (?)'],
  ['products_zones',              'product_id IN (?)'],
  ['scheme_itc_reversals',        'free_product_id IN (?)'],
  ['scheme_multi_buy_products',   'product_id IN (?)'],
  ['scheme_rules',                'buy_product_id IN (?) OR free_product_id IN (?)'],
];

function confirm(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

async function main() {
  const skipPrompt = process.argv.includes('--yes');

  // Pre-flight: who are we about to delete?
  const targets = await query(
    `SELECT id, sku_code, product_name, created_at
       FROM products
      WHERE ${PRODUCT_FILTER}
      ORDER BY id`,
  );

  if (targets.length === 0) {
    console.log('0 products match, nothing to do.');
    return;
  }

  console.log(`Found ${targets.length} product(s) created today via sap-sync:`);
  for (const r of targets.slice(0, 5)) {
    console.log(`  id=${r.id}  sku=${r.sku_code}  name="${r.product_name}"  created_at=${r.created_at.toISOString()}`);
  }
  if (targets.length > 5) console.log(`  … and ${targets.length - 5} more`);

  const ids = targets.map((r) => r.id);

  // Per-child counts so the user knows the full blast radius before confirming.
  console.log('\nDependent child rows:');
  for (const [table, predicate] of CHILD_DELETES) {
    const params = predicate.split('IN (?)').length - 1 === 2 ? [ids, ids] : [ids];
    const [{ c }] = await query(`SELECT COUNT(*) AS c FROM \`${table}\` WHERE ${predicate}`, params);
    console.log(`  ${table.padEnd(32)} ${c}`);
  }

  if (!skipPrompt) {
    const answer = await confirm('\nType "yes" to delete (anything else aborts): ');
    if (answer !== 'yes') { console.log('Aborted.'); return; }
  }

  await withTx(async (conn) => {
    let totalChildren = 0;
    for (const [table, predicate] of CHILD_DELETES) {
      const params = predicate.split('IN (?)').length - 1 === 2 ? [ids, ids] : [ids];
      const [res] = await conn.query(`DELETE FROM \`${table}\` WHERE ${predicate}`, params);
      if (res.affectedRows) console.log(`  - ${table}: deleted ${res.affectedRows}`);
      totalChildren += res.affectedRows;
    }
    const [res] = await conn.query(`DELETE FROM products WHERE id IN (?)`, [ids]);
    console.log(`  - products: deleted ${res.affectedRows}`);
    console.log(`\nTotal child rows removed: ${totalChildren}`);
    console.log(`Total product rows removed: ${res.affectedRows}`);
  });

  // Post-flight verification.
  const [{ c: remaining }] = await query(
    `SELECT COUNT(*) AS c FROM products WHERE ${PRODUCT_FILTER}`,
  );
  console.log(`\nPost-delete count for today's sap-sync products: ${remaining}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
