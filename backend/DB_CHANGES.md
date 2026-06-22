# DB-level changes — replicate these in the DMS project

Everything our SAP-facing backend (`backend/src/sap/*.js`) writes to `abc_dms`,
broken down by whether it's a hard schema change, an auto-created seed row, a
data convention we adopted, or still pending.

Apply these to your DMS project's database in the same order shown below.
All MySQL DDL is idempotent (`IF NOT EXISTS`) where possible.

| Migration file | What it creates / changes |
|---|---|
| `001_integration_transactions.sql` | ~~`integration_transactions`~~ — **superseded by 004** (kept for history) |
| `002_blanket_agreement_and_payment_terms.sql` | `payment_terms`, `blanket_agreements`, `blanket_agreement_lines` (1.2, 1.3) |
| `003_external_user_profiles_payment_term_fk.sql` | adds `external_user_profiles.payment_term_id` FK (1.4) |
| `004_sap_sync_logs_extend_and_retire_intx.sql` | extends `sap_sync_logs` with direction/routing/telemetry cols, relaxes `order_id` to NULLABLE, drops `integration_transactions` (1.1, 1.5) |
| `005_towns_zone_id_nullable.sql` | relaxes `towns.zone_id` to NULLABLE so a Circle (§3.4) can be created without a parent zone — zone is assigned manually in the DMS UI (1.8) |
| `006_sujal_matrices_simple_master.sql` | reshapes `sujal_matrices` to the simple-master shape (name + code + is_active); drops the wide columns (`material_group`, `product_class_name`, `hsn_code`, `order_of`, `unit`) since SAP only sends `{ name, status }` for Matrix (1.9) |

---

## 1. Hard schema changes (must run as SQL)

### 1.1 ~~NEW TABLE — `integration_transactions`~~ — superseded by 1.5

Originally introduced as a dedicated table for multi-module SAP API logs.
The DMS already had `sap_sync_logs` for order syncs, so to keep the schema
lean we **dropped `integration_transactions`** and extended `sap_sync_logs`
to handle inbound + outbound traffic across all 16 modules. See section 1.5.

The CREATE TABLE below is preserved for historical reference only — do not
re-create this table.

