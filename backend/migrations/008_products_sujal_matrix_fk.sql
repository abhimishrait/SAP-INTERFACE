-- Spec §3.13: a product's `sujal_matrix` must reference an existing row in
-- `sujal_matrices`. Until now we validated the name at write time but threw
-- the resolved id away (see comment in src/sap/products.js insert block).
-- This migration adds the FK column so the link is actually persisted.
--
-- Idempotent: column + index + FK are each guarded by INFORMATION_SCHEMA checks.

DROP PROCEDURE IF EXISTS _add_products_sujal_matrix_fk;
DELIMITER $$
CREATE PROCEDURE _add_products_sujal_matrix_fk()
BEGIN
  DECLARE has_col INT DEFAULT 0;
  DECLARE has_idx INT DEFAULT 0;
  DECLARE has_fk  INT DEFAULT 0;

  SELECT COUNT(*) INTO has_col FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'sujal_matrix_id';
  IF has_col = 0 THEN
    ALTER TABLE products ADD COLUMN sujal_matrix_id BIGINT NULL AFTER tax_id;
  END IF;

  SELECT COUNT(*) INTO has_idx FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'products' AND index_name = 'idx_products_sujal_matrix';
  IF has_idx = 0 THEN
    ALTER TABLE products ADD KEY idx_products_sujal_matrix (sujal_matrix_id);
  END IF;

  SELECT COUNT(*) INTO has_fk FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = 'products'
      AND constraint_name = 'fk_products_sujal_matrix' AND constraint_type = 'FOREIGN KEY';
  IF has_fk = 0 THEN
    ALTER TABLE products
      ADD CONSTRAINT fk_products_sujal_matrix
        FOREIGN KEY (sujal_matrix_id) REFERENCES sujal_matrices(id) ON DELETE SET NULL;
  END IF;
END$$
DELIMITER ;

CALL _add_products_sujal_matrix_fk();
DROP PROCEDURE _add_products_sujal_matrix_fk;
