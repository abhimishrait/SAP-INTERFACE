// Audits every master endpoint against its spec rules.
// Prints PASS / FAIL with the actual status code received vs expected.
const http = require('http');

const AUTH = 'Basic ' + Buffer.from('SujalFoods:SujalFoods@123').toString('base64');
const HOST = 'localhost';
const PORT = 4000;

function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: HOST, port: PORT, method, path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        Authorization: AUTH,
      },
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = buf ? JSON.parse(buf) : null; } catch { parsed = buf; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

let pass = 0, fail = 0;
const failures = [];

async function expect(label, method, path, body, expected) {
  const r = await call(method, path, body);
  const ok = Array.isArray(expected) ? expected.includes(r.status) : r.status === expected;
  const tag = ok ? '✓' : '✗';
  const exp = Array.isArray(expected) ? expected.join('/') : expected;
  console.log(`  ${tag} ${label.padEnd(64)} expect ${exp} got ${r.status}${ok ? '' : '  body=' + JSON.stringify(r.body).slice(0,140)}`);
  if (ok) pass++; else { fail++; failures.push({ label, expected: exp, got: r.status, body: r.body }); }
}

async function main() {
  console.log('\n=== 3.3 Greater Circles ===');
  await expect('duplicate name (case-insensitive)',     'POST', '/sap/greater-circles/', { name: 'North Region', status: 'Y' }, 400);
  await expect('all-numeric name rejected',             'POST', '/sap/greater-circles/', { name: '12345', status: 'Y' }, 400);
  await expect('bad status "XYZ"',                       'POST', '/sap/greater-circles/', { name: 'ValidZoneAlpha', status: 'XYZ' }, 400);
  await expect('numeric status "1" accepted',            'POST', '/sap/greater-circles/', { name: 'TestZoneAlpha', status: '1' }, [201, 400]);
  await expect('missing name',                           'POST', '/sap/greater-circles/', { status: 'Y' }, 400);

  console.log('\n=== 3.4 Circles ===');
  await expect('bad greater_circle_name',                'POST', '/sap/circles/', { name: 'BadFK', greater_circle_name: 'NoSuchZone', status: 'Y' }, 400);
  await expect('missing greater_circle_name',            'POST', '/sap/circles/', { name: 'MissFK', status: 'Y' }, 400);
  await expect('case-insensitive dup',                   'POST', '/sap/circles/', { name: 'pune north', greater_circle_name: 'North Region', status: 'Y' }, 400);

  console.log('\n=== 3.5 Container ===');
  await expect('all-numeric name rejected',              'POST', '/sap/container/', { name: '99999', status: 'Y' }, 400);
  await expect('case-insensitive dup',                   'POST', '/sap/container/', { name: 'carton 12', status: 'Y' }, 400);
  await expect('bad level',                              'POST', '/sap/container/', { name: 'NewBox42', level: 'GIANT', status: 'Y' }, 400);

  console.log('\n=== 3.6 Matrix ===');
  await expect('case-insensitive dup',                   'POST', '/sap/matrix/', { name: 'premium dairy', status: 'Y' }, 400);

  console.log('\n=== 3.7 Product Class ===');
  await expect('missing unit',                           'POST', '/sap/product-class/', { name: 'NewClassA', status: 'Y' }, 400);
  await expect('bad unit',                               'POST', '/sap/product-class/', { name: 'NewClassB', unit: 'Bogus', status: 'Y' }, 400);
  await expect('case-insensitive dup',                   'POST', '/sap/product-class/', { name: 'curd products', unit: 'Ltr', status: 'Y' }, 400);

  console.log('\n=== 3.8 Product Name ===');
  await expect('bad product_class_name FK',              'POST', '/sap/product-name/', { name: 'NewProductX', product_class_name: 'NoSuchClass', status: 'Y' }, 400);
  await expect('case-insensitive dup',                   'POST', '/sap/product-name/', { name: 'fresh milk', product_class_name: 'Curd Products', status: 'Y' }, 400);

  console.log('\n=== 3.9 Payment Terms ===');
  await expect('bad term_days "abc"',                    'POST', '/sap/payment-terms/', { payment_term_name: 'BadDays', term_days: 'abc', status: 'Y' }, 400);
  await expect('negative term_days',                     'POST', '/sap/payment-terms/', { payment_term_name: 'NegDays', term_days: '-5', status: 'Y' }, 400);
  await expect('duplicate name',                         'POST', '/sap/payment-terms/', { payment_term_name: 'Net 30 Days', status: 'Y' }, 400);

  console.log('\n=== 3.10 Price List Group ===');
  await expect('duplicate name',                         'POST', '/sap/price-list-group/', { name: 'Wholesale', status: 'Y' }, 400);

  console.log('\n=== 3.11 Price List ===');
  await expect('negative container_price',               'POST', '/sap/price-list/', { rate_group: 'Wholesale', item_code: 'MILK-FRESH-500', container_price: '-10', status: 'Y' }, 400);
  await expect('bad rate_group',                         'POST', '/sap/price-list/', { rate_group: 'NoSuchGroup', item_code: 'MILK-FRESH-500', container_price: '10', status: 'Y' }, 400);
  await expect('bad item_code',                          'POST', '/sap/price-list/', { rate_group: 'Wholesale', item_code: 'NOPE', container_price: '10', status: 'Y' }, 400);
  await expect('non-decimal price',                      'POST', '/sap/price-list/', { rate_group: 'Wholesale', item_code: 'MILK-FRESH-500', container_price: 'free', status: 'Y' }, 400);

  console.log('\n=== 3.12 Special Price List ===');
  await expect('discount > 100',                         'POST', '/sap/special-price-list/', { item_code: 'MILK-FRESH-500', container_price: '55', discount: '150', party_code: 'DEALER001', start_date: '2026-01-01', end_date: '2026-12-31', status: 'Y' }, 400);
  await expect('negative discount',                      'POST', '/sap/special-price-list/', { item_code: 'MILK-FRESH-500', container_price: '55', discount: '-5', party_code: 'DEALER001', start_date: '2026-01-01', end_date: '2026-12-31', status: 'Y' }, 400);
  await expect('start_date > end_date',                  'POST', '/sap/special-price-list/', { item_code: 'MILK-FRESH-500', container_price: '55', discount: '10', party_code: 'DEALER001', start_date: '2026-12-31', end_date: '2026-01-01', status: 'Y' }, 400);
  await expect('bad party_code',                         'POST', '/sap/special-price-list/', { item_code: 'MILK-FRESH-500', container_price: '55', discount: '10', party_code: 'NOBP', start_date: '2026-01-01', end_date: '2026-12-31', status: 'Y' }, 400);
  await expect('bad date format "2026/01/01"',           'POST', '/sap/special-price-list/', { item_code: 'MILK-FRESH-500', container_price: '55', discount: '10', party_code: 'DEALER001', start_date: '2026/01/01', end_date: '2026-12-31', status: 'Y' }, 400);

  console.log('\n=== 3.13 Products (Variants) ===');
  const baseProd = {
    product_name: 'Fresh Milk', hsn_code: '0401',
    sujal_matrix: 'Premium Dairy',
    primary_selling_unit_name: 'Carton 12', secondary_selling_unit_name: 'Pouch 500ml',
    no_of_secondary_in_primary: 12, uom_type: 'Ltr', mrp: '55',
    production_unit: 'DEFAULT_LINE',
    tax_code: [{ country_name: 'India', tax_name: 'GST 5%', tax_percentage: '5' }],
    is_packaging_allow: 'Y', status: 'Y',
  };
  await expect('bad product_name FK',                    'POST', '/sap/products/', { ...baseProd, product_name: 'NoSuchPN', variant_code: 'VAR-PN-FK' }, 400);
  await expect('bad matrix FK',                          'POST', '/sap/products/', { ...baseProd, sujal_matrix: 'NoSuchMatrix', variant_code: 'VAR-MX-FK' }, 400);
  await expect('bad primary container FK',               'POST', '/sap/products/', { ...baseProd, primary_selling_unit_name: 'NoSuchContainer', variant_code: 'VAR-PC-FK' }, 400);
  await expect('bad secondary container FK',             'POST', '/sap/products/', { ...baseProd, secondary_selling_unit_name: 'NoSuchContainer', variant_code: 'VAR-SC-FK' }, 400);
  await expect('empty tax_code []',                      'POST', '/sap/products/', { ...baseProd, tax_code: [], variant_code: 'VAR-TX-EMPTY' }, 400);
  await expect('tax_code missing → required',            'POST', '/sap/products/', { ...baseProd, tax_code: undefined, variant_code: 'VAR-TX-MISS' }, 400);
  await expect('tax_percentage > 100',                   'POST', '/sap/products/', { ...baseProd, variant_code: 'VAR-TX-OVER', tax_code: [{ country_name: 'India', tax_name: 'GST 5%', tax_percentage: '150' }] }, 400);
  await expect('tax_percentage < 0',                     'POST', '/sap/products/', { ...baseProd, variant_code: 'VAR-TX-NEG', tax_code: [{ country_name: 'India', tax_name: 'GST 5%', tax_percentage: '-5' }] }, 400);
  await expect('case-insensitive variant dup',           'POST', '/sap/products/', { ...baseProd, variant_code: 'milk-fresh-500' }, 400);
  await expect('bad is_packaging_allow "maybe"',         'POST', '/sap/products/', { ...baseProd, variant_code: 'VAR-PA-BAD', is_packaging_allow: 'maybe' }, 400);
  await expect('negative mrp',                           'POST', '/sap/products/', { ...baseProd, variant_code: 'VAR-MRP-NEG', mrp: '-10' }, 400);
  await expect('no_of_secondary_in_primary non-integer', 'POST', '/sap/products/', { ...baseProd, variant_code: 'VAR-NSP-STR', no_of_secondary_in_primary: 'abc' }, 400);
  await expect('no_of_secondary_in_primary zero',        'POST', '/sap/products/', { ...baseProd, variant_code: 'VAR-NSP-ZERO', no_of_secondary_in_primary: 0 }, 400);
  await expect('no_of_secondary_in_primary negative',    'POST', '/sap/products/', { ...baseProd, variant_code: 'VAR-NSP-NEG', no_of_secondary_in_primary: -3 }, 400);

  console.log('\n=== 3.1 BP Master ===');
  const baseBp = {
    store_name: 'x', first_name: 'x', last_name: 'x',
    contact_country_code: '+91',
    bill_to_address_line_1: 'x', bill_to_country_name: 'India',
    ship_to_address_line_1: 'x', ship_to_country_name: 'India',
    vat_number: 'V1', pan_number: 'P1',
    date_of_joining: '2026-01-15', status: 'Y',
  };
  await expect('bad contact_country_code "IN"',           'POST', '/sap/bp-master/', { ...baseBp, customer_code: 'BP_BADCC', contact_country_code: 'IN', contact_number: '9999987001' }, 400);
  await expect('duplicate customer_code',                 'POST', '/sap/bp-master/', { ...baseBp, customer_code: 'DEALER001', contact_number: '9999987002' }, 400);
  await expect('bad email format',                        'POST', '/sap/bp-master/', { ...baseBp, customer_code: 'BP_BADEMAIL', contact_number: '9999987003', email_id: 'not-an-email' }, 400);
  await expect('bad date_of_joining "15-01-2026"',        'POST', '/sap/bp-master/', { ...baseBp, customer_code: 'BP_BADDATE', contact_number: '9999987004', date_of_joining: '15-01-2026' }, 400);
  await expect('VAT > 15 chars rejected',                 'POST', '/sap/bp-master/', { ...baseBp, customer_code: 'BP_BADVAT', contact_number: '9999987005', vat_number: '1234567890123456' }, 400);
  await expect('PAN > 15 chars rejected',                 'POST', '/sap/bp-master/', { ...baseBp, customer_code: 'BP_BADPAN', contact_number: '9999987006', pan_number: '1234567890123456' }, 400);
  await expect('missing customer_code',                   'POST', '/sap/bp-master/', { ...baseBp, contact_number: '9999987007' }, 400);
  await expect('duplicate phone number',                  'POST', '/sap/bp-master/', { ...baseBp, customer_code: 'BP_DUPPHONE', contact_number: '9821000001' }, 400); // DEALER001's phone
  await expect('cost_center bad chars "@#!"',             'POST', '/sap/bp-master/', { ...baseBp, customer_code: 'BP_BADCC', contact_number: '9999987008', cost_center_master: 'BAD@#!CHAR' }, 400);

  console.log(`\n=========================================`);
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log(`\nFailures:`);
    for (const f of failures) console.log(`  - ${f.label}  expected=${f.expected}  got=${f.got}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
