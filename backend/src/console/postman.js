// /console/postman — emit a Postman v2.1 collection covering all 16 SAP modules.
// Drops straight into Postman → Import → paste URL or download + drag.
const express = require('express');
const cfg = require('../config');

const router = express.Router();

// Module catalog mirrors the spec table of contents (3.1 - 3.16).
const MODULES = [
  { id: 'bp-master',            code: '3.1',  label: 'BP Master',              methods: ['POST', 'PUT'] },
  { id: 'blanket-agreement',    code: '3.2',  label: 'Blanket Agreement',      methods: ['POST', 'PUT'] },
  { id: 'greater-circles',      code: '3.3',  label: 'Greater Circles',        methods: ['POST', 'PUT'] },
  { id: 'circles',              code: '3.4',  label: 'Circles',                methods: ['POST', 'PUT'] },
  { id: 'container',            code: '3.5',  label: 'Container',              methods: ['POST', 'PUT'] },
  { id: 'matrix',               code: '3.6',  label: 'Matrix',                 methods: ['POST', 'PUT'] },
  { id: 'product-class',        code: '3.7',  label: 'Product Class',          methods: ['POST', 'PUT'] },
  { id: 'product-name',         code: '3.8',  label: 'Product Name',           methods: ['POST', 'PUT'] },
  { id: 'payment-terms',        code: '3.9',  label: 'Payment Terms',          methods: ['POST', 'PUT'] },
  { id: 'price-list-group',     code: '3.10', label: 'Price List Group',       methods: ['POST', 'PUT'] },
  { id: 'price-list',           code: '3.11', label: 'Price List',             methods: ['POST', 'PUT'] },
  { id: 'special-price-list',   code: '3.12', label: 'Special Price List',     methods: ['POST', 'PUT'] },
  { id: 'products',             code: '3.13', label: 'Products (Variants)',    methods: ['POST', 'PUT'] },
  { id: 'delivery-order',       code: '3.14', label: 'Delivery Order',         methods: ['POST', 'PUT'] },
  { id: 'balance-status-update',code: '3.15', label: 'Balance Status Update',  methods: ['PUT'] },
  { id: 'order-status-sync',    code: '3.16', label: 'Order Status Sync',      methods: ['PUT'] },
  { id: 'invoice-order',        code: 'EXT',  label: 'Invoice Order',          methods: ['POST'] },
  { id: 'channels',             code: 'EXT',  label: 'Channels',               methods: ['POST', 'PUT'] },
];

// Spec sample bodies (truncated here; matches Section 3.x of the spec).
const SAMPLES = {
  'bp-master': {
    customer_code: 'CUST1013', store_name: 'Param Dairy Store',
    first_name: 'Ram', middle_name: 'Kumar', last_name: 'Sharma',
    contact_country_code: '+977', contact_number: '9800000000', email_id: '',
    date_of_birth: '1995-06-15',
    bill_to_address_line_1: 'Kathmandu Main Road', bill_to_country_name: 'Nepal',
    ship_to_address_line_1: 'Warehouse Area',     ship_to_country_name: 'Nepal',
    role_name: 'Dealer Incharger',
    vat_number: '123456789', pan_number: '123456789',
    date_of_joining: '2026-01-15',
    bank_guarantee_amount: '100000', bank_guarantee_expiry: '2026-06-15',
    reporting_to_emp: 'EMP001',
    greater_circle_name: 'Zone A', circle_name: 'Town X',
    payment_terms: 'Net 30', rate_group: 'Standard',
    channel_name: 'GT',
    status: 'Y', cost_center_master: 'CC.100',
  },
  'blanket-agreement': {
    bp_code: 'CUST1001', agreement_no: 12345,
    agreement_method: 'qty', agreement_type: 'general',
    start_date: '2026-01-01', end_date: '2026-12-31', status: 'A',
    lines: [{ line_number: 1, item_code: 'FR0001', item_name: 'Fresh Milk 500ml', planned_quantity: '1000', portion_of_returns: '5' }],
  },
  'greater-circles':    { name: 'Zone A', status: 'Y' },
  'circles':            { name: 'Town X', greater_circle_name: 'Zone A', status: 'Y' },
  'container':          { name: 'CRATE', level: 'PRIMARY', status: 'Y' },
  'matrix':             { name: 'Matrix Group 1', status: 'Y' },
  'product-class':      { name: 'Dairy Products', unit: 'Ltr', status: 'Y' },
  'product-name':       { name: 'Fresh Milk', product_class_name: 'Dairy Products', status: 'Y' },
  'payment-terms':      { payment_term_name: 'Net 30', term_days: '30', status: 'Y' },
  'price-list-group':   { name: 'Standard', status: 'Y' },
  'price-list':         { rate_group: 'Standard', item_code: 'FR0001', container_price: '1585.54', status: 'Y' },
  'special-price-list': { item_code: 'FR0123', container_price: '1585.54', discount: '10', party_code: 'CUST1000', start_date: '2022-01-01', end_date: '2022-12-31', status: 'Y' },
  'products': {
    product_name: 'SAMPLE PRODUCT', hsn_code: '0401', variant_code: 'SKU001',
    sujal_matrix: 'Matrix Group 1',
    primary_selling_unit_name: 'CRATE', primary_selling_unit_quantity: 12,
    secondary_selling_unit_name: 'POUCH', secondary_selling_unit_quantity: 1,
    mrp: 500,
    is_packaging_allow: 'Y', status: 'Y',
    production_unit_id: 1,
    uom_type: 'EA',
    product_category: 'Dairy',
    product_variant_size: 500,
    tax_code: [{ country_name: 'Nepal', tax_name: 'VAT', tax_percentage: '13' }],
    channels: ['GT', 'MT'],
  },
  'delivery-order': {
    invoice_number: 'INV001', do_entry: 'DOE001', do_number: 'DO-001',
    doc_entry: 'DOC001', doc_number_so: 'DOC-SO-001',
    do_date: '2026-02-20',
    do_amount: '5000.00', do_tax: '650.00', do_total: '5650.00',
    production_unit: 'Unit A',
    do_details: [{ item_code: 'SKU001', rate: '100.00', quantity: '50', uom: 'PCS', batch_number: 'B001', mfg_date: '2026-01-01', expiry_date: '2026-06-01', amount: '5000.00' }],
  },
  'balance-status-update': { party_code: 'PARTY001', updated_amount: 1500.5 },
  'order-status-sync':     { doc_entry: 'DOC001', doc_number_so: 'DOC-SO-001', status: 'Cancel' },
  'invoice-order': {
    card_code: '600032447', card_name: 'S.K. STORES',
    doc_date: '2026-07-01', doc_due_date: '2026-07-31', tax_date: '2026-07-01',
    comments: 'SO-2026-0008 Based On Sales Orders 4786. Based On Deliveries 3175.',
    group_num: 5,
    doc_entry_so: '23047', doc_number_so: '4786',
    invoice_details: [{
      line_number: 0, item_code: 'FG102010',
      quantity: 100.0, price: 1536.38,
      line_total: 153638.0, line_total_with_tax: 153638.0,
      vat_group: 'VAT-13', ocr_code: 'BAG 1', cogs_ocr_code: 'BAG 1',
      agr_no: 35247, batch_number: 'STORE100',
      mfg_date: '1899-12-30', expiry_date: '2028-07-02',
    }],
  },
  'channels': {
    channel_code: 'GT', channel_name: 'General Trade',
    short_name: 'GT', description: 'General trade outlets',
    status: 'Y',
  },
};

