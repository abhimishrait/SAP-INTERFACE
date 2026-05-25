# Pending decisions / schema gaps

Items that need follow-up before the relevant SAP endpoint can be fully wired.
The endpoint stubs still accept requests and log them to `integration_transactions`,
but they return **501 Not Implemented** until resolved.

---

## ~~Q3 — Payment Terms `term_days`~~ ✅ resolved

Resolved by migration `002_blanket_agreement_and_payment_terms.sql` —
created dedicated `payment_terms` table with native `term_days` column.
See `DB_CHANGES.md` section 1.2.

---

## Q4 — Balance Status Update outstanding_balance (module 3.15)

**Spec endpoint:** `PUT /sap/balance-status-update/` with body `{ "party_code": "...", "updated_amount": 1500.5 }`
**Your table:** `external_user_profiles` has no `outstanding_balance` column.

**Options:**
- (a) `ALTER TABLE external_user_profiles ADD COLUMN outstanding_balance DECIMAL(14,2) NOT NULL DEFAULT 0;`
       Single source of truth, simple. Loses history.
- (b) Create a new table `bp_balances (id, party_id FK, balance, set_at, set_via)`. Keeps history,
       lets you graph balance over time. **Recommended.**

**Migration sketch for option (b):**

```sql
CREATE TABLE bp_balances (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  party_id BIGINT NOT NULL,
  balance DECIMAL(14,2) NOT NULL,
  set_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  set_via VARCHAR(20) NOT NULL DEFAULT 'sap-sync',
  CONSTRAINT fk_bp_balances_party
    FOREIGN KEY (party_id) REFERENCES external_user_profiles(id) ON DELETE CASCADE,
  KEY idx_bp_balances_party_set_at (party_id, set_at DESC)
);
```

Until this is decided, `PUT /sap/balance-status-update/` returns **501**.

---

## Q3-bis — Payment Terms `term_days` quick fix path

If you want to enable it without picking a long-term solution, run:

```sql
ALTER TABLE payment_preferences ADD COLUMN term_days SMALLINT UNSIGNED NULL;
```

Then set `PAYMENT_TERMS_HAS_TERM_DAYS=1` in `.env` and restart.
