// /console/db — Database view: list integration-related tables with row counts + size.
const express = require('express');
const { query } = require('../db');

const router = express.Router();

const TABLES_OF_INTEREST = [
  'sap_sync_logs',
  'external_user_profiles', 'user_addresses', 'users',
  'sales_orders', 'order_items', 'order_status_history',
  'products', 'price_lists', 'price_list_items',
  'special_price_lists', 'special_price_list_items',
  'schemes', 'scheme_rules', 'scheme_slabs',
  'zones', 'towns', 'packaging_types', 'product_domains', 'sujal_matrices',
  'production_categories', 'price_groups', 'payment_preferences', 'payment_terms',
  'blanket_agreements', 'blanket_agreement_lines',
  'master_lookups', 'taxes', 'audit_trail', 'activity_logs',
];

router.get('/tables', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT table_name AS name, table_rows AS approx_rows,
              ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb,
              update_time
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${TABLES_OF_INTEREST.map(() => '?').join(',')})
        ORDER BY (data_length + index_length) DESC`,
      TABLES_OF_INTEREST
    );
    res.json({ rows });
  } catch (e) { next(e); }
});

router.get('/tables/:name', async (req, res, next) => {
  try {
    if (!TABLES_OF_INTEREST.includes(req.params.name)) {
      return res.status(404).json({ detail: 'Table is not in the integration view.' });
    }
    const cols = await query(
      `SELECT column_name AS name, column_type AS type, is_nullable AS nullable,
              column_key AS k, column_default AS def, extra
         FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
        ORDER BY ordinal_position`,
      [req.params.name]
    );
    const recent = await query(
      `SELECT * FROM \`${req.params.name}\`
        ORDER BY ${cols.find(c => c.name === 'created_at') ? 'created_at' : 'id'} DESC
        LIMIT 10`
    );
    res.json({ name: req.params.name, columns: cols, recent });
  } catch (e) { next(e); }
});

module.exports = router;
