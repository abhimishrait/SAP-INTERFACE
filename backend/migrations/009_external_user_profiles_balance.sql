-- Spec §3.15 Balance Status Update — SAP pushes a BP's outstanding balance.
-- We store it directly on the BP row (last-value-wins). If history becomes
-- required later, switch to a bp_balances table; existing writes then read
-- the current column and replay-insert to seed the new table.
--
-- Applied via node runner (scripts/run-migration.js or a one-off) because
-- MySQL doesn't support `ADD COLUMN IF NOT EXISTS`. Statements below are the
-- non-idempotent form for reference; the runner guards each with an
-- INFORMATION_SCHEMA lookup.

ALTER TABLE external_user_profiles
  ADD COLUMN outstanding_balance   DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER cost_center_code;

ALTER TABLE external_user_profiles
  ADD COLUMN balance_updated_at    DATETIME(6) NULL AFTER outstanding_balance;

ALTER TABLE external_user_profiles
  ADD COLUMN balance_updated_by_id BIGINT NULL AFTER balance_updated_at;

ALTER TABLE external_user_profiles
  ADD INDEX idx_eup_balance_updated_by (balance_updated_by_id);

ALTER TABLE external_user_profiles
  ADD CONSTRAINT fk_eup_balance_updated_by
    FOREIGN KEY (balance_updated_by_id) REFERENCES users(id) ON DELETE SET NULL;
