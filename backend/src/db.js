const mysql = require('mysql2/promise');
const cfg = require('./config');

// NPT (Nepal time, UTC+05:45). We force this on both sides of the wire so
// timestamps are correct regardless of where the Node/MySQL hosts actually run:
//   - `timezone: '+05:45'` → mysql2 parses returned DATETIMEs as NPT wall-clock,
//     so JS Date objects represent the correct UTC instant.
//   - SET time_zone='+05:45' on every new connection (below) → NOW()/CURDATE()
//     write NPT wall-clock into DATETIME columns.
const NPT_OFFSET = '+05:45';

const pool = mysql.createPool({
  ...cfg.db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: false,
  timezone: NPT_OFFSET,
});

pool.on('connection', (connection) => {
  connection.query(`SET time_zone = '${NPT_OFFSET}'`);
});

// Convenience: run a query and return rows only
async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Convenience: get a single row or null
async function one(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Transaction helper. cb receives a connection.
async function withTx(cb) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await cb(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, withTx };
