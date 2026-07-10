// Convert backend rows into the shape the existing view components expect.
// Keeping this in one place avoids littering each view with field-name translations.
import type { TxRow, RecentTxRow, TxRowDetail } from './api';
import type { Transaction } from '@/data';

export function txFromBackend(row: TxRow | RecentTxRow | TxRowDetail): Transaction {
  const isFullRow = 'bytes_in' in row;
  const r = row as TxRow;
  return {
    id: row.tx_id || `txn_${row.id}`,
    ts: new Date(row.created_at),
    method: row.method,
    moduleId: row.module_id,
    path: row.path,
    status: row.status_code,
    duration: row.duration_ms,
    bytesIn: isFullRow ? r.bytes_in : 0,
    bytesOut: isFullRow ? r.bytes_out : 0,
    retry: isFullRow ? r.retry_count : 0,
    mappedFields: 0,                 // unused on listing rows; FieldMapping view supplies its own
    distributor: row.distributor_name || '—',
    customerCode: row.customer_code || '',
    doNumber: row.doc_number || '',
    soNumber: row.doc_number || '',
    pipeline: isFullRow
      ? r.pipeline_stage
      : (row.status_code >= 500 ? 'failed' : row.status_code >= 400 ? 'rejected' : 'completed'),
  };
}

// Local "x seconds ago" helper using real wall-clock time, since backend rows
// are now real timestamps (not the mock NOW from the original demo data).
export function relTimeNow(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

// Show all log timestamps in UTC.
export function fmtTimeNpt(d: Date): string {
  return d.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false });
}

export function fmtDateTimeNpt(d: Date): string {
  return d.toLocaleString('sv-SE', { timeZone: 'UTC', hour12: false });
}
