// SalesPort × SAP — real spec data from API documentation v1.2

export const BASE_URL = 'http://dms.salesport.in';
export const AUTH_USER = 'SujalFoods';
export const AUTH_HEADER = 'Basic U3VqYWxGb29kczpTdWphbEZvb2RzQDEyMw==';

export interface Module {
  id: string;
  code: string;
  label: string;
  desc: string;
  path: string;
  methods: string[];
  rps: number;
  errRate: number;
  kind: string;
  rules: string[];
}

export const MODULES: Module[] = [
  {
    id: 'bp-master', code: '3.1', label: 'BP Master',
    desc: 'Business Partner master · customers/dealers',
    path: '/sap/bp-master/', methods: ['POST', 'PUT'],
    rps: 4, errRate: 0.6, kind: 'master',
    rules: [
      'customer_code is unique — one record per code',
      'email_id and contact_number must be unique across all BPs',
      'contact_country_code must be in valid international format (e.g. +977, +91)',
      'Status supports Y/N or 1/0',
      'Only single-record payloads allowed (bulk disabled)',
      'cost_center_master is optional; alphanumeric + space + dot; normalized to UPPER',
    ],
  },
  {
    id: 'blanket-agreement', code: '3.2', label: 'Blanket Agreement',
    desc: 'Quantity / financial commitments per BP',
    path: '/sap/blanket-agreement/', methods: ['POST', 'PUT'],
    rps: 0.4, errRate: 1.2, kind: 'master',
    rules: [
      'bp_code is unique — only one agreement per business partner',
      'agreement_method: qty (Quantitative) or financial',
      'Quantitative-Specific requires unit_price',
      'start_date cannot be greater than end_date',
      'Duplicate line_number values in the same agreement are rejected',
      'Status supports A/T (Approved/Terminated)',
    ],
  },
  {
    id: 'greater-circles', code: '3.3', label: 'Greater Circles',
    desc: 'Zone-level geographic groupings',
    path: '/sap/greater-circles/', methods: ['POST', 'PUT'],
    rps: 0.02, errRate: 0, kind: 'geo',
    rules: ['name must be unique (case-insensitive)', 'Purely numeric names are rejected', 'Status supports Y/N or 1/0'],
  },
  {
    id: 'circles', code: '3.4', label: 'Circles',
    desc: 'Town/area groupings within a Greater Circle',
    path: '/sap/circles/', methods: ['POST', 'PUT'],
    rps: 0.04, errRate: 0, kind: 'geo',
    rules: ['name must be unique (case-insensitive)', 'greater_circle_name is optional — if supplied it must exist; mapped manually in DMS otherwise', 'Status supports Y/N or 1/0'],
  },
  {
    id: 'container', code: '3.5', label: 'Container',
    desc: 'Packaging master (Crate, Pouch, Bottle…)',
    path: '/sap/container/', methods: ['POST', 'PUT'],
    rps: 0.01, errRate: 0, kind: 'catalog',
    rules: ['name must be unique (case-insensitive)', 'Purely numeric names are rejected', 'Status supports Y/N or 1/0'],
  },
  {
    id: 'matrix', code: '3.6', label: 'Matrix',
    desc: 'Custom grouping for reporting',
    path: '/sap/matrix/', methods: ['POST', 'PUT'],
    rps: 0.01, errRate: 0, kind: 'catalog',
    rules: ['name must be unique (case-insensitive)', 'Status supports Y/N or 1/0'],
  },
  {
    id: 'product-class', code: '3.7', label: 'Product Class',
    desc: 'Category + UoM (Kg, Ltr, Pcs…)',
    path: '/sap/product-class/', methods: ['POST', 'PUT'],
    rps: 0.02, errRate: 0, kind: 'catalog',
    rules: ['name must be unique (case-insensitive)', 'unit accepts Kg, Ltr, Pcs, etc.', 'Status supports Y/N or 1/0'],
  },
  {
    id: 'payment-terms', code: '3.9', label: 'Payment Terms',
    desc: 'Credit policies, due-date calc',
    path: '/sap/payment-terms/', methods: ['POST', 'PUT'],
    rps: 0.01, errRate: 0, kind: 'catalog',
    rules: ['payment_term_name must be unique', 'Status supports Y/N or 1/0'],
  },
  {
    id: 'price-list-group', code: '3.10', label: 'Price List Group',
    desc: 'Pricing group master',
    path: '/sap/price-list-group/', methods: ['POST', 'PUT'],
    rps: 0.01, errRate: 0, kind: 'pricing',
    rules: ['name must be unique', 'Status supports Y/N or 1/0'],
  },
  {
    id: 'price-list', code: '3.11', label: 'Price List',
    desc: 'Item-level pricing → rate group',
    path: '/sap/price-list/', methods: ['POST', 'PUT'],
    rps: 0.8, errRate: 0.4, kind: 'pricing',
    rules: ['rate_group + item_code combination must be unique', 'container_price must be valid decimal', 'Status supports Y/N or 1/0'],
  },
  {
    id: 'special-price-list', code: '3.12', label: 'Special Price List',
    desc: 'Party-specific pricing + discounts',
    path: '/sap/special-price-list/', methods: ['POST', 'PUT'],
    rps: 0.2, errRate: 0.6, kind: 'pricing',
    rules: ['party_code + item_code combination must be unique', 'discount between 0 and 100', 'start_date cannot exceed end_date', 'Status supports Y/N or 1/0'],
  },
  {
    id: 'products', code: '3.13', label: 'Products (Variants)',
    desc: 'SKU-level variants + tax codes',
    path: '/sap/products/', methods: ['POST', 'PUT'],
    rps: 0.4, errRate: 0.8, kind: 'catalog',
    rules: [
      'product_name is free text — stored verbatim',
      'variant_code must be unique (case-insensitive)',
      'sujal_matrix must reference existing Matrix',
      'primary_selling_unit_name + secondary_selling_unit_name must reference existing Containers',
      'tax_code must be a non-empty list of {country_name, tax_name, tax_percentage}',
      'tax_percentage between 0 and 100',
      'is_packaging_allow supports Y/N or 1/0',
      'Only single payload allowed (bulk disabled)',
    ],
  },
  {
    id: 'delivery-order', code: '3.14', label: 'Delivery Order',
    desc: 'Goods dispatched to distributors',
    path: '/sap/delivery-order/', methods: ['POST', 'PUT'],
    rps: 12, errRate: 0.3, kind: 'transaction',
    rules: [
      'do_entry, do_number, doc_entry, doc_number_so are required identifiers',
      'do_amount, do_tax, do_total cannot be negative',
      'do_details must contain at least one item entry',
      'Duplicate item_code values within the same order are rejected',
      'item_code must reference existing Product Variant',
      'rate and amount cannot be negative; quantity must be > 0',
      'expiry_date cannot be before mfg_date',
      'On PUT, existing do_details are replaced with the new set',
    ],
  },
  {
    id: 'balance-status-update', code: '3.15', label: 'Balance Status Update',
    desc: 'Outstanding balance for BP',
    path: '/sap/balance-status-update/', methods: ['PUT'],
    rps: 2.4, errRate: 1.8, kind: 'transaction',
    rules: [
      'party_code must reference existing Business Partner',
      'updated_amount must be a valid decimal (positive or negative)',
      'Both fields are required — missing either returns 400',
    ],
  },
  {
    id: 'order-status-sync', code: '3.16', label: 'Order Status Sync',
    desc: 'SO status: Cancel / Close / Open',
    path: '/sap/order-status-sync/', methods: ['PUT'],
    rps: 1.6, errRate: 0.4, kind: 'transaction',
    rules: [
      'doc_entry and doc_number_so must reference existing Sales Order',
      'status required. Supported: Cancel, Close, Open',
      'All three fields are required — missing any returns 400',
    ],
  },
  {
    id: 'channels', code: 'EXT', label: 'Channels',
    desc: 'Sales channel master (GT, MT, HoReCa…)',
    path: '/sap/channels/', methods: ['POST', 'PUT'],
    rps: 0.01, errRate: 0, kind: 'master',
    rules: [
      'channel_code is unique (case-insensitive depending on collation), max 50 chars',
      'channel_name is unique (case-insensitive), max 255 chars',
      'short_name optional, max 50 chars',
      'Status supports Y/N or 1/0',
    ],
  },
];