```sql
CREATE TABLE IF NOT EXISTS integration_transactions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  correlation_id VARCHAR(64) NOT NULL,

  -- routing
  module_id VARCHAR(40) NOT NULL,        -- 'bp-master', 'delivery-order', etc.
  method VARCHAR(8) NOT NULL,            -- POST / PUT
  path VARCHAR(255) NOT NULL,            -- /sap/bp-master/ or /sap/bp-master/123/
  resource_id VARCHAR(64) NULL,          -- {id} from path on PUT, or BP code, etc.

  -- outcome
  status_code SMALLINT UNSIGNED NOT NULL,
  pipeline_stage VARCHAR(20) NOT NULL DEFAULT 'completed',
                                          -- queued / mapping / validate / transform / persist / completed / failed
  error_message TEXT NULL,

  -- telemetry
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  bytes_in INT UNSIGNED NOT NULL DEFAULT 0,
  bytes_out INT UNSIGNED NOT NULL DEFAULT 0,
  retry_count TINYINT UNSIGNED NOT NULL DEFAULT 0,

  -- payloads (JSON for easy querying)
  request_headers JSON NULL,
  request_body JSON NULL,
  response_body JSON NULL,

  -- caller context
  remote_ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,

  -- denormalized convenience columns used by the console
  distributor_name VARCHAR(255) NULL,
  customer_code VARCHAR(50) NULL,
  doc_number VARCHAR(50) NULL,           -- DO number, SO number, etc.

  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  KEY idx_intx_created_at (created_at DESC),
  KEY idx_intx_module_created (module_id, created_at DESC),
  KEY idx_intx_status (status_code),
  KEY idx_intx_correlation (correlation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 1.2 NEW TABLE — `payment_terms` (spec §3.9)

Dedicated table for SAP Payment Terms. Previously rode on `payment_preferences`,
but that table has no `term_days` and the wrong unique-key shape, so we split
it out.

**Status:** ✅ shipped — see `backend/migrations/002_blanket_agreement_and_payment_terms.sql`.

```sql
CREATE TABLE IF NOT EXISTS payment_terms (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(32) NOT NULL UNIQUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  payment_term_name VARCHAR(50) NOT NULL,
  code              VARCHAR(50) NULL,
  term_days         SMALLINT UNSIGNED NULL,
  description       VARCHAR(255) NULL,

  created_by_id BIGINT NULL,
  updated_by_id BIGINT NULL,

  UNIQUE KEY uq_payment_terms_name (payment_term_name),
  UNIQUE KEY uq_payment_terms_code (code),
  KEY idx_payment_terms_is_active (is_active),
  CONSTRAINT fk_payment_terms_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
  CONSTRAINT fk_payment_terms_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Endpoint behavior:
- `POST /sap/payment-terms/` writes here; auto-derives `code` from name if absent.
- `PUT /sap/payment-terms/` accepts `code` in body (preferred) or `:id` in URL.
- `term_days` accepted as string or int; rejected if not a non-negative integer.

### 1.3 NEW TABLES — `blanket_agreements` + `blanket_agreement_lines` (spec §3.2)

Header + line-items pair. Replaces the previous mapping onto
`schemes` + `scheme_rules` so the SAP-side data shape is preserved exactly.

**Status:** ✅ shipped — see `backend/migrations/002_blanket_agreement_and_payment_terms.sql`.

**Header:**
```sql
CREATE TABLE IF NOT EXISTS blanket_agreements (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(32) NOT NULL UNIQUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  bp_code VARCHAR(20) NOT NULL,
  bp_name VARCHAR(255) NOT NULL,
  party_id BIGINT NULL,                        -- FK → external_user_profiles.id

  agreement_method ENUM('qty', 'financial') NOT NULL,
  agreement_type   ENUM('general', 'specific') NULL,
  scheme_name      VARCHAR(255) NULL,

  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  status     ENUM('A', 'T') NOT NULL DEFAULT 'A',

  created_by_id BIGINT NULL,
  updated_by_id BIGINT NULL,

  KEY idx_blanket_agreements_bp_code (bp_code),
  KEY idx_blanket_agreements_party (party_id),
  KEY idx_blanket_agreements_status_date (status, end_date),
  CONSTRAINT fk_blanket_agreements_party
    FOREIGN KEY (party_id) REFERENCES external_user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_blanket_agreements_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
  CONSTRAINT fk_blanket_agreements_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Lines:**
```sql
CREATE TABLE IF NOT EXISTS blanket_agreement_lines (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(32) NOT NULL UNIQUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  agreement_id BIGINT NOT NULL,
  line_number  INT UNSIGNED NOT NULL,

  -- qty shape
  item_code  VARCHAR(50) NULL,
  item_name  VARCHAR(255) NULL,
  product_id BIGINT NULL,                      -- FK → products.id
  planned_quantity DECIMAL(14,2) NULL,
  unit_price       DECIMAL(14,2) NULL,         -- only Specific

  -- financial shape
  planned_amount   DECIMAL(14,2) NULL,

  -- common
  portion_of_returns DECIMAL(5,2) NULL,

  created_by_id BIGINT NULL,
  updated_by_id BIGINT NULL,

  UNIQUE KEY uq_blanket_lines_agmt_line (agreement_id, line_number),
  KEY idx_blanket_lines_product (product_id),
  CONSTRAINT fk_blanket_lines_agreement
    FOREIGN KEY (agreement_id) REFERENCES blanket_agreements(id) ON DELETE CASCADE,
  CONSTRAINT fk_blanket_lines_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT fk_blanket_lines_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
  CONSTRAINT fk_blanket_lines_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Endpoint behavior:
- One **open** (`status = 'A'`) agreement per `bp_code` — enforced in application code.
- `agreement_method = 'qty'`: line needs `item_code`, `item_name`, `planned_quantity`, `portion_of_returns`
  (`unit_price` additionally when `agreement_type = 'specific'`).
- `agreement_method = 'financial'`: line needs `planned_amount`, `portion_of_returns`.
- PUT can target by URL `:id` or by `body.bp_code` (finds the BP's most recent agreement).
- PUT replaces all lines if `lines` is supplied; otherwise updates header only.

### 1.4 NEW COLUMN — `external_user_profiles.payment_term_id` (FK → payment_terms)

BP Master (spec §3.1) accepts `payment_terms` (or `payment_term_name`) in its
payload — that value resolves to a row in the dedicated `payment_terms` table
(section 1.2) and is stored as a FK on the BP profile.

**Status:** ✅ shipped — see `backend/migrations/003_external_user_profiles_payment_term_fk.sql`.

```sql
ALTER TABLE external_user_profiles
  ADD COLUMN payment_term_id BIGINT NULL;

ALTER TABLE external_user_profiles
  ADD CONSTRAINT fk_eup_payment_term
    FOREIGN KEY (payment_term_id) REFERENCES payment_terms(id) ON DELETE SET NULL;

CREATE INDEX idx_eup_payment_term ON external_user_profiles (payment_term_id);
```

Endpoint behavior:
- POST resolves `payment_terms` by name (case-insensitive) OR by `code` (uppercased),
  then writes `payment_term_id`. Missing reference → **400** with field-level error.
- PUT can change the FK by sending the new `payment_terms` value.
- DELETE SET NULL — if a payment-terms row is deleted, BPs pointing at it just lose
  the reference; the BP profile stays intact.

### 1.5 EXTEND `sap_sync_logs` + retire `integration_transactions`

The DMS already had `sap_sync_logs` for order syncs (with `order_id NOT NULL`
FK → `sales_orders`). To keep the database lean, instead of carrying a parallel
`integration_transactions` table, we extend `sap_sync_logs` to be the single
SAP integration log for **inbound** (SAP → DMS) and **outbound** (DMS → SAP)
traffic across all 16 modules.

**Status:** ✅ shipped — see `backend/migrations/004_sap_sync_logs_extend_and_retire_intx.sql`.

What the migration does:
- Relaxes existing columns so non-order modules can log too:
  - `order_id` → `BIGINT NULL` (FK stays; legacy order-sync rows keep their value)
  - `attempted_at`, `created_at`, `updated_at` → get sensible `CURRENT_TIMESTAMP(6)` defaults
  - `is_active` → defaults to `1`
  - `status` widened to `VARCHAR(20)` defaulting to `'PENDING'`
- Adds the routing / telemetry / denorm columns the console already read on the old table:
  - `direction ENUM('INBOUND','OUTBOUND') NOT NULL DEFAULT 'INBOUND'`
  - `correlation_id`, `module_id`, `method`, `path`, `resource_id`
  - `status_code`, `pipeline_stage` (default `'completed'`)
  - `duration_ms`, `bytes_in`, `bytes_out`, `retry_count`
  - `request_headers` (JSON) — `request_payload` / `response_payload` already existed
  - `remote_ip`, `user_agent`
  - `distributor_name`, `customer_code`, `doc_number`
- Adds matching indexes: `idx_ssl_created_at`, `idx_ssl_module_created`,
  `idx_ssl_status_code`, `idx_ssl_correlation`, `idx_ssl_direction_created`.
- `DROP TABLE IF EXISTS integration_transactions;`

Code changes that ride with it:
- `backend/src/middleware/txLogger.js` writes to `sap_sync_logs` with `direction='INBOUND'`.
- All `backend/src/console/*.js` queries read from `sap_sync_logs` with
  `WHERE module_id IS NOT NULL` so legacy order-sync rows stay hidden from
  the multi-module API Logs / Overview / Sync Queue views.
- Outbound (DMS → SAP) call sites should insert rows with `direction='OUTBOUND'`
  when they're added.

### 1.6 NEW TABLE — `sujal_matrices` (replaces `product_domains` for Matrix module) — **reshaped, see 1.9**

The DMS team added a dedicated Matrix table. The original wide shape
(`material_group`, `product_class_name`, `hsn_code`, `order_of`, `unit`) is
**superseded by 1.9** — SAP only pushes `{ name, status }` per spec §3.6,
so the table was reshaped to the simple-master columns (name + code +
is_active). The wide CREATE below is preserved for historical reference;
the live shape is in section 1.9.

```sql
CREATE TABLE sujal_matrices (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(32) NOT NULL UNIQUE,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  is_active TINYINT(1) NOT NULL,

  material_group      VARCHAR(100) NOT NULL,
  product_class_name  VARCHAR(255) NOT NULL,
  hsn_code            VARCHAR(20)  NOT NULL,
  order_of            INT UNSIGNED NOT NULL,
  unit                VARCHAR(4)   NOT NULL,

  created_by_id BIGINT NULL,
  updated_by_id BIGINT NULL,

  UNIQUE KEY uq_sujal_matrix_mg_class_hsn (material_group, product_class_name, hsn_code),
  KEY idx_sujal_matrix_hsn    (hsn_code),
  KEY idx_sujal_matrix_mgroup (material_group),
  CONSTRAINT FOREIGN KEY (created_by_id) REFERENCES users(id),
  CONSTRAINT FOREIGN KEY (updated_by_id) REFERENCES users(id),
  CONSTRAINT CHECK (order_of >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

~~Endpoint behavior~~ — superseded by section 1.9. The `/sap/matrix/` endpoint
no longer writes to `sujal_matrices`. See 1.9 for the current contract.

### 1.7 NEW COLUMN — `external_user_profiles.cost_center_code`

Added to `external_user_profiles` as `varchar(50) NOT NULL` (no default).
BP POST/PUT now populates it from the SAP `cost_center_master` payload field
(also accepts `cost_center_code` directly), normalized to UPPER, capped at 50
characters. Empty string when SAP omits the field — avoids breaking BP creation.

### 1.8 RELAX — `towns.zone_id` → NULLABLE

Spec §3.4 (Circles) accepts `greater_circle_name` as optional. The DMS team
maps a Circle to its parent zone manually in the UI rather than from the
inbound SAP payload, so we drop the `NOT NULL` on the FK column. The FK to
`zones(id)` is preserved.

**Status:** ✅ shipped — see `backend/migrations/005_towns_zone_id_nullable.sql`.

```sql
ALTER TABLE towns
  MODIFY COLUMN zone_id BIGINT NULL;
```

Endpoint behavior:
- POST `/sap/circles/` — `greater_circle_name` is optional. If supplied, it
  must resolve to an existing zone (400 on unknown). If omitted, `zone_id`
  stays NULL and is assigned later in the DMS UI.
- PUT `/sap/circles/{id}/` — same rule: optional, validated only when sent.

### 1.9 RESHAPE — `sujal_matrices` → simple-master shape

SAP only sends `{ name, status }` for Matrix per spec PDF v1.2 §3.6. The
original wide shape from §1.6 (`material_group`, `product_class_name`,
`hsn_code`, `order_of`, `unit`) doesn't match what SAP pushes, so Matrix
POSTs were 400-ing. We keep the dedicated `sujal_matrices` table but reshape
it to the standard simple-master columns:

```sql
sujal_matrices (
  id, uuid, created_at, updated_at, is_active,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50)  NOT NULL UNIQUE,
  created_by_id, updated_by_id
)
```

**Status:** ✅ shipped — see `backend/migrations/006_sujal_matrices_simple_master.sql`.

The migration is idempotent: it CREATEs the table if absent, or — if the
old wide shape exists — backfills `name` from `material_group` (then
`product_class_name`), drops the old composite unique key, and drops the
unused columns.

Endpoint behavior:
- POST `/sap/matrix/` — body: `{ name, status }`. Writes to `sujal_matrices`.
- PUT `/sap/matrix/{id}/` — `name` and/or `status`.
- Products `sujal_matrix` FK resolves by `sujal_matrices.name` (case-insensitive).

---

## 2. Auto-created seed rows (the backend creates these on demand)

These are NOT schema changes — the data lands in *existing* DMS tables, but the
backend writes them the first time it needs them. You can pre-seed them in the
DMS project if you want a cleaner setup, or just leave the backend to self-heal.

| Table | When created | Row written |
|---|---|---|
| `production_lines` | First Product Class POST when default line missing | `{ code: 'DEFAULT_LINE', name: 'DEFAULT_LINE', is_active: 1 }` (controlled by `DEFAULT_PRODUCTION_LINE_CODE` in `.env`) |
| `scheme_types`    | First Blanket Agreement POST | `{ code: 'BLANKET_SAP', name: 'Blanket Agreement (SAP)', is_globally_active: 1, field_visibility_json: '{}' }` |
| `price_lists`     | First Price List row per `price_group_id` | "rolling" header: `{ file_name: 'sap-sync', effective_from: today, effective_to: '2099-12-31', status: 'ACTIVE' }` |
| `special_price_lists` | First Special Price List row | "rolling" header: `{ file_name: 'sap-sync', status: 'ACTIVE' }` |
| `users` (paired user per BP) | First BP Master POST per `customer_code` | `{ email: <bp.email_id> or '<customer_code>@sap.local', password: '!sap' (unusable), user_type: 'external', is_active: <status> }` |

To pre-seed manually in your DMS:

```sql
-- Default production line (avoids NOT NULL conflict on production_categories.production_line_id)
INSERT IGNORE INTO production_lines (uuid, created_at, updated_at, is_active, name, code)
  VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1, 'DEFAULT_LINE', 'DEFAULT_LINE');

-- Scheme type used for SAP-pushed blanket agreements
INSERT IGNORE INTO scheme_types
  (uuid, created_at, updated_at, is_active, name, code, description, icon, sort_order, is_globally_active, field_visibility_json)
  VALUES (REPLACE(UUID(),'-',''), NOW(6), NOW(6), 1,
          'Blanket Agreement (SAP)', 'BLANKET_SAP', '', '', 999, 1, '{}');
```

---

## 3. Data conventions our backend relies on

Not schema changes, but conventions you must keep consistent in the DMS project
so the SAP integration keeps resolving the right rows.

### 3.1 Product Name → `master_lookups`

Section 3.8 of the spec has no dedicated table in DMS. We store every distinct
Product Name as a row in `master_lookups` with:

| Column | Value |
|---|---|
| `category` | `'PRODUCT_NAME'` (fixed string — used as the discriminator) |
| `label` | the product name (case-insensitive uniqueness within `category='PRODUCT_NAME'`) |
| `value` | the `production_categories.id` it belongs to, as a string (so we can reverse-lookup the Product Class) |

If the DMS project's UI currently shows the distinct values from `products.product_name` directly,
keep that view but also expose the lookup-table list. Adding a new product name only via the SAP
endpoint puts a row in `master_lookups`, not in `products`.

### 3.2 Container `level` discriminator

Section 3.5 maps to `packaging_types`. The `level` column on that table must
accept: `PRIMARY`, `SECONDARY`, `TERTIARY`.

- SAP payload `level` field defaults to `PRIMARY` when missing.
- Products (3.13) references containers by name — both `primary_selling_unit_name`
  and `secondary_selling_unit_name` must resolve to rows in `packaging_types`
  (case-insensitive name match, level is **not** part of the lookup).

### 3.3 Sales Order ↔ SAP reconciliation columns

The `sales_orders` table already has these columns (we did NOT add them) — but
the SAP push assumes they exist:

| Column | Source |
|---|---|
| `sap_doc_entry`     | SAP's internal `DocEntry` (int) |
| `sap_order_number`  | SAP's `DocNum` (varchar 50) |
| `sap_sync_status`   | varchar(15) — we set to `'SYNCED'` |
| `sap_synced_at`     | datetime |
| `sap_synced_by_id`  | FK → `users.id` |

If your DMS schema doesn't yet have these, add them before delivery orders or
order-status-sync calls will work.

### 3.4 Status / enum tokens we write

| Module | Column | Tokens we write |
|---|---|---|
| Blanket Agreement | `schemes.status` | `APPROVED` / `TERMINATED` (mapped from SAP `A`/`T` or `Y`/`N`) |
| Delivery Order | `sales_orders.status` | `DELIVERED` |
| Order Status Sync | `sales_orders.status` | `CANCELLED` / `CLOSED` / `APPROVED` (mapped from SAP `Cancel` / `Close` / `Open`) |
| BP Master | `external_user_profiles.status` | `ACTIVE` / `INACTIVE` |
| All masters | `is_active` (boolean) | `1` / `0` (mapped from SAP `Y`/`N`/`1`/`0`) |

If your DMS enums use different tokens, either adjust `backend/src/lib/statusMap.js`
or align the DMS side to these.

### 3.5 `code` column populated automatically from `name`

The spec PDF v1.2 does NOT expose a `code` field on the simple masters
(sections 3.3 – 3.10). PUT is documented as `/sap/<module>/{id}/` only, where
`{id}` is the auto-generated integer primary key returned at create time.

For DMS tables that have a NOT-NULL `code` column (`zones`, `towns`,
`packaging_types`, `product_domains`, `production_categories`, `payment_terms`,
`price_groups`), our backend populates that column server-side from the literal
`name` value — verbatim, including spaces and case. If a future row would
collide on the same code we append a `_2`, `_3`, … suffix to keep the unique
constraint happy without SAP needing to know.

Example:

```
POST /sap/greater-circles/  body: { "name": "Zone A", "status": "Y" }
→ 201 { "id": 14, "name": "Zone A", "is_active": true, "message": "Created" }

DB:
SELECT name, code FROM zones WHERE id = 14;
→ Zone A | Zone A
```

`code` is not part of the SAP API surface. Don't accept it from SAP, don't
return it as a SAP-facing field — keep it as an internal DMS detail.

---

## 4. Pending — must decide + run before this endpoint goes live

Tracked in `backend/PENDING.md` and currently returns **501 Not Implemented**.

### 4.1 ~~Q3 — Payment Terms `term_days`~~ ✅ resolved

Resolved by section 1.2 above (new `payment_terms` table with native `term_days` column).
The endpoint now persists `term_days` directly. No more decision needed.

### 4.2 Q4 — Balance Status Update (module 3.15)

Spec endpoint: `PUT /sap/balance-status-update/` with `{ party_code, updated_amount }`.
Our `external_user_profiles` has no `outstanding_balance` column.

**Recommended approach — new table with history:**
```sql
CREATE TABLE IF NOT EXISTS bp_balances (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  party_id BIGINT NOT NULL,
  balance DECIMAL(14,2) NOT NULL,
  set_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  set_via VARCHAR(20) NOT NULL DEFAULT 'sap-sync',
  CONSTRAINT fk_bp_balances_party
    FOREIGN KEY (party_id) REFERENCES external_user_profiles(id) ON DELETE CASCADE,
  KEY idx_bp_balances_party_set_at (party_id, set_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
Each balance update inserts a row — letting you graph outstanding balance over
time and audit who changed what when.

**Alternative — single column on `external_user_profiles`:**
```sql
ALTER TABLE external_user_profiles
  ADD COLUMN outstanding_balance DECIMAL(14,2) NOT NULL DEFAULT 0;
```
Simpler but no history.

After either, remove the 501 stub from `backend/src/sap/balance-status-update.js`
and wire the write.

---

## 5. Summary checklist for the DMS team

- [x] ~~Run section 1.1 — create `integration_transactions`.~~ Superseded by 1.5.
- [ ] Run section 1.2 — create `payment_terms`.
- [ ] Run section 1.3 — create `blanket_agreements` + `blanket_agreement_lines`.
- [ ] Run section 1.4 — add `external_user_profiles.payment_term_id` FK column.
- [ ] Run section 1.5 — extend `sap_sync_logs` + drop `integration_transactions`.
- [ ] Run section 1.9 — reshape `sujal_matrices` to the simple-master columns (supersedes 1.6).
- [ ] Run section 1.7 — add `external_user_profiles.cost_center_code` column.
- [ ] Run section 1.8 — relax `towns.zone_id` to NULLABLE.
- [ ] Decide section 4.2 — pick `bp_balances` table OR `external_user_profiles.outstanding_balance` column.
- [ ] Verify your `sales_orders` has the SAP-sync columns from section 3.3.
- [ ] Confirm `packaging_types.level` allows `PRIMARY` / `SECONDARY` / `TERTIARY`.
- [ ] (Optional) Pre-seed the rows from section 2 if you don't want the backend to auto-create them.
- [ ] Align your status / enum tokens with section 3.4, or change `backend/src/lib/statusMap.js`.

Or just run the migrations against your DMS database in order:

```bash
# 001 is intentionally skipped — 004 retires the table it created.
mysql -u root -p abc_dms < backend/migrations/002_blanket_agreement_and_payment_terms.sql
mysql -u root -p abc_dms < backend/migrations/003_external_user_profiles_payment_term_fk.sql
mysql -u root -p abc_dms < backend/migrations/004_sap_sync_logs_extend_and_retire_intx.sql
mysql -u root -p abc_dms < backend/migrations/005_towns_zone_id_nullable.sql
mysql -u root -p abc_dms < backend/migrations/006_sujal_matrices_simple_master.sql
```
