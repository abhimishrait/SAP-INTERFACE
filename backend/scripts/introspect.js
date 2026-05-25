// One-shot DB schema dump for abc_dms. Run with: node scripts/introspect.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'abc_dms',
  multipleStatements: false,
};

async function main() {
  const conn = await mysql.createConnection(CONFIG);
  const out = { database: CONFIG.database, tables: {} };

  const [tables] = await conn.query(
    `SELECT table_name, table_rows, engine, table_collation
       FROM information_schema.tables
      WHERE table_schema = ?
      ORDER BY table_name`,
    [CONFIG.database]
  );

  for (const t of tables) {
    const name = t.TABLE_NAME || t.table_name;
    const [cols] = await conn.query(
      `SELECT column_name, column_type, is_nullable, column_key, column_default, extra
         FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ?
        ORDER BY ordinal_position`,
      [CONFIG.database, name]
    );
    const [fks] = await conn.query(
      `SELECT column_name, referenced_table_name, referenced_column_name, constraint_name
         FROM information_schema.key_column_usage
        WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
      [CONFIG.database, name]
    );
    const [idx] = await conn.query(
      `SELECT index_name, column_name, non_unique, seq_in_index
         FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = ?
        ORDER BY index_name, seq_in_index`,
      [CONFIG.database, name]
    );
    let sampleRows = [];
    try {
      const [s] = await conn.query(`SELECT * FROM \`${name}\` LIMIT 2`);
      sampleRows = s;
    } catch (e) { /* ignore */ }

    out.tables[name] = {
      engine: t.ENGINE || t.engine,
      approxRows: t.TABLE_ROWS || t.table_rows,
      columns: cols.map(c => ({
        name: c.COLUMN_NAME || c.column_name,
        type: c.COLUMN_TYPE || c.column_type,
        nullable: (c.IS_NULLABLE || c.is_nullable) === 'YES',
        key: c.COLUMN_KEY || c.column_key,
        default: c.COLUMN_DEFAULT ?? c.column_default,
        extra: c.EXTRA || c.extra,
      })),
      foreignKeys: fks.map(f => ({
        column: f.COLUMN_NAME || f.column_name,
        referencesTable: f.REFERENCED_TABLE_NAME || f.referenced_table_name,
        referencesColumn: f.REFERENCED_COLUMN_NAME || f.referenced_column_name,
        constraint: f.CONSTRAINT_NAME || f.constraint_name,
      })),
      indexes: idx.map(i => ({
        name: i.INDEX_NAME || i.index_name,
        column: i.COLUMN_NAME || i.column_name,
        unique: (i.NON_UNIQUE ?? i.non_unique) === 0,
        seq: i.SEQ_IN_INDEX || i.seq_in_index,
      })),
      sampleRows,
    };
  }

  const outPath = path.join(__dirname, '..', 'schema-dump.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  // Also print a compact summary to stdout
  console.log(`Database: ${CONFIG.database}`);
  console.log(`Tables found: ${Object.keys(out.tables).length}`);
  console.log('---');
  for (const [name, info] of Object.entries(out.tables)) {
    console.log(`${name}  (~${info.approxRows ?? '?'} rows, ${info.columns.length} cols)`);
    for (const c of info.columns) {
      const flags = [c.key, c.nullable ? 'NULL' : 'NOT NULL', c.extra].filter(Boolean).join(' ');
      console.log(`    - ${c.name.padEnd(32)} ${c.type.padEnd(28)} ${flags}`);
    }
    if (info.foreignKeys.length) {
      console.log(`    FKs:`);
      for (const f of info.foreignKeys) {
        console.log(`      ${f.column} → ${f.referencesTable}.${f.referencesColumn}`);
      }
    }
    console.log('');
  }
  console.log(`\nFull dump written to: ${outPath}`);
  await conn.end();
}

main().catch(err => {
  console.error('Introspection failed:', err.code || '', err.message);
  process.exit(1);
});