function reqItem(mod, method) {
  const isPutWithId = method === 'PUT' && mod.methods.includes('POST');
  const path = isPutWithId ? `/sap/${mod.id}/{{record_id}}/` : `/sap/${mod.id}/`;
  const body = SAMPLES[mod.id] || {};
  const description =
    `Spec §${mod.code} · ${mod.label}\n` +
    `Push from SAP. ${method === 'POST' ? 'Creates' : 'Updates'} via SalesPort DMS.\n` +
    `Uniqueness, validations, and FK rules per the spec — see DMS docs.`;

  return {
    name: `${mod.code} ${mod.label} · ${method}`,
    request: {
      method,
      header: [{ key: 'Content-Type', value: 'application/json' }],
      body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } },
      url: {
        raw: `{{base_url}}${path}`,
        host: ['{{base_url}}'],
        path: path.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean),
      },
      description,
    },
    response: [],
  };
}

function groupBy(arr, fn) {
  const out = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(x);
  }
  return out;
}

router.get('/', (req, res) => {
  const baseUrl = req.query.base || `http://localhost:${cfg.port}`;
  // Group by spec category (master / transactional) for cleaner Postman folders.
  const masterIds = new Set(['bp-master','blanket-agreement','greater-circles','circles','container','matrix','product-class','product-name','payment-terms','price-list-group','price-list','special-price-list','products','channels']);
  const txnIds    = new Set(['delivery-order','invoice-order','balance-status-update','order-status-sync']);

  const masters = MODULES.filter(m => masterIds.has(m.id));
  const txns    = MODULES.filter(m => txnIds.has(m.id));

  const folderFor = (title, modules) => ({
    name: title,
    item: modules.flatMap(mod => mod.methods.map(method => reqItem(mod, method))),
  });

  const collection = {
    info: {
      _postman_id: '6f8c2e10-salesport-sap-b1-v1-2',
      name: 'SalesPort × SAP · v1.2',
      description: 'All 16 SAP-facing endpoints from the SalesPort × SAP Integration spec v1.2. '
        + 'Base URL, basic-auth credentials, and {{record_id}} are pre-wired as Postman variables.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [
      folderFor('Master Data (3.1 – 3.13)', masters),
      folderFor('Transactional (3.14 – 3.16)', txns),
    ],
    auth: {
      type: 'basic',
      basic: [
        { key: 'username', value: '{{auth_user}}', type: 'string' },
        { key: 'password', value: '{{auth_pass}}', type: 'string' },
      ],
    },
    variable: [
      { key: 'base_url', value: baseUrl, type: 'string' },
      { key: 'auth_user', value: cfg.sapAuth.user, type: 'string' },
      { key: 'auth_pass', value: cfg.sapAuth.pass, type: 'string' },
      { key: 'record_id', value: '1', type: 'string' },
    ],
  };

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="salesport-sap-postman-${ts}.json"`);
  res.send(JSON.stringify(collection, null, 2));
});

module.exports = router;
