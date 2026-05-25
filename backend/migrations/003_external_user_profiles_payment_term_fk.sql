-- Link Payment Terms to BP Master.
--
-- Spec §3.1 says BP Master accepts `payment_term_name` (or alias `payment_terms`),
-- which must reference an existing Payment Terms record. Migration 002 created the
-- dedicated `payment_terms` table — this adds the FK column on the BP master side
-- so each BP can point at the payment-terms row it inherits.
--
-- Safe to re-run: column-add is wrapped in an existence check, FK is named so a
-- re-apply will fail loudly rather than create a duplicate.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name   = 'external_user_profiles'
     AND column_name  = 'payment_term_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE external_user_profiles ADD COLUMN payment_term_id BIGINT NULL',
  'SELECT "external_user_profiles.payment_term_id already exists, skipping" AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE()
     AND table_name   = 'external_user_profiles'
     AND constraint_name = 'fk_eup_payment_term'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE external_user_profiles
     ADD CONSTRAINT fk_eup_payment_term
       FOREIGN KEY (payment_term_id) REFERENCES payment_terms(id)
       ON DELETE SET NULL',
  'SELECT "fk_eup_payment_term already exists, skipping" AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name   = 'external_user_profiles'
     AND index_name   = 'idx_eup_payment_term'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_eup_payment_term ON external_user_profiles (payment_term_id)',
  'SELECT "idx_eup_payment_term already exists, skipping" AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
