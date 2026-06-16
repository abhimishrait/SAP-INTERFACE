-- Reshape `sujal_matrices` to the standard simple-master columns so the SAP
-- §3.6 Matrix endpoint can write `{ name, status }` only.
--
-- Handles two starting states idempotently:
--   (a) Table doesn't exist        → CREATE with the simple-master shape.
--   (b) Table exists in wide shape → backfill `name` from material_group,
--       drop the old unique key + columns, add `code` (auto-derived from
--       name with collision suffix in app code).

-- (a) Create with the target shape if missing.
CREATE TABLE IF NOT EXISTS sujal_matrices (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid          CHAR(32)     NOT NULL UNIQUE,
  created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,

  name          VARCHAR(255) NOT NULL,
  code          VARCHAR(50)  NOT NULL,

  created_by_id BIGINT NULL,
  updated_by_id BIGINT NULL,

  UNIQUE KEY uq_sujal_matrices_code (code),
  KEY idx_sujal_matrices_name (name),
  CONSTRAINT fk_sujal_matrices_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
  CONSTRAINT fk_sujal_matrices_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- (b) If the table came from the old wide shape, reshape it.
DROP PROCEDURE IF EXISTS _sm_reshape;
DELIMITER $$
CREATE PROCEDURE _sm_reshape()
BEGIN
  DECLARE has_name        INT DEFAULT 0;
  DECLARE has_code        INT DEFAULT 0;
  DECLARE has_mg          INT DEFAULT 0;
  DECLARE has_pcn         INT DEFAULT 0;
  DECLARE has_hsn         INT DEFAULT 0;
  DECLARE has_order_of    INT DEFAULT 0;
  DECLARE has_unit        INT DEFAULT 0;
  DECLARE has_old_unique  INT DEFAULT 0;

  SELECT COUNT(*) INTO has_name FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'sujal_matrices' AND column_name = 'name';
  SELECT COUNT(*) INTO has_code FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'sujal_matrices' AND column_name = 'code';
  SELECT COUNT(*) INTO has_mg FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'sujal_matrices' AND column_name = 'material_group';
  SELECT COUNT(*) INTO has_pcn FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'sujal_matrices' AND column_name = 'product_class_name';
  SELECT COUNT(*) INTO has_hsn FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'sujal_matrices' AND column_name = 'hsn_code';
  SELECT COUNT(*) INTO has_order_of FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'sujal_matrices' AND column_name = 'order_of';
  SELECT COUNT(*) INTO has_unit FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'sujal_matrices' AND column_name = 'unit';

  -- Add name/code if they aren't there yet (nullable so existing rows survive).
  IF has_name = 0 THEN
    ALTER TABLE sujal_matrices ADD COLUMN name VARCHAR(255) NULL AFTER is_active;
  END IF;
  IF has_code = 0 THEN
    ALTER TABLE sujal_matrices ADD COLUMN code VARCHAR(50) NULL AFTER name;
  END IF;

  -- Backfill from whichever wide column is present.
  IF has_mg = 1 THEN
    UPDATE sujal_matrices SET name = COALESCE(name, material_group) WHERE name IS NULL OR name = '';
  ELSEIF has_pcn = 1 THEN
    UPDATE sujal_matrices SET name = COALESCE(name, product_class_name) WHERE name IS NULL OR name = '';
  END IF;
  UPDATE sujal_matrices SET code = LEFT(name, 50) WHERE (code IS NULL OR code = '') AND name IS NOT NULL;

  -- Drop the old composite unique key if present.
  SELECT COUNT(*) INTO has_old_unique FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'sujal_matrices'
      AND index_name = 'uq_sujal_matrix_mg_class_hsn';
  IF has_old_unique > 0 THEN
    ALTER TABLE sujal_matrices DROP INDEX uq_sujal_matrix_mg_class_hsn;
  END IF;

  -- Drop the old wide columns.
  IF has_mg       = 1 THEN ALTER TABLE sujal_matrices DROP COLUMN material_group;     END IF;
  IF has_pcn      = 1 THEN ALTER TABLE sujal_matrices DROP COLUMN product_class_name; END IF;
  IF has_hsn      = 1 THEN ALTER TABLE sujal_matrices DROP COLUMN hsn_code;           END IF;
  IF has_order_of = 1 THEN ALTER TABLE sujal_matrices DROP COLUMN order_of;           END IF;
  IF has_unit     = 1 THEN ALTER TABLE sujal_matrices DROP COLUMN unit;               END IF;

  -- Tighten constraints + add unique on code (skip if already in place).
  ALTER TABLE sujal_matrices
    MODIFY COLUMN name VARCHAR(255) NOT NULL,
    MODIFY COLUMN code VARCHAR(50)  NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'sujal_matrices'
       AND index_name = 'uq_sujal_matrices_code'
  ) THEN
    ALTER TABLE sujal_matrices ADD UNIQUE KEY uq_sujal_matrices_code (code);
  END IF;
END$$
DELIMITER ;

CALL _sm_reshape();
DROP PROCEDURE _sm_reshape;
