-- Add `employee_code` to users so the SAP BP-master payload can map
-- `reporting_to_emp` (employee code) to an internal user's id.
--
-- Nullable + unique-when-not-null so existing rows (which lack codes)
-- aren't affected. The SAP integration will populate this column for
-- the internal employees that distributors report to.
--
-- Idempotent via information_schema lookups and PREPARE/EXECUTE so the
-- migration runner (which doesn't understand `DELIMITER`) can apply it.

SET @col_exists := (SELECT COUNT(*) FROM information_schema.columns
                    WHERE table_schema = DATABASE()
                      AND table_name   = 'users'
                      AND column_name  = 'employee_code');
SET @sql := IF(@col_exists = 0,
               'ALTER TABLE users ADD COLUMN employee_code VARCHAR(50) NULL AFTER country_code',
               'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.statistics
                    WHERE table_schema = DATABASE()
                      AND table_name   = 'users'
                      AND index_name   = 'uq_users_employee_code');
SET @sql := IF(@idx_exists = 0,
               'ALTER TABLE users ADD UNIQUE KEY uq_users_employee_code (employee_code)',
               'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
