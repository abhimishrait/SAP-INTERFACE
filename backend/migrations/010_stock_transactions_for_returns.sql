-- Support stock_out transactions from sales returns.
--
-- Today stock_transactions is only used by the DO stock-in flow, which
-- has order_id NOT NULL. Returns don't reference an SO, so we relax the
-- constraint and add a nullable sales_return_id back-link. The
-- per-line SAP CostingCode ("region") lives on stock_transaction_items
-- so different lines can be attributed to different cost centers.
--
-- Applied via node runner because MySQL 8 doesn't support
-- `ADD COLUMN IF NOT EXISTS`. Statements below are the non-idempotent
-- reference form; the actual apply script guards each ALTER with an
-- INFORMATION_SCHEMA lookup.

ALTER TABLE stock_transactions MODIFY COLUMN order_id BIGINT NULL;

ALTER TABLE stock_transactions
  ADD COLUMN sales_return_id BIGINT NULL AFTER order_id,
  ADD INDEX idx_stock_txn_sales_return (sales_return_id),
  ADD CONSTRAINT fk_stock_txn_sales_return
    FOREIGN KEY (sales_return_id) REFERENCES sales_returns(id) ON DELETE SET NULL;

ALTER TABLE stock_transaction_items
  ADD COLUMN costing_code VARCHAR(20) NULL AFTER uom;
