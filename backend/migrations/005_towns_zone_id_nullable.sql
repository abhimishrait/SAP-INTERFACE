-- Make towns.zone_id nullable so a Circle (3.4) can be created via SAP
-- without a parent zone. Zone assignment is performed manually in the DMS
-- UI afterwards, not derived from the inbound payload.
--
-- The FK to zones is preserved (NULL is allowed by InnoDB FKs).

ALTER TABLE towns
  MODIFY COLUMN zone_id BIGINT NULL;
