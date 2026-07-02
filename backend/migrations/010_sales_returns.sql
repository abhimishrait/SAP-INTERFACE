-- Spec §Return Request — dealer-initiated product return posted to SAP B1 /ReturnRequest.
-- Two tables: header (sales_returns) + lines (sales_return_lines).
--
-- Header fields mirror the SAP B1 payload we forward, plus DMS-side attribution
-- (party, dealer user, reason, remarks). We store the SAP DocEntry/DocNum that
-- come back from SAP so the return can be reconciled and re-queried without a
-- second round-trip.
--
-- Line-level batch info lives in a JSON column on each line row (BatchNumbers
-- in the SAP payload). Batches are optional per the spec: batch-managed items
-- must supply them; non-batch items or WithoutInventoryMovement='Y' lines can
-- omit them.
--
-- Applied via node runner (scripts/run-migration.js). MySQL lacks
-- IF NOT EXISTS on CREATE TABLE INDEX so keep this migration idempotent by
-- checking table existence externally.

CREATE TABLE IF NOT EXISTS sales_returns (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                 CHAR(32) NOT NULL UNIQUE,
  created_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  is_active            TINYINT(1) NOT NULL DEFAULT 1,
  created_by_id        BIGINT NULL,
  updated_by_id        BIGINT NULL,

  -- DMS-native return number, format: RET-YYYY-XXXX. Unique.
  return_number        VARCHAR(30) NOT NULL UNIQUE,

  -- Party (dealer) initiating the return.
  party_id             BIGINT NOT NULL,
  card_code            VARCHAR(50) NOT NULL,      -- mirrors SAP CardCode = external_user_profiles.party_code

  -- SAP B1 header fields (spec — required for /ReturnRequest).
  doc_date             DATE NOT NULL,
  doc_due_date         DATE NOT NULL,
  tax_date             DATE NOT NULL,
  doc_currency         VARCHAR(10) NULL,          -- blank → BP default in SAP
  comments             TEXT NULL,
  u_bul_dis            DECIMAL(6,2) NULL,         -- U_BulDis — bulk discount %

  -- Reason (DMS-only classification; SAP doesn't split damaged vs expired).
  return_reason        VARCHAR(20) NOT NULL,      -- 'damaged' | 'expired' | 'other'
  remarks              TEXT NULL,                 -- dealer-supplied remarks

  -- SAP round-trip result. Populated after successful POST to SAP.
  sap_doc_entry        INT NULL,
  sap_doc_number       VARCHAR(50) NULL,
  sap_synced_at        DATETIME(6) NULL,
  sap_sync_status      VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending | synced | failed
  sap_sync_error       TEXT NULL,

  -- Whether stock has been decremented on the DMS side. Only true for lines
  -- with WithoutInventoryMovement='N'; header-level flag = any line moved.
  stock_moved          TINYINT(1) NOT NULL DEFAULT 0,

  KEY idx_sr_party (party_id),
  KEY idx_sr_card_code (card_code),
  KEY idx_sr_doc_date (doc_date),
  KEY idx_sr_sync_status (sap_sync_status),
  KEY idx_sr_created_by (created_by_id),
  KEY idx_sr_updated_by (updated_by_id),

  CONSTRAINT fk_sr_party      FOREIGN KEY (party_id)      REFERENCES external_user_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_created_by FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sr_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sales_return_lines (
  id                          BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                        CHAR(32) NOT NULL UNIQUE,
  created_at                  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at                  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  is_active                   TINYINT(1) NOT NULL DEFAULT 1,
  created_by_id               BIGINT NULL,
  updated_by_id               BIGINT NULL,

  return_id                   BIGINT NOT NULL,
  line_number                 INT NOT NULL,          -- 0-indexed line position

  -- SAP DocumentLines fields (spec).
  item_code                   VARCHAR(50) NOT NULL,
  product_id                  BIGINT NULL,           -- resolved from item_code via products.sku_code
  quantity                    DECIMAL(14,3) NOT NULL,
  vat_group                   VARCHAR(20) NULL,      -- e.g. 'VAT-13'
  unit_price                  DECIMAL(14,4) NOT NULL,
  line_total                  DECIMAL(14,4) NOT NULL,
  agreement_no                INT NULL,              -- Blanket Agreement number if applicable
  without_inventory_movement  CHAR(1) NOT NULL DEFAULT 'N',   -- 'Y' | 'N'
  costing_code                VARCHAR(50) NULL,
  cogs_costing_code           VARCHAR(50) NULL,
  u_ratio                     DECIMAL(8,4) NULL,     -- Portion of Returns %
  u_s_amnt                    DECIMAL(14,4) NULL,    -- portion * line_total / 100

  -- Batches (nullable — required only for batch-managed items with
  -- WithoutInventoryMovement='N'). JSON: [{batch_number, quantity, mfg_date?, expiry_date?}].
  batch_numbers               JSON NULL,

  KEY idx_srl_return (return_id),
  KEY idx_srl_item_code (item_code),
  KEY idx_srl_product (product_id),
  KEY idx_srl_created_by (created_by_id),
  KEY idx_srl_updated_by (updated_by_id),

  CONSTRAINT fk_srl_return     FOREIGN KEY (return_id)     REFERENCES sales_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_srl_product    FOREIGN KEY (product_id)    REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_srl_created_by FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_srl_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
