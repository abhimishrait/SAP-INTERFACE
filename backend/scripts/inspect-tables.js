// Dump detailed info for the tables most relevant to the SAP integration.
const d = require('../schema-dump.json');

const TARGETS = [
  // Core BP master + geo
  'outlet_profiles', 'organizations', 'organization_addresses',
  'zones', 'towns', 'cities', 'states', 'countries',
  // Catalog
  'packaging_types', 'master_lookups', 'production_categories',
  'production_lines', 'production_units', 'product_domains',
  'products', 'products_channels', 'products_product_domains', 'products_zones',
  'product_images', 'uoms', 'taxes',
  // Pricing
  'price_groups', 'price_lists', 'price_list_items',
  'special_price_lists', 'special_price_list_items',
  // Schemes (likely blanket agreement)
  'schemes', 'scheme_versions', 'scheme_rules', 'scheme_slabs',
  'scheme_types', 'scheme_multi_buy_products',
  // Orders / delivery
  'sales_orders', 'order_items', 'order_status_history', 'ordering_rules',
  // Sync + logs
  'sap_sync_logs', 'audit_trail', 'activity_logs',
  // Auth
  'users', 'positions', 'departments',
  // Payment
  'payment_preferences',
  // Outlet meta
  'outlet_classes', 'outlet_types', 'store_sizes', 'channels',
];

for (const name of TARGETS) {
  const t = d.tables[name];
  if (!t) { console.log(`-- MISSING: ${name}\n`); continue; }
  console.log(`### ${name}   (~${t.approxRows ?? '?'} rows)`);
  for (const c of t.columns) {
    const flags = [c.key, c.nullable ? 'NULL' : 'NOT NULL', c.extra].filter(Boolean).join(' ');
    console.log(`  ${c.name.padEnd(34)} ${c.type.padEnd(28)} ${flags}`);
  }
  if (t.foreignKeys.length) {
    console.log('  FKs:');
    for (const f of t.foreignKeys) console.log(`    ${f.column} → ${f.referencesTable}.${f.referencesColumn}`);
  }
  if (t.sampleRows && t.sampleRows.length) {
    console.log('  Sample row keys: ' + Object.keys(t.sampleRows[0]).join(', '));
  }
  console.log('');
}
