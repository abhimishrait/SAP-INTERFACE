// Audits the transactional endpoints (Delivery Order §3.14 + Order Status Sync §3.16)
// against the spec's business rules + verifies the DB state after each call.
const http = require('http');
const mysql = require('../node_modules/mysql2/promise');

const AUTH = 'Basic ' + Buffer.from('SujalFoods:SujalFoods@123').toString('base64');
const HOST = 'localhost', PORT = 4000;

function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: HOST, port: PORT, method, path,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: AUTH },
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = buf ? JSON.parse(buf) : null; } catch { parsed = buf; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

let pass = 0, fail = 0;
const failures = [];

async function expect(label, method, path, body, expected) {
  const r = await call(method, path, body);
  const ok = Array.isArray(expected) ? expected.includes(r.status) : r.status === expected;
  const tag = ok ? '✓' : '✗';
  const exp = Array.isArray(expected) ? expected.join('/') : expected;
  console.log(`  ${tag} ${label.padEnd(62)} expect ${exp} got ${r.status}${ok ? '' : '  body=' + JSON.stringify(r.body).slice(0,160)}`);
  if (ok) pass++; else { fail++; failures.push({ label, expected: exp, got: r.status, body: r.body }); }
  return r;
}

async function main() {
  const db = await mysql.createConnection({ host: 'localhost', user: 'root', password: 'root', database: 'abc_dms' });

  // Unique identifiers for this run, so re-runs don't collide on (sap_doc_entry, sap_order_number).
  const stamp = Date.now().toString().slice(-6);
  const docEntry = String(900000 + Number(stamp));
  const docNumberSo = `SO-AUDIT-${stamp}`;
  const doEntry = `DOE-AUDIT-${stamp}`;
  const doNumber = `DO-${stamp}`;

  // ============ 3.14 Delivery Order ============
  console.log('\n=== 3.14 Delivery Order — happy path first ===');

  const goodDo = {
    invoice_number: `INV-${stamp}`,
    do_entry: doEntry,
    do_number: doNumber,
    doc_entry: docEntry,
    doc_number_so: docNumberSo,
    do_date: '2026-05-25',
    do_amount: '5500.00',
    do_tax: '275.00',
    do_total: '5775.00',
    production_unit: 'DEFAULT_LINE',
    do_details: [{
      item_code: 'MILK-FRESH-500',
      rate: '55.00',
      quantity: '100',
      uom: 'PCS',
      batch_number: `BATCH-${stamp}`,
      mfg_date: '2026-05-01',
      expiry_date: '2026-08-01',
      amount: '5500.00',
    }],
  };

  const created = await expect('POST happy path → 201', 'POST', '/sap/delivery-order/', goodDo, 201);
  const orderId = created.body?.id;

  if (orderId) {
    const [rows] = await db.query(
      `SELECT order_number, sap_doc_entry, sap_order_number, status, subtotal, tax_amount, total_amount, order_source
         FROM sales_orders WHERE id = ?`, [orderId]);
    console.log('  DB sales_orders row:', rows[0]);
    const [lines] = await db.query(
      `SELECT line_total, quantity, rate, product_id, packaging_level FROM order_items WHERE order_id = ?`, [orderId]);
    console.log('  DB order_items:', lines);
  }

  console.log('\n=== 3.14 Delivery Order — validation rules ===');
  await expect('missing do_entry → 400',          'POST', '/sap/delivery-order/', { ...goodDo, do_entry: undefined, doc_entry: `${docEntry}1` }, 400);
  await expect('missing doc_number_so → 400',     'POST', '/sap/delivery-order/', { ...goodDo, doc_number_so: undefined, doc_entry: `${docEntry}2` }, 400);
  await expect('negative do_amount → 400',        'POST', '/sap/delivery-order/', { ...goodDo, do_amount: '-1', doc_entry: `${docEntry}3` }, 400);
  await expect('negative do_tax → 400',           'POST', '/sap/delivery-order/', { ...goodDo, do_tax: '-50', doc_entry: `${docEntry}4` }, 400);
  await expect('negative do_total → 400',         'POST', '/sap/delivery-order/', { ...goodDo, do_total: '-100', doc_entry: `${docEntry}5` }, 400);
  await expect('empty do_details [] → 400',       'POST', '/sap/delivery-order/', { ...goodDo, do_details: [], doc_entry: `${docEntry}6` }, 400);
  await expect('missing do_details → 400',        'POST', '/sap/delivery-order/', { ...goodDo, do_details: undefined, doc_entry: `${docEntry}7` }, 400);
  await expect('bad item_code in line → 400',     'POST', '/sap/delivery-order/', { ...goodDo, doc_entry: `${docEntry}8`,
                                                       do_details: [{ ...goodDo.do_details[0], item_code: 'NOPE-SKU' }] }, 400);
  await expect('duplicate item_code in lines → 400','POST','/sap/delivery-order/', { ...goodDo, doc_entry: `${docEntry}9`,
                                                       do_details: [goodDo.do_details[0], goodDo.do_details[0]] }, 400);
  await expect('negative line rate → 400',        'POST', '/sap/delivery-order/', { ...goodDo, doc_entry: `${docEntry}A`,
                                                       do_details: [{ ...goodDo.do_details[0], rate: '-1' }] }, 400);
  await expect('negative line amount → 400',      'POST', '/sap/delivery-order/', { ...goodDo, doc_entry: `${docEntry}B`,
                                                       do_details: [{ ...goodDo.do_details[0], amount: '-100' }] }, 400);
  await expect('zero quantity → 400',             'POST', '/sap/delivery-order/', { ...goodDo, doc_entry: `${docEntry}C`,
                                                       do_details: [{ ...goodDo.do_details[0], quantity: '0' }] }, 400);
  await expect('expiry < mfg → 400',              'POST', '/sap/delivery-order/', { ...goodDo, doc_entry: `${docEntry}D`,
                                                       do_details: [{ ...goodDo.do_details[0], mfg_date: '2026-06-01', expiry_date: '2026-05-01' }] }, 400);
  await expect('bad do_date format → 400',        'POST', '/sap/delivery-order/', { ...goodDo, do_date: '25/05/2026', doc_entry: `${docEntry}E` }, 400);

  // ============ 3.14 Delivery Order — PUT replaces do_details ============
  console.log('\n=== 3.14 Delivery Order — PUT replaces do_details ===');
  if (orderId) {
    await expect('PUT replace lines with one new → 200', 'PUT', `/sap/delivery-order/${orderId}/`, {
      do_details: [{ item_code: 'MILK-FRESH-500', rate: '60.00', quantity: '50', uom: 'PCS', amount: '3000.00' }],
    }, 200);
    const [lines] = await db.query(`SELECT COUNT(*) AS c, SUM(quantity) AS qsum FROM order_items WHERE order_id = ?`, [orderId]);
    console.log('  after PUT — order_items count =', lines[0].c, ' totalQty =', lines[0].qsum, '(expect 1 row, qty 50)');
  }

  // ============ 3.16 Order Status Sync ============
  console.log('\n=== 3.16 Order Status Sync — happy path + rules ===');

  await expect('Cancel a real order → 200', 'PUT', '/sap/order-status-sync/', {
    doc_entry: docEntry, doc_number_so: docNumberSo, status: 'Cancel',
  }, 200);
  if (orderId) {
    const [r] = await db.query(`SELECT status FROM sales_orders WHERE id = ?`, [orderId]);
    console.log(`  DB sales_orders.status after Cancel = ${r[0].status}  (expect CANCELLED)`);
    const [h] = await db.query(`SELECT from_status, to_status, remarks FROM order_status_history WHERE order_id = ? ORDER BY id DESC LIMIT 1`, [orderId]);
    console.log('  latest order_status_history:', h[0]);
  }

  await expect('Re-open with status=Open → 200',     'PUT', '/sap/order-status-sync/', { doc_entry: docEntry, doc_number_so: docNumberSo, status: 'Open' }, 200);
  await expect('Close with status=Close → 200',      'PUT', '/sap/order-status-sync/', { doc_entry: docEntry, doc_number_so: docNumberSo, status: 'Close' }, 200);
  await expect('Long form "Cancelled" → 200',        'PUT', '/sap/order-status-sync/', { doc_entry: docEntry, doc_number_so: docNumberSo, status: 'Cancelled' }, 200);
  await expect('Bogus status "Foo" → 400',           'PUT', '/sap/order-status-sync/', { doc_entry: docEntry, doc_number_so: docNumberSo, status: 'Foo' }, 400);
  await expect('Missing status → 400',                'PUT', '/sap/order-status-sync/', { doc_entry: docEntry, doc_number_so: docNumberSo }, 400);
  await expect('Missing doc_entry → 400',             'PUT', '/sap/order-status-sync/', { doc_number_so: docNumberSo, status: 'Cancel' }, 400);
  await expect('Missing doc_number_so → 400',         'PUT', '/sap/order-status-sync/', { doc_entry: docEntry, status: 'Cancel' }, 400);
  await expect('Unknown SO → 404',                    'PUT', '/sap/order-status-sync/', { doc_entry: '999999999', doc_number_so: 'SO-NOPE', status: 'Cancel' }, 404);
  await expect('Non-numeric doc_entry → 400',         'PUT', '/sap/order-status-sync/', { doc_entry: 'NOT-A-NUMBER', doc_number_so: docNumberSo, status: 'Cancel' }, 400);

  // Cleanup: delete the audit row + its lines + history (so re-runs stay tidy)
  if (orderId) {
    await db.query(`DELETE FROM order_status_history WHERE order_id = ?`, [orderId]);
    await db.query(`DELETE FROM order_items WHERE order_id = ?`, [orderId]);
    await db.query(`DELETE FROM sap_sync_logs WHERE order_id = ?`, [orderId]);
    await db.query(`DELETE FROM sales_orders WHERE id = ?`, [orderId]);
  }
  await db.end();

  console.log(`\n=========================================`);
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.label}  expected=${f.expected}  got=${f.got}  body=${JSON.stringify(f.body).slice(0,140)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
