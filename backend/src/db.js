const mysql = require('mysql2/promise');
const cfg = require('./config');

const pool = mysql.createPool({
  ...cfg.db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: false,
  // Omit `timezone` → mysql2 uses the Node process's local timezone, which matches
  // the MySQL server's local time (both run on the same machine). Setting 'Z' here
  // would (incorrectly) re-interpret stored datetimes as UTC and the frontend's
  // NPT formatter would then add another +05:45, displaying ~17:xx for noon NPT.
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
