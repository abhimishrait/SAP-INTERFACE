-- Extends `sap_sync_logs` to be the single SAP integration log table for
-- inbound (SAP -> DMS) AND outbound (DMS -> SAP) traffic across all 16
-- modules. The previously-introduced `integration_transactions` is retired.
--
-- MySQL doesn't support `ADD COLUMN IF NOT EXISTS`, so we use a helper
-- procedure that inspects information_schema before each ADD/INDEX. Safe to
-- re-run.

-- 1. Relax existing columns that block multi-module logging.
ALTER TABLE sap_sync_logs
  MODIFY COLUMN order_id     BIGINT NULL,
  MODIFY COLUMN attempted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  MODIFY COLUMN created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  MODIFY COLUMN updated_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  MODIFY COLUMN is_active    TINYINT(1)  NOT NULL DEFAULT 1,
  MODIFY COLUMN status       VARCHAR(20) NOT NULL DEFAULT 'PENDING';

-- 2. Idempotent ADD-COLUMN / ADD-INDEX helpers.
DROP PROCEDURE IF EXISTS _ssl_add_col;
DROP PROCEDURE IF EXISTS _ssl_add_idx;

DELIMITER $$

CREATE PROCEDURE _ssl_add_col(IN col_name VARCHAR(64), IN col_def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name   = 'sap_sync_logs'
       AND column_name  = col_name
  ) THEN
    SET @sql = CONCAT('ALTER TABLE sap_sync_logs ADD COLUMN `', col_name, '` ', col_def);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE _ssl_add_idx(IN idx_name VARCHAR(64), IN idx_cols TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name   = 'sap_sync_logs'
       AND index_name   = idx_name
  ) THEN
    SET @sql = CONCAT('ALTER TABLE sap_sync_logs ADD INDEX `', idx_name, '` (', idx_cols, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

-- 3. New columns — direction + routing + telemetry + denorm convenience.
CALL _ssl_add_col('direction',        "ENUM('INBOUND','OUTBOUND') NOT NULL DEFAULT 'INBOUND' COMMENT 'INBOUND = SAP -> DMS (this backend), OUTBOUND = DMS -> SAP (SL push)'");
CALL _ssl_add_col('correlation_id',   'VARCHAR(64) NULL');
CALL _ssl_add_col('module_id',        'VARCHAR(40) NULL');
CALL _ssl_add_col('method',           'VARCHAR(8)  NULL');
CALL _ssl_add_col('path',             'VARCHAR(255) NULL');
CALL _ssl_add_col('resource_id',      'VARCHAR(64) NULL');
CALL _ssl_add_col('status_code',      'SMALLINT UNSIGNED NULL');
CALL _ssl_add_col('pipeline_stage',   "VARCHAR(20) NOT NULL DEFAULT 'completed'");
CALL _ssl_add_col('duration_ms',      'INT UNSIGNED NOT NULL DEFAULT 0');
CALL _ssl_add_col('bytes_in',         'INT UNSIGNED NOT NULL DEFAULT 0');
CALL _ssl_add_col('bytes_out',        'INT UNSIGNED NOT NULL DEFAULT 0');
CALL _ssl_add_col('retry_count',      'TINYINT UNSIGNED NOT NULL DEFAULT 0');
CALL _ssl_add_col('request_headers',  'JSON NULL');
CALL _ssl_add_col('remote_ip',        'VARCHAR(45) NULL');
CALL _ssl_add_col('user_agent',       'VARCHAR(255) NULL');
CALL _ssl_add_col('distributor_name', 'VARCHAR(255) NULL');
CALL _ssl_add_col('customer_code',    'VARCHAR(50) NULL');
CALL _ssl_add_col('doc_number',       'VARCHAR(50) NULL');

-- 4. Indexes the console queries depend on.
CALL _ssl_add_idx('idx_ssl_created_at',        'created_at DESC');
CALL _ssl_add_idx('idx_ssl_module_created',    'module_id, created_at DESC');
CALL _ssl_add_idx('idx_ssl_status_code',       'status_code');
CALL _ssl_add_idx('idx_ssl_correlation',       'correlation_id');
CALL _ssl_add_idx('idx_ssl_direction_created', 'direction, created_at DESC');

DROP PROCEDURE _ssl_add_col;
DROP PROCEDURE _ssl_add_idx;

-- 5. Retire the redundant new log table. All readers + the writer middleware
--    switch to sap_sync_logs in this same migration cycle.
DROP TABLE IF EXISTS integration_transactions;