export const MODULE_BY_ID: Record<string, Module> = Object.fromEntries(MODULES.map(m => [m.id, m]));

export interface FieldMapping {
  sap: string;
  sapType: string;
  sapDesc: string;
  dms: string;
  dmsType: string;
  dmsDesc: string;
  xform: string;
  status: string;
  confidence: number;
  required: boolean;
}

export const MAPPINGS_BY_MODULE: Record<string, FieldMapping[]> = {
  'bp-master': [
    { sap: 'customer_code', sapType: 'string', sapDesc: 'Unique SAP customer/dealer code', dms: 'customer_code', dmsType: 'string PK', dmsDesc: 'Distributor primary key', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'store_name', sapType: 'string', sapDesc: 'Business/store display name', dms: 'store_name', dmsType: 'string', dmsDesc: 'Display name', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'first_name', sapType: 'string', sapDesc: 'Contact first name', dms: 'contact.first', dmsType: 'string', dmsDesc: 'Given name', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'middle_name', sapType: 'string', sapDesc: 'Contact middle name', dms: 'contact.middle', dmsType: 'string?', dmsDesc: 'Middle name', xform: 'direct', status: 'mapped', confidence: 100, required: false },
    { sap: 'last_name', sapType: 'string', sapDesc: 'Contact last name', dms: 'contact.last', dmsType: 'string', dmsDesc: 'Family name', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'contact_country_code', sapType: 'string', sapDesc: 'Intl dialing code (+977, +91)', dms: 'contact.country_code', dmsType: 'string', dmsDesc: 'E.164 prefix', xform: 'validate(/^\\+\\d{1,3}$/)', status: 'mapped', confidence: 100, required: true },
    { sap: 'contact_number', sapType: 'string', sapDesc: 'Primary phone (unique)', dms: 'contact.phone', dmsType: 'string', dmsDesc: 'Phone (unique)', xform: 'unique check', status: 'mapped', confidence: 100, required: true },
    { sap: 'email_id', sapType: 'string', sapDesc: 'Email (unique, nullable)', dms: 'contact.email', dmsType: 'string?', dmsDesc: 'Email (unique)', xform: 'validateEmail · "" → null', status: 'mapped', confidence: 100, required: false },
    { sap: 'date_of_birth', sapType: 'string', sapDesc: 'DOB (YYYY-MM-DD)', dms: 'contact.dob', dmsType: 'date', dmsDesc: 'Date of birth', xform: 'parseISO8601', status: 'mapped', confidence: 100, required: false },
    { sap: 'bill_to_address_line_1', sapType: 'string', sapDesc: 'Billing address', dms: 'billing.line1', dmsType: 'string', dmsDesc: 'Address line', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'bill_to_country_name', sapType: 'string', sapDesc: 'Billing country', dms: 'billing.country', dmsType: 'string', dmsDesc: 'Country', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'ship_to_address_line_1', sapType: 'string', sapDesc: 'Shipping address', dms: 'shipping.line1', dmsType: 'string', dmsDesc: 'Address line', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'ship_to_country_name', sapType: 'string', sapDesc: 'Shipping country', dms: 'shipping.country', dmsType: 'string', dmsDesc: 'Country', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'role_name', sapType: 'string', sapDesc: 'Role / designation', dms: 'role', dmsType: 'string?', dmsDesc: 'Role', xform: 'direct', status: 'mapped', confidence: 100, required: false },
    { sap: 'organization_name', sapType: 'string', sapDesc: 'Parent organization', dms: 'org_name', dmsType: 'string?', dmsDesc: 'Parent org', xform: 'direct', status: 'mapped', confidence: 100, required: false },
    { sap: 'department_name', sapType: 'string', sapDesc: 'Department', dms: 'department', dmsType: 'string?', dmsDesc: 'Department', xform: 'direct', status: 'mapped', confidence: 100, required: false },
    { sap: 'reporting_to_emp', sapType: 'string', sapDesc: 'SAP ID of reporting employee', dms: 'reports_to', dmsType: 'string?', dmsDesc: 'FK → employee', xform: 'lookup(emp)', status: 'mapped', confidence: 96, required: false },
    { sap: 'cost_center_master', sapType: 'string', sapDesc: 'Cost center (alnum+space+dot)', dms: 'cost_center', dmsType: 'string?', dmsDesc: 'Normalized', xform: 'TRIM + UPPER', status: 'mapped', confidence: 100, required: false },
    { sap: 'vat_number', sapType: 'string(15)', sapDesc: 'VAT registration', dms: 'tax.vat', dmsType: 'string', dmsDesc: 'VAT', xform: 'validate(len ≤ 15)', status: 'mapped', confidence: 100, required: true },
    { sap: 'pan_number', sapType: 'string(15)', sapDesc: 'PAN / tax ID', dms: 'tax.pan', dmsType: 'string', dmsDesc: 'PAN', xform: 'validate(len ≤ 15)', status: 'mapped', confidence: 100, required: true },
    { sap: 'date_of_joining', sapType: 'string', sapDesc: 'Onboarding date', dms: 'joined_at', dmsType: 'date', dmsDesc: 'YYYY-MM-DD', xform: 'parseISO8601', status: 'mapped', confidence: 100, required: true },
    { sap: 'bank_guarantee_amount', sapType: 'string', sapDesc: 'BG value', dms: 'bank_guarantee.amount', dmsType: 'decimal?', dmsDesc: 'BG value', xform: 'toDecimal', status: 'mapped', confidence: 100, required: false },
    { sap: 'bank_guarantee_expiry', sapType: 'string', sapDesc: 'BG expiry', dms: 'bank_guarantee.expiry', dmsType: 'date?', dmsDesc: 'Expiry date', xform: 'parseISO8601', status: 'mapped', confidence: 100, required: false },
    { sap: 'greater_circle_name', sapType: 'string', sapDesc: 'Zone (must exist)', dms: 'territory.zone_id', dmsType: 'FK', dmsDesc: 'FK → greater_circles', xform: 'lookup(name → id)', status: 'mapped', confidence: 98, required: false },
    { sap: 'circle_name', sapType: 'string', sapDesc: 'Town (must exist)', dms: 'territory.circle_id', dmsType: 'FK', dmsDesc: 'FK → circles', xform: 'lookup(name → id)', status: 'mapped', confidence: 97, required: false },
    { sap: 'payment_terms', sapType: 'string', sapDesc: 'Payment terms name', dms: 'payment_terms_id', dmsType: 'FK', dmsDesc: 'FK → payment_terms', xform: 'lookup(name → id)', status: 'mapped', confidence: 98, required: false },
    { sap: 'rate_group', sapType: 'string', sapDesc: 'Pricing rate group', dms: 'rate_group_id', dmsType: 'FK', dmsDesc: 'FK → price_list_group', xform: 'lookup(name → id)', status: 'mapped', confidence: 98, required: false },
    { sap: 'channels', sapType: 'string[]', sapDesc: 'Channel codes/names (M2M, optional)', dms: 'external_user_profiles_channels', dmsType: 'M2M', dmsDesc: 'FK → channels', xform: 'lookup(code|name → id) · replace set', status: 'mapped', confidence: 98, required: false },
    { sap: 'status', sapType: 'string', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active flag', xform: 'statusMap(Y/N/1/0)', status: 'mapped', confidence: 100, required: true },
  ],
  'blanket-agreement': [
    { sap: 'bp_code', sapType: 'string(20)', sapDesc: 'BP customer code', dms: 'bp_code', dmsType: 'FK', dmsDesc: 'FK → bp_master', xform: 'lookup', status: 'mapped', confidence: 100, required: true },
    { sap: 'bp_name', sapType: 'string(255)', sapDesc: 'BP name (denormalized)', dms: 'bp_name', dmsType: 'string', dmsDesc: 'Snapshot', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'agreement_method', sapType: 'object', sapDesc: 'qty / financial', dms: 'method', dmsType: 'enum', dmsDesc: 'QUANT / FIN', xform: 'enumMap', status: 'mapped', confidence: 100, required: true },
    { sap: 'agreement_type', sapType: 'string', sapDesc: 'general / specific', dms: 'agreement_type', dmsType: 'enum?', dmsDesc: 'general/specific', xform: 'enumMap', status: 'mapped', confidence: 100, required: false },
    { sap: 'scheme_name', sapType: 'string(255)', sapDesc: 'Agreement name', dms: 'scheme_name', dmsType: 'string?', dmsDesc: 'Scheme', xform: 'direct', status: 'mapped', confidence: 100, required: false },
    { sap: 'start_date', sapType: 'string', sapDesc: 'YYYY-MM-DD', dms: 'start_date', dmsType: 'date', dmsDesc: 'Start', xform: 'parseISO8601 · validate ≤ end', status: 'mapped', confidence: 100, required: true },
    { sap: 'end_date', sapType: 'string', sapDesc: 'YYYY-MM-DD', dms: 'end_date', dmsType: 'date', dmsDesc: 'End', xform: 'parseISO8601', status: 'mapped', confidence: 100, required: true },
    { sap: 'status', sapType: 'string(20)', sapDesc: 'A/T', dms: 'status', dmsType: 'enum', dmsDesc: 'Approved/Terminated', xform: 'statusMap(A/T)', status: 'mapped', confidence: 100, required: true },
    { sap: 'lines[].line_number', sapType: 'int', sapDesc: 'Line # (unique in agmt)', dms: 'lines[].line_no', dmsType: 'int PK', dmsDesc: 'Line key', xform: 'dedupe', status: 'mapped', confidence: 100, required: true },
    { sap: 'lines[].item_code', sapType: 'string', sapDesc: 'SKU (must exist)', dms: 'lines[].variant_code', dmsType: 'FK', dmsDesc: 'FK → products', xform: 'lookup', status: 'mapped', confidence: 99, required: true },
    { sap: 'lines[].item_name', sapType: 'string', sapDesc: 'Snapshot name', dms: 'lines[].item_name', dmsType: 'string', dmsDesc: 'Snapshot', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'lines[].planned_quantity', sapType: 'decimal', sapDesc: 'Committed qty', dms: 'lines[].planned_qty', dmsType: 'decimal', dmsDesc: 'Qty', xform: 'toDecimal', status: 'mapped', confidence: 100, required: true },
    { sap: 'lines[].unit_price', sapType: 'decimal', sapDesc: '(Specific only)', dms: 'lines[].unit_price', dmsType: 'decimal?', dmsDesc: 'Rate', xform: 'toDecimal', status: 'review', confidence: 78, required: false },
    { sap: 'lines[].portion_of_returns', sapType: 'decimal', sapDesc: 'Return %', dms: 'lines[].return_pct', dmsType: 'decimal', dmsDesc: 'Return %', xform: 'toDecimal', status: 'mapped', confidence: 100, required: true },
  ],
  'greater-circles': [
    { sap: 'name', sapType: 'string(50)', sapDesc: 'Zone name (unique CI)', dms: 'zones.name', dmsType: 'string', dmsDesc: 'Zone name', xform: 'TRIM · validate(has alpha)', status: 'mapped', confidence: 100, required: true },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'circles': [
    { sap: 'name', sapType: 'string(50)', sapDesc: 'Town name (unique CI)', dms: 'towns.name', dmsType: 'string', dmsDesc: 'Town name', xform: 'TRIM · validate(has alpha)', status: 'mapped', confidence: 100, required: true },
    { sap: 'greater_circle_name', sapType: 'string(50)', sapDesc: 'Parent zone (optional — mapped manually in DMS if omitted)', dms: 'towns.zone_id', dmsType: 'FK (nullable)', dmsDesc: 'FK → zones', xform: 'lookup if supplied', status: 'mapped', confidence: 99, required: false },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'container': [
    { sap: 'name', sapType: 'string(50)', sapDesc: 'Container (unique CI)', dms: 'packaging_types.name', dmsType: 'string', dmsDesc: 'Packaging name', xform: 'TRIM · validate(has alpha)', status: 'mapped', confidence: 100, required: true },
    { sap: 'level', sapType: 'string', sapDesc: 'PRIMARY / SECONDARY / TERTIARY (defaults PRIMARY)', dms: 'packaging_types.level', dmsType: 'enum', dmsDesc: 'Packaging level', xform: 'normalize · validate(allowed set)', status: 'mapped', confidence: 100, required: false },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'matrix': [
    { sap: 'name', sapType: 'string(50)', sapDesc: 'Matrix grouping (unique CI)', dms: 'sujal_matrices.name', dmsType: 'string', dmsDesc: 'Grouping', xform: 'TRIM', status: 'mapped', confidence: 100, required: true },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'product-class': [
    { sap: 'name', sapType: 'string(50)', sapDesc: 'Category (unique CI)', dms: 'production_categories.name', dmsType: 'string', dmsDesc: 'Class name', xform: 'TRIM', status: 'mapped', confidence: 100, required: true },
    { sap: 'unit', sapType: 'string(50)', sapDesc: 'UoM (Kg/Ltr/Pcs)', dms: 'description', dmsType: 'string', dmsDesc: 'Stored in description (no native UoM col)', xform: 'prefix "UOM: "', status: 'mapped', confidence: 100, required: true },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'product-name': [
    { sap: 'name', sapType: 'string(50)', sapDesc: 'Product (unique CI)', dms: 'master_lookups.label', dmsType: 'string', dmsDesc: 'Product name (category=PRODUCT_NAME)', xform: 'TRIM', status: 'mapped', confidence: 100, required: true },
    { sap: 'product_class_name', sapType: 'string', sapDesc: 'Class (must exist)', dms: 'master_lookups.value', dmsType: 'FK', dmsDesc: 'production_categories.id', xform: 'lookup', status: 'mapped', confidence: 99, required: true },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'payment-terms': [
    { sap: 'payment_term_name', sapType: 'string(50)', sapDesc: 'Terms name (unique)', dms: 'payment_terms.payment_term_name', dmsType: 'string', dmsDesc: 'Terms', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'term_days', sapType: 'string', sapDesc: 'Credit days', dms: 'payment_terms.term_days', dmsType: 'int?', dmsDesc: 'Days', xform: 'parseInt · validate(≥0)', status: 'mapped', confidence: 100, required: false },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'price-list-group': [
    { sap: 'name', sapType: 'string(50)', sapDesc: 'Group name (unique)', dms: 'price_groups.name', dmsType: 'string', dmsDesc: 'Group', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'price-list': [
    { sap: 'rate_group', sapType: 'string(50)', sapDesc: 'Rate group', dms: 'rate_group_id', dmsType: 'FK', dmsDesc: 'FK → price_list_group', xform: 'lookup', status: 'mapped', confidence: 99, required: true },
    { sap: 'item_code', sapType: 'string(20)', sapDesc: 'SKU (must exist)', dms: 'variant_code', dmsType: 'FK', dmsDesc: 'FK → products', xform: 'lookup', status: 'mapped', confidence: 99, required: true },
    { sap: 'container_price', sapType: 'string(20)', sapDesc: 'Unit price', dms: 'container_price', dmsType: 'decimal', dmsDesc: 'Price', xform: 'toDecimal', status: 'mapped', confidence: 100, required: true },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'special-price-list': [
    { sap: 'party_code', sapType: 'string(20)', sapDesc: 'BP code (must exist)', dms: 'party_code', dmsType: 'FK', dmsDesc: 'FK → bp_master', xform: 'lookup', status: 'mapped', confidence: 100, required: true },
    { sap: 'item_code', sapType: 'string(20)', sapDesc: 'SKU (must exist)', dms: 'variant_code', dmsType: 'FK', dmsDesc: 'FK → products', xform: 'lookup', status: 'mapped', confidence: 99, required: true },
    { sap: 'container_price', sapType: 'string(20)', sapDesc: 'Unit price', dms: 'container_price', dmsType: 'decimal', dmsDesc: 'Price', xform: 'toDecimal', status: 'mapped', confidence: 100, required: true },
    { sap: 'discount', sapType: 'string(10)', sapDesc: 'Discount % (0–100)', dms: 'discount_pct', dmsType: 'decimal', dmsDesc: 'Discount', xform: 'toDecimal · validate(0–100)', status: 'mapped', confidence: 100, required: true },
    { sap: 'start_date', sapType: 'string', sapDesc: 'YYYY-MM-DD', dms: 'start_date', dmsType: 'date', dmsDesc: 'Start', xform: 'parseISO8601', status: 'mapped', confidence: 100, required: true },
    { sap: 'end_date', sapType: 'string', sapDesc: 'YYYY-MM-DD', dms: 'end_date', dmsType: 'date', dmsDesc: 'End', xform: 'parseISO8601 · validate(≥ start)', status: 'mapped', confidence: 100, required: true },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'products': [
    { sap: 'product_name', sapType: 'string(100)', sapDesc: 'Product name (free text)', dms: 'products.product_name', dmsType: 'string', dmsDesc: 'Stored verbatim', xform: 'TRIM', status: 'mapped', confidence: 100, required: true },
    { sap: 'hsn_code', sapType: 'string(50)', sapDesc: 'HSN/SAC', dms: 'hsn_code', dmsType: 'string', dmsDesc: 'HSN', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'variant_code', sapType: 'string(25)', sapDesc: 'SKU (unique CI)', dms: 'variant_code', dmsType: 'string PK', dmsDesc: 'SKU', xform: 'UPPER + unique', status: 'mapped', confidence: 100, required: true },
    { sap: 'sujal_matrix', sapType: 'string(255)', sapDesc: 'Matrix (must exist)', dms: 'matrix_id', dmsType: 'FK', dmsDesc: 'FK → matrix', xform: 'lookup', status: 'mapped', confidence: 98, required: true },
    { sap: 'primary_selling_unit_name', sapType: 'string(100)', sapDesc: 'Primary container', dms: 'primary_container_id', dmsType: 'FK', dmsDesc: 'FK → container', xform: 'lookup', status: 'mapped', confidence: 99, required: true },
    { sap: 'secondary_selling_unit_name', sapType: 'string(100)', sapDesc: 'Secondary container', dms: 'secondary_container_id', dmsType: 'FK', dmsDesc: 'FK → container', xform: 'lookup', status: 'mapped', confidence: 99, required: true },
    { sap: 'no_of_secondary_in_primary', sapType: 'int', sapDesc: 'Sec per primary', dms: 'pack_ratio', dmsType: 'int', dmsDesc: 'Ratio', xform: 'parseInt', status: 'mapped', confidence: 100, required: true },
    { sap: 'uom_type', sapType: 'string(50)', sapDesc: 'UoM type', dms: 'uom_type', dmsType: 'enum', dmsDesc: 'UoM', xform: 'enumMap', status: 'mapped', confidence: 100, required: true },
    { sap: 'mrp', sapType: 'string', sapDesc: 'Max retail price', dms: 'mrp', dmsType: 'decimal', dmsDesc: 'MRP', xform: 'toDecimal', status: 'mapped', confidence: 100, required: true },
    { sap: 'production_unit', sapType: 'int', sapDesc: 'Production unit', dms: 'production_unit', dmsType: 'string', dmsDesc: 'Unit', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'tax_code[].country_name', sapType: 'string', sapDesc: 'Country (in tax_code[])', dms: 'taxes[].country', dmsType: 'string', dmsDesc: 'Country', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'tax_code[].tax_name', sapType: 'string', sapDesc: 'Tax name (in tax_code[])', dms: 'taxes[].name', dmsType: 'string', dmsDesc: 'Tax', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'tax_code[].tax_percentage', sapType: 'string', sapDesc: 'Tax % (0–100)', dms: 'taxes[].pct', dmsType: 'decimal', dmsDesc: 'Tax pct', xform: 'toDecimal · validate(0–100)', status: 'mapped', confidence: 100, required: true },
    { sap: 'is_packaging_allow', sapType: 'string', sapDesc: 'Y/N or 1/0', dms: 'packaging_allowed', dmsType: 'boolean', dmsDesc: 'Allowed', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
    { sap: 'channels', sapType: 'string[]', sapDesc: 'Channel codes/names (M2M, multiple)', dms: 'products_channels', dmsType: 'M2M', dmsDesc: 'FK → channels', xform: 'lookup(code|name → id) · replace set', status: 'mapped', confidence: 98, required: false },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
  'delivery-order': [
    { sap: 'invoice_number', sapType: 'string(50)', sapDesc: 'Invoice ref', dms: 'invoice_number', dmsType: 'string?', dmsDesc: 'Invoice', xform: 'direct', status: 'mapped', confidence: 100, required: false },
    { sap: 'do_entry', sapType: 'string(50)', sapDesc: 'DO entry ID', dms: 'do_entry', dmsType: 'string PK', dmsDesc: 'DO entry', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'do_number', sapType: 'string(50)', sapDesc: 'DO number', dms: 'do_number', dmsType: 'string', dmsDesc: 'DO #', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'doc_entry', sapType: 'string(50)', sapDesc: 'SAP doc entry', dms: 'sap_doc_entry', dmsType: 'string', dmsDesc: 'SAP ref', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'doc_number_so', sapType: 'string(50)', sapDesc: 'SAP Sales Order #', dms: 'sap_so_number', dmsType: 'string', dmsDesc: 'SO ref', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'do_date', sapType: 'string', sapDesc: 'Delivery date', dms: 'do_date', dmsType: 'date', dmsDesc: 'YYYY-MM-DD', xform: 'parseISO8601', status: 'mapped', confidence: 100, required: true },
    { sap: 'do_amount', sapType: 'string', sapDesc: 'Order amount (≥0)', dms: 'amount', dmsType: 'decimal', dmsDesc: 'Subtotal', xform: 'toDecimal · validate(≥0)', status: 'mapped', confidence: 100, required: true },
    { sap: 'do_tax', sapType: 'string', sapDesc: 'Tax amount (≥0)', dms: 'tax', dmsType: 'decimal', dmsDesc: 'Tax', xform: 'toDecimal · validate(≥0)', status: 'mapped', confidence: 100, required: true },
    { sap: 'do_total', sapType: 'string', sapDesc: 'Total incl. tax (≥0)', dms: 'total', dmsType: 'decimal', dmsDesc: 'Total', xform: 'toDecimal · validate(≥0)', status: 'mapped', confidence: 100, required: true },
    { sap: 'production_unit', sapType: 'string(100)', sapDesc: 'Production unit', dms: 'production_unit', dmsType: 'string', dmsDesc: 'Unit', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'do_details[].item_code', sapType: 'string(50)', sapDesc: 'SKU (must exist)', dms: 'lines[].variant_code', dmsType: 'FK', dmsDesc: 'FK → products', xform: 'lookup · dedupe', status: 'mapped', confidence: 99, required: true },
    { sap: 'do_details[].rate', sapType: 'string', sapDesc: 'Unit rate (≥0)', dms: 'lines[].rate', dmsType: 'decimal', dmsDesc: 'Rate', xform: 'toDecimal · validate(≥0)', status: 'mapped', confidence: 100, required: true },
    { sap: 'do_details[].quantity', sapType: 'string', sapDesc: 'Qty (>0)', dms: 'lines[].qty', dmsType: 'decimal', dmsDesc: 'Quantity', xform: 'toDecimal · validate(>0)', status: 'mapped', confidence: 100, required: true },
    { sap: 'do_details[].uom', sapType: 'string(20)', sapDesc: 'UoM', dms: 'lines[].uom', dmsType: 'string', dmsDesc: 'UoM', xform: 'direct', status: 'mapped', confidence: 100, required: true },
    { sap: 'do_details[].batch_number', sapType: 'string(100)', sapDesc: 'Batch', dms: 'lines[].batch', dmsType: 'string?', dmsDesc: 'Batch', xform: 'direct', status: 'mapped', confidence: 100, required: false },
    { sap: 'do_details[].mfg_date', sapType: 'string', sapDesc: 'Mfg date', dms: 'lines[].mfg_date', dmsType: 'date?', dmsDesc: 'Mfg', xform: 'parseISO8601', status: 'mapped', confidence: 100, required: false },
    { sap: 'do_details[].expiry_date', sapType: 'string', sapDesc: 'Expiry (≥ mfg)', dms: 'lines[].expiry_date', dmsType: 'date?', dmsDesc: 'Expiry', xform: 'parseISO8601 · validate(≥ mfg)', status: 'mapped', confidence: 100, required: false },
    { sap: 'do_details[].amount', sapType: 'string', sapDesc: 'Line amount (≥0)', dms: 'lines[].amount', dmsType: 'decimal', dmsDesc: 'Line total', xform: 'toDecimal', status: 'mapped', confidence: 100, required: true },
  ],
  'balance-status-update': [
    { sap: 'party_code', sapType: 'string(50)', sapDesc: 'BP code (must exist)', dms: 'party_code', dmsType: 'FK', dmsDesc: 'FK → bp_master', xform: 'lookup · 404 if not found', status: 'mapped', confidence: 100, required: true },
    { sap: 'updated_amount', sapType: 'number', sapDesc: 'New balance (+/-)', dms: 'outstanding_balance', dmsType: 'decimal', dmsDesc: 'Balance', xform: 'toDecimal (allow neg)', status: 'mapped', confidence: 100, required: true },
  ],
  'order-status-sync': [
    { sap: 'doc_entry', sapType: 'string(50)', sapDesc: 'SAP doc entry', dms: 'sap_doc_entry', dmsType: 'FK', dmsDesc: 'FK → sales_order', xform: 'lookup · 404 if not found', status: 'mapped', confidence: 100, required: true },
    { sap: 'doc_number_so', sapType: 'string(50)', sapDesc: 'SAP SO #', dms: 'sap_so_number', dmsType: 'FK', dmsDesc: 'FK → sales_order', xform: 'lookup', status: 'mapped', confidence: 100, required: true },
    { sap: 'status', sapType: 'string', sapDesc: 'Cancel/Close/Open', dms: 'order_status', dmsType: 'enum', dmsDesc: 'Order state', xform: 'statusMap(Cancel→CANCELLED, Close→CLOSED, Open→OPEN)', status: 'mapped', confidence: 100, required: true },
  ],
  'channels': [
    { sap: 'channel_code', sapType: 'string(50)', sapDesc: 'Channel code (unique)', dms: 'channels.code', dmsType: 'string', dmsDesc: 'Channel code', xform: 'TRIM · unique', status: 'mapped', confidence: 100, required: true },
    { sap: 'channel_name', sapType: 'string(255)', sapDesc: 'Channel name (unique CI)', dms: 'channels.name', dmsType: 'string', dmsDesc: 'Channel name', xform: 'TRIM', status: 'mapped', confidence: 100, required: true },
    { sap: 'short_name', sapType: 'string(50)', sapDesc: 'Short name (optional)', dms: 'channels.short_name', dmsType: 'string?', dmsDesc: 'Short name', xform: 'direct', status: 'mapped', confidence: 100, required: false },
    { sap: 'description', sapType: 'text', sapDesc: 'Description (optional)', dms: 'channels.description', dmsType: 'longtext?', dmsDesc: 'Description', xform: 'direct', status: 'mapped', confidence: 100, required: false },
    { sap: 'status', sapType: 'string(1)', sapDesc: 'Y/N or 1/0', dms: 'is_active', dmsType: 'boolean', dmsDesc: 'Active', xform: 'statusMap', status: 'mapped', confidence: 100, required: true },
  ],
};

export const STATUS_MAPPING = [
  { input: 'Y', interpreted: 'Active', desc: 'Record is active' },
  { input: 'N', interpreted: 'Inactive', desc: 'Record is inactive' },
  { input: '1', interpreted: 'Active', desc: 'Numeric equivalent of Y' },
  { input: '0', interpreted: 'Inactive', desc: 'Numeric equivalent of N' },
  { input: 'A / Approved', interpreted: 'Active', desc: 'Blanket Agreement approved' },
  { input: 'T / Terminated', interpreted: 'Inactive', desc: 'Blanket Agreement terminated' },
  { input: 'Cancel / Cancelled', interpreted: 'CANCELLED', desc: 'Order Status Sync' },
  { input: 'Close / Closed', interpreted: 'CLOSED', desc: 'Order Status Sync' },
  { input: 'Open / Pending / Approved', interpreted: 'OPEN', desc: 'Order Status Sync' },
];

export const RESPONSE_CODES = [
  { code: 200, status: 'OK', desc: 'Resource updated successfully' },
  { code: 201, status: 'Created', desc: 'Resource created successfully' },
  { code: 400, status: 'Bad Request', desc: 'Validation failed — see response body' },
  { code: 401, status: 'Unauthorized', desc: 'Missing or invalid Basic Auth credentials' },
  { code: 404, status: 'Not Found', desc: 'Resource with the given ID does not exist' },
  { code: 405, status: 'Method Not Allowed', desc: 'HTTP method not supported on this endpoint' },
  { code: 500, status: 'Internal Server Error', desc: 'Unexpected server-side error' },
];

export const ERROR_SCENARIOS = [
  { scenario: 'Missing required field',  code: 400, example: '{"customer_code": ["This field is required."]}' },
  { scenario: 'Duplicate unique value',  code: 400, example: '{"customer_code": ["This value already exists."]}' },
  { scenario: 'Invalid email format',    code: 400, example: '{"email_id": ["Enter a valid email address."]}' },
  { scenario: 'Invalid date format',     code: 400, example: '{"date_of_birth": ["Date has wrong format. Use YYYY-MM-DD."]}' },
  { scenario: 'Invalid credentials',     code: 401, example: '"Authentication credentials were not provided."' },
  { scenario: 'Resource not found',      code: 404, example: '{"detail": "Not found."}' },
];

// Transactions
function pad(n: number, w = 2): string { return String(n).padStart(w, '0'); }
function genTxId(seed: number): string {
  const a = (seed * 9301 + 49297) % 233280;
  const b = (a * 9301 + 49297) % 233280;
  return `txn_${a.toString(16).padStart(4, '0')}-${b.toString(16).padStart(4, '0')}-${(a ^ b).toString(16).padStart(4, '0')}`;
}

export const NOW = new Date('2026-05-22T11:42:18+05:45');

export function relTime(date: Date): string {
  const s = Math.floor((NOW.getTime() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export function iso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}+05:45`;
}

const TX_DEFS: [string, string, number, string][] = [
  ['delivery-order', 'POST', 201, 'Param Dairy Store'],
  ['bp-master', 'POST', 201, 'Sundar Traders'],
  ['delivery-order', 'POST', 201, 'Krishna Distributors'],
  ['order-status-sync', 'PUT', 200, 'Megha Agencies'],
  ['balance-status-update', 'PUT', 200, 'Param Dairy Store'],
  ['delivery-order', 'POST', 400, 'Apex Retail Co'],
  ['products', 'POST', 201, '—'],
  ['delivery-order', 'PUT', 200, 'Bharat Foods'],
  ['special-price-list', 'POST', 201, 'Sundar Traders'],
  ['delivery-order', 'POST', 201, 'Param Dairy Store'],
  ['order-status-sync', 'PUT', 404, 'Megha Agencies'],
  ['price-list', 'POST', 201, '—'],
  ['balance-status-update', 'PUT', 200, 'Krishna Distributors'],
  ['delivery-order', 'POST', 201, 'Apex Retail Co'],
  ['bp-master', 'PUT', 200, 'Param Dairy Store'],
  ['delivery-order', 'POST', 500, 'Sundar Traders'],
  ['products', 'PUT', 200, '—'],
  ['delivery-order', 'POST', 201, 'Bharat Foods'],
  ['balance-status-update', 'PUT', 401, 'Apex Retail Co'],
  ['price-list', 'PUT', 200, '—'],
  ['delivery-order', 'POST', 201, 'Megha Agencies'],
  ['order-status-sync', 'PUT', 200, 'Krishna Distributors'],
  ['delivery-order', 'POST', 201, 'Param Dairy Store'],
  ['special-price-list', 'PUT', 400, 'Sundar Traders'],
  ['delivery-order', 'POST', 201, 'Apex Retail Co'],
  ['blanket-agreement', 'POST', 201, 'Bharat Foods'],
  ['delivery-order', 'POST', 201, 'Param Dairy Store'],
  ['order-status-sync', 'PUT', 200, 'Sundar Traders'],
  ['balance-status-update', 'PUT', 200, 'Param Dairy Store'],
  ['delivery-order', 'POST', 201, 'Krishna Distributors'],
  ['products', 'POST', 400, '—'],
  ['delivery-order', 'POST', 201, 'Megha Agencies'],
];

export interface Transaction {
  id: string;
  ts: Date;
  method: string;
  moduleId: string;
  path: string;
  status: number;
  duration: number;
  bytesIn: number;
  bytesOut: number;
  retry: number;
  mappedFields: number;
  distributor: string;
  customerCode: string;
  doNumber: string;
  soNumber: string;
  pipeline: string;
}

export const TRANSACTIONS: Transaction[] = TX_DEFS.map(([moduleId, method, status, distributor], i) => {
  const mod = MODULE_BY_ID[moduleId];
  const ageS = i * 11 + (i % 5) * 4 + 6;
  const t = new Date(NOW.getTime() - ageS * 1000);
  const dur = 60 + (i * 37) % 480 + (status >= 500 ? 900 : 0);
  const mappingsLen = (MAPPINGS_BY_MODULE[moduleId] || []).length;
  return {
    id: genTxId(i + 1),
    ts: t,
    method,
    moduleId,
    path: method === 'PUT' && mod.methods.includes('POST') ? `${mod.path}${1000 + i * 7}/` : mod.path,
    status,
    duration: dur,
    bytesIn: 480 + (i * 113) % 2200,
    bytesOut: 320 + (i * 171) % 1400,
    retry: status >= 500 ? (i % 3) : 0,
    mappedFields: mappingsLen,
    distributor,
    customerCode: `CUST${1000 + i * 3}`,
    doNumber: `DO-${(1247 + i).toString().padStart(4, '0')}`,
    soNumber: `SO-${(4001247 + i * 7).toString()}`,
    pipeline: status >= 500 ? 'failed' : status >= 400 ? 'rejected' : 'completed',
  };
});

export const QUEUE_JOBS = [
  { id: 'job_8af321', name: 'Delivery Order · DO-1248', moduleId: 'delivery-order', stage: 'transform', progress: 62, eta: '00:00:08', priority: 'high', size: 4 },
  { id: 'job_8af2e0', name: 'BP Master bulk push', moduleId: 'bp-master', stage: 'validate', progress: 41, eta: '00:00:14', priority: 'normal', size: 12 },
  { id: 'job_8af1bb', name: 'Order Status · Cancel', moduleId: 'order-status-sync', stage: 'mapping', progress: 18, eta: '00:00:05', priority: 'high', size: 1 },
  { id: 'job_8af0a4', name: 'Balance update batch', moduleId: 'balance-status-update', stage: 'queued', progress: 0, eta: '00:01:05', priority: 'low', size: 56 },
  { id: 'job_8aefe0', name: 'Products variant sync', moduleId: 'products', stage: 'queued', progress: 0, eta: '00:02:18', priority: 'normal', size: 18 },
  { id: 'job_8aedb2', name: 'Special Price List · Zone A', moduleId: 'special-price-list', stage: 'queued', progress: 0, eta: '00:03:40', priority: 'low', size: 89 },
];

export const QUEUE_RECENT = [
  { id: 'job_8aec51', name: 'Delivery Order · DO-1247', moduleId: 'delivery-order', stage: 'completed', dur: '4.2s', priority: 'high', size: 4, err: null },
  { id: 'job_8aec0a', name: 'BP Master · CUST1013', moduleId: 'bp-master', stage: 'failed', dur: '1.4s', priority: 'normal', size: 1, err: 'email_id: enter a valid email' },
  { id: 'job_8aebf3', name: 'Order Status · Close', moduleId: 'order-status-sync', stage: 'completed', dur: '0.7s', priority: 'normal', size: 1, err: null },
  { id: 'job_8aebc9', name: 'Price List · refresh', moduleId: 'price-list', stage: 'completed', dur: '8.4s', priority: 'low', size: 902, err: null },
  { id: 'job_8aeba1', name: 'Blanket Agmt · 2026 Q2', moduleId: 'blanket-agreement', stage: 'partial', dur: '6.1s', priority: 'high', size: 31, err: '2 lines on review' },
];

export const DB_TABLES = [
  { name: 'sap_sync_logs', rows: 1284901, size: '4.2 GB', writes: '142/s', desc: 'Every API call to /sap/* (inbound + outbound) — request body, response body, headers, latency, retries.' },
  { name: 'field_map_audit', rows: 89421, size: '142 MB', writes: '8/s', desc: 'Every transform invocation with input/output diff.' },
  { name: 'sync_jobs', rows: 38214, size: '88 MB', writes: '3/s', desc: 'Job lifecycle: queued → mapping → validate → transform → persist.' },
  { name: 'dlq_messages', rows: 1842, size: '14 MB', writes: '0.4/s', desc: 'Dead-letter queue. Auto-retry with exponential backoff, max 3.' },
  { name: 'bp_master', rows: 12480, size: '38 MB', writes: '0.2/s', desc: 'Distributor master · customer_code unique.' },
  { name: 'delivery_order', rows: 218014, size: '410 MB', writes: '12/s', desc: 'Delivery orders + nested do_details.' },
  { name: 'products', rows: 4218, size: '8 MB', writes: '0.1/s', desc: 'Product variants with tax codes.' },
  { name: 'idempotency_keys', rows: 902118, size: '180 MB', writes: '38/s', desc: 'Replay-protection keys keyed on (endpoint, primary key, body hash).' },
];

export const CONNECTORS = [
  { name: 'SAP · PROD', env: 'production', side: 'sap', protocol: 'REST/JSON', host: 'sap-b1.sujalfoods.internal', auth: 'HTTP Basic', status: 'healthy', latency: 142, rps: 18, lastSync: '8s ago' },
  { name: 'SAP · STAGE', env: 'staging', side: 'sap', protocol: 'REST/JSON', host: 'sap-b1-stg.sujalfoods.internal', auth: 'HTTP Basic', status: 'healthy', latency: 198, rps: 1, lastSync: '46s ago' },
  { name: 'SalesPort DMS · PROD', env: 'production', side: 'dms', protocol: 'REST/JSON', host: 'dms.salesport.in', auth: 'HTTP Basic', status: 'healthy', latency: 38, rps: 21, lastSync: 'live' },
  { name: 'SalesPort DMS · STAGE', env: 'staging', side: 'dms', protocol: 'REST/JSON', host: 'dms-stg.salesport.in', auth: 'HTTP Basic', status: 'degraded', latency: 612, rps: 0.4, lastSync: '2m ago' },
];

export function getHeadersForTx(tx: Transaction): string {
  return `${tx.method} ${tx.path} HTTP/1.1
Host: dms.salesport.in
Authorization: ${AUTH_HEADER}
Content-Type: application/json
X-Correlation-Id: ${tx.id}
User-Agent: SAP-B1-Integration/1.2
Accept: application/json`;
}

export function getResponseHeaders(tx: Transaction): string {
  const codeText = RESPONSE_CODES.find(c => c.code === tx.status)?.status || 'OK';
  return `HTTP/1.1 ${tx.status} ${codeText}
Content-Type: application/json
Content-Length: ${tx.bytesOut}
X-Request-Id: req_${tx.id.slice(4)}
X-Module: ${tx.moduleId}
X-Mapped-Fields: ${tx.mappedFields}
X-Persisted-To: sap_sync_logs, field_map_audit, sync_jobs
Date: ${iso(tx.ts).slice(0, 19).replace('T', ' ')}`;
}

export const SAMPLE_PAYLOADS: Record<string, { request: string; response: string }> = {
  'bp-master': {
    request: `{
  "store_name": "Param Dairy Store",
  "first_name": "Ram",
  "middle_name": "Kumar",
  "last_name": "Sharma",
  "contact_country_code": "+977",
  "contact_number": "9800000000",
  "email_id": "",
  "date_of_birth": "1995-06-15",
  "bill_to_address_line_1": "Kathmandu Main Road",
  "bill_to_country_name": "Nepal",
  "ship_to_address_line_1": "Warehouse Area",
  "ship_to_country_name": "Nepal",
  "role_name": "Dealer Incharger",
  "vat_number": "123456789",
  "pan_number": "123456789",
  "customer_code": "CUST1013",
  "date_of_joining": "2026-01-15",
  "bank_guarantee_amount": "100000",
  "reporting_to_emp": "EMP001",
  "bank_guarantee_expiry": "2026-06-15",
  "greater_circle_name": "Zone A",
  "circle_name": "Town X",
  "payment_terms": "Net 30",
  "rate_group": "Standard",
  "channels": ["GT"],
  "status": "Y",
  "cost_center_master": "CC.100"
}`,
    response: `{
  "id": 4831,
  "customer_code": "CUST1013",
  "store_name": "Param Dairy Store",
  "created_at": "2026-05-22T11:42:18.214+05:45",
  "is_active": true,
  "territory": { "zone_id": 12, "circle_id": 47 },
  "_meta": {
    "mapped_fields": 28,
    "transformer": "sap.bp-master.v1 → dms.distributor.v3",
    "review_needed": []
  }
}`,
  },
  'blanket-agreement': {
    request: `{
  "bp_code": "CUST1001",
  "agreement_method": "qty",
  "agreement_type": "general",
  "start_date": "2026-01-01",
  "end_date": "2026-12-31",
  "status": "A",
  "lines": [
    {
      "line_number": 1,
      "item_code": "FR0001",
      "item_name": "Fresh Milk 500ml",
      "planned_quantity": "1000",
      "portion_of_returns": "5"
    }
  ]
}`,
    response: `{
  "id": 187,
  "bp_code": "CUST1001",
  "method": "QUANT",
  "agreement_type": "general",
  "status": "Approved",
  "lines_count": 1,
  "created_at": "2026-05-22T11:42:18.401+05:45"
}`,
  },
  'delivery-order': {
    request: `{
  "invoice_number": "INV001",
  "do_entry": "DOE001",
  "do_number": "DO-001",
  "doc_entry": "DOC001",
  "doc_number_so": "DOC-SO-001",
  "do_date": "2026-02-20",
  "do_amount": "5000.00",
  "do_tax": "650.00",
  "do_total": "5650.00",
  "production_unit": "Unit A",
  "do_details": [
    {
      "item_code": "SKU001",
      "rate": "100.00",
      "quantity": "50",
      "uom": "PCS",
      "batch_number": "B001",
      "mfg_date": "2026-01-01",
      "expiry_date": "2026-06-01",
      "amount": "5000.00"
    }
  ]
}`,
    response: `{
  "id": 1284,
  "do_entry": "DOE001",
  "do_number": "DO-001",
  "sap_doc_entry": "DOC001",
  "sap_so_number": "DOC-SO-001",
  "amount": 5000.00,
  "tax": 650.00,
  "total": 5650.00,
  "lines": [
    { "id": 8421, "variant_code": "SKU001", "qty": 50, "rate": 100.00, "amount": 5000.00, "batch": "B001", "mfg_date": "2026-01-01", "expiry_date": "2026-06-01" }
  ],
  "created_at": "2026-05-22T11:42:18.512+05:45"
}`,
  },
  'balance-status-update': {
    request: `{
  "party_code": "PARTY001",
  "updated_amount": 1500.5
}`,
    response: `{
  "party_code": "PARTY001",
  "outstanding_balance": 1500.50,
  "updated_at": "2026-05-22T11:42:18.087+05:45"
}`,
  },
  'order-status-sync': {
    request: `{
  "doc_entry": "DOC001",
  "doc_number_so": "DOC-SO-001",
  "status": "Cancel"
}`,
    response: `{
  "doc_entry": "DOC001",
  "doc_number_so": "DOC-SO-001",
  "order_status": "CANCELLED",
  "updated_at": "2026-05-22T11:42:18.123+05:45"
}`,
  },
  'products': {
    request: `{
  "product_name": "SAMPLE PRODUCT",
  "hsn_code": "0401",
  "variant_code": "SKU001",
  "sujal_matrix": "Matrix Group 1",
  "primary_selling_unit_name": "CRATE",
  "primary_selling_unit_quantity": 12,
  "secondary_selling_unit_name": "POUCH",
  "secondary_selling_unit_quantity": 1,
  "mrp": 500,
  "is_packaging_allow": "Y",
  "status": "Y",
  "production_unit_id": 1,
  "uom_type": "EA",
  "product_category": "Dairy",
  "product_variant_size": 500,
  "tax_code": [
    { "country_name": "Nepal", "tax_name": "VAT", "tax_percentage": "13" }
  ],
  "channels": ["GT", "MT"]
}`,
    response: `{
  "id": 4218,
  "variant_code": "SKU001",
  "product_name": "SAMPLE PRODUCT",
  "mrp": 500,
  "sujal_matrix_id": 1,
  "is_active": true,
  "message": "Created"
}`,
  },
  'special-price-list': {
    request: `{
  "item_code": "FR0123",
  "container_price": "1585.54",
  "discount": "10",
  "party_code": "CUST1000",
  "start_date": "2022-01-01",
  "end_date": "2022-12-31",
  "status": "Y"
}`,
    response: `{
  "id": 9921,
  "party_code": "CUST1000",
  "variant_code": "FR0123",
  "container_price": 1585.54,
  "discount_pct": 10.00,
  "is_active": true
}`,
  },
  'price-list': {
    request: `{
  "rate_group": "Standard",
  "item_code": "FR0001",
  "container_price": "1585.54",
  "status": "Y"
}`,
    response: `{
  "id": 38201,
  "rate_group_id": 1,
  "variant_code": "FR0001",
  "container_price": 1585.54,
  "is_active": true
}`,
  },
  'greater-circles': {
    request: `{
  "name": "Zone A",
  "status": "Y"
}`,
    response: `{ "id": 12, "name": "Zone A", "code": "Zone A", "is_active": true, "message": "Created" }`,
  },
  'circles': {
    request: `{
  "name": "Town X",
  "greater_circle_name": "Zone A",
  "status": "Y"
}`,
    response: `{ "id": 47, "name": "Town X", "code": "Town X", "zone_id": 12, "is_active": true, "message": "Created" }`,
  },
  'container': {
    request: `{
  "name": "CRATE",
  "level": "PRIMARY",
  "status": "Y"
}`,
    response: `{ "id": 1, "name": "CRATE", "code": "CRATE", "level": "PRIMARY", "is_active": true, "message": "Created" }`,
  },
  'matrix': {
    request: `{
  "name": "Matrix Group 1",
  "status": "Y"
}`,
    response: `{ "id": 1, "name": "Matrix Group 1", "code": "Matrix Group 1", "is_active": true, "message": "Created" }`,
  },
  'product-class': {
    request: `{
  "name": "Dairy Products",
  "unit": "Ltr",
  "status": "Y"
}`,
    response: `{ "id": 4, "name": "Dairy Products", "code": "Dairy Products", "description": "UOM: Ltr", "is_active": true, "message": "Created" }`,
  },
  'product-name': {
    request: `{
  "name": "Fresh Milk",
  "product_class_name": "Dairy Products",
  "status": "Y"
}`,
    response: `{ "id": 142, "name": "Fresh Milk", "code": "Fresh Milk", "product_class_id": 4, "is_active": true, "message": "Created" }`,
  },
  'payment-terms': {
    request: `{
  "payment_term_name": "Net 30",
  "term_days": "30",
  "status": "Y"
}`,
    response: `{ "id": 3, "payment_term_name": "Net 30", "code": "Net 30", "term_days": 30, "is_active": true, "message": "Created" }`,
  },
  'price-list-group': {
    request: `{
  "name": "Standard",
  "status": "Y"
}`,
    response: `{ "id": 1, "name": "Standard", "code": "Standard", "is_active": true, "message": "Created" }`,
  },
  'channels': {
    request: `{
  "channel_code": "GT",
  "channel_name": "General Trade",
  "short_name": "GT",
  "description": "General trade outlets",
  "status": "Y"
}`,
    response: `{ "id": 9, "name": "General Trade", "code": "GT", "short_name": "GT", "description": "General trade outlets", "is_active": true, "message": "Channel created successfully" }`,
  },
};
