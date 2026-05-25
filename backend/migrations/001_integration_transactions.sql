-- Logs every SAP -> SalesPort API call across all 16 modules.
-- Powers the console's API Logs, Overview stats, and Sync Queue (recent) views.
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS integration_transactions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  correlation_id VARCHAR(64) NOT NULL,

  -- routing
  module_id VARCHAR(40) NOT NULL,        -- 'bp-master', 'delivery-order', etc.
  method VARCHAR(8) NOT NULL,            -- POST / PUT
  path VARCHAR(255) NOT NULL,            -- /sap/bp-master/ or /sap/bp-master/123/
  resource_id VARCHAR(64) NULL,          -- {id} from path on PUT, or BP code, etc.

  -- outcome
  status_code SMALLINT UNSIGNED NOT NULL,
  pipeline_stage VARCHAR(20) NOT NULL DEFAULT 'completed',
                                          -- queued / mapping / validate / transform / persist / completed / failed
  error_message TEXT NULL,

  -- telemetry
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  bytes_in INT UNSIGNED NOT NULL DEFAULT 0,
  bytes_out INT UNSIGNED NOT NULL DEFAULT 0,
  retry_count TINYINT UNSIGNED NOT NULL DEFAULT 0,

  -- payloads (JSON for easy querying)
  request_headers JSON NULL,
  request_body JSON NULL,
  response_body JSON NULL,

  -- caller context
  remote_ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,

  -- denormalized convenience columns used by the console
  distributor_name VARCHAR(255) NULL,
  customer_code VARCHAR(50) NULL,
  doc_number VARCHAR(50) NULL,           -- DO number, SO number, etc.

  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  KEY idx_intx_created_at (created_at DESC),
  KEY idx_intx_module_created (module_id, created_at DESC),
  KEY idx_intx_status (status_code),
  KEY idx_intx_correlation (correlation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
