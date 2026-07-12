-- Spec §3.1 BP Master — SAP now pushes `credit_limit` alongside outstanding_balance.
-- Stored on the BP row (last-value-wins); mirrors 009's outstanding_balance shape.
-- Non-idempotent — run once per environment.

ALTER TABLE external_user_profiles
  ADD COLUMN credit_limit DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER outstanding_balance;
