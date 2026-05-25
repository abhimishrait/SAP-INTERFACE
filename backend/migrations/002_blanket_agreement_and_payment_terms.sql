-- Dedicated master tables for Blanket Agreement (spec 3.2) and Payment Terms (spec 3.9).
-- These replace our previous mapping onto schemes/payment_preferences so the data shape
-- matches the SAP spec 1:1 and avoids overloading the rich scheme engine.
--
-- Safe to re-run: every CREATE uses IF NOT EXISTS.

-- ============================================================================
-- 1. Payment Terms (spec §3.9)
-- ============================================================================

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


-- ============================================================================
-- 2. Blanket Agreement header (spec §3.2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS blanket_agreements (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(32) NOT NULL UNIQUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  -- SAP identifiers
  bp_code VARCHAR(20) NOT NULL,                -- spec says one agreement per BP
  bp_name VARCHAR(255) NOT NULL,
  party_id BIGINT NULL,                        -- FK → external_user_profiles.id (resolved at write time)

  -- shape
  agreement_method ENUM('qty', 'financial') NOT NULL,
  agreement_type   ENUM('general', 'specific') NULL,
  scheme_name      VARCHAR(255) NULL,

  -- validity
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,

  -- lifecycle: A = Approved (active), T = Terminated
  status ENUM('A', 'T') NOT NULL DEFAULT 'A',

  created_by_id BIGINT NULL,
  updated_by_id BIGINT NULL,

  -- spec rule: bp_code is unique among ACTIVE rows (one open agreement per BP).
  -- A partial / functional unique index would be ideal but MySQL doesn't support
  -- those directly — enforced in application code in blanket-agreement.js.
  KEY idx_blanket_agreements_bp_code (bp_code),
  KEY idx_blanket_agreements_party (party_id),
  KEY idx_blanket_agreements_status_date (status, end_date),
  CONSTRAINT fk_blanket_agreements_party
    FOREIGN KEY (party_id) REFERENCES external_user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_blanket_agreements_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
  CONSTRAINT fk_blanket_agreements_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================================
-- 3. Blanket Agreement lines (nested under header)
-- ============================================================================

CREATE TABLE IF NOT EXISTS blanket_agreement_lines (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(32) NOT NULL UNIQUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  agreement_id BIGINT NOT NULL,
  line_number  INT UNSIGNED NOT NULL,

  -- item (Quantitative shapes — General / Specific)
  item_code VARCHAR(50) NULL,
  item_name VARCHAR(255) NULL,
  product_id BIGINT NULL,                      -- FK → products.id (resolved at write time)
  planned_quantity DECIMAL(14,2) NULL,
  unit_price DECIMAL(14,2) NULL,               -- Specific only

  -- Financial shape
  planned_amount DECIMAL(14,2) NULL,

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
