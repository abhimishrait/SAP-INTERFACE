// Typed fetch client for the Express backend.
// Override the base URL with NEXT_PUBLIC_API_BASE in .env.local.

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

// SAP-facing endpoints require Basic auth (same creds as the spec).
const SAP_AUTH = 'Basic ' + (typeof window === 'undefined'
  ? Buffer.from('SujalFoods:SujalFoods@123').toString('base64')
  : btoa('SujalFoods:SujalFoods@123'));

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    throw new ApiError(res.status, body, `${res.status} ${res.statusText}`);
  }
  return body as T;
}

// ---- Console APIs ----

export const console_ = {
  overview: () => request<{
    window: string;
    totals: { calls: number; ok: number; errors: number; avg_ms: number; latest: string | null };
    by_module: Array<{ module_id: string; calls: number; errs: number }>;
    recent: Array<RecentTxRow>;
  }>('/console/overview'),

  transactions: (params: { limit?: number; offset?: number; module?: string; method?: string; status?: number; q?: string } = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
    return request<{ total: number; limit: number; offset: number; rows: TxRow[] }>(
      `/console/transactions${qs.toString() ? '?' + qs : ''}`
    );
  },

  transaction: (id: number) => request<TxRowDetail>(`/console/transactions/${id}`),

  queue: () => request<{
    in_flight: Array<{ id: number; job_id: string; module_id: string; method: string; path: string; pipeline_stage: string; created_at: string; duration_ms: number }>;
    recent: Array<{ id: number; job_id: string; module_id: string; method: string; path: string; pipeline_stage: string; status_code: number; error_message: string | null; duration_ms: number; created_at: string }>;
  }>('/console/queue'),

  modulesStats: () => request<{
    rows: Array<{ module_id: string; calls_24h: number; errors_24h: number; avg_ms: number; last_seen: string | null }>;
  }>('/console/modules/stats'),

  moduleRecent: (moduleId: string) => request<{
    module_id: string;
    rows: Array<{ id: number; tx_id: string; method: string; path: string; status_code: number; duration_ms: number; customer_code: string | null; doc_number: string | null; distributor_name: string | null; created_at: string }>;
  }>(`/console/modules/${moduleId}/recent`),

  dbTables: () => request<{
    rows: Array<{ name: string; approx_rows: number; size_mb: number; update_time: string | null }>;
  }>('/console/db/tables'),

  dbTable: (name: string) => request<{
    name: string;
    columns: Array<{ name: string; type: string; nullable: string; k: string; def: any; extra: string }>;
    recent: any[];
  }>(`/console/db/tables/${name}`),

  connections: () => request<{
    connections: Array<{ name: string; side: 'sap' | 'dms'; host: string; protocol: string; auth: string; status: 'healthy' | 'degraded' | 'down'; latency: number; error?: string | null }>;
  }>('/console/connections'),

  volume: (bucketMinutes = 30, buckets = 48) => request<{
    bucket_minutes: number;
    buckets: number;
    window_minutes: number;
    peak_total: number;
    data: Array<{ post: number; put: number; total: number }>;
  }>(`/console/volume?bucketMinutes=${bucketMinutes}&buckets=${buckets}`),

  // Returns a URL for the browser to navigate to / open in a new tab.
  // CSV downloads natively; no fetch+blob dance needed.
  exportUrl: (opts: { hours?: number; format?: 'xlsx' | 'csv' | 'ndjson'; module?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.hours)  qs.set('hours', String(opts.hours));
    if (opts.format) qs.set('format', opts.format);
    if (opts.module) qs.set('module', opts.module);
    return `${API_BASE}/console/export${qs.toString() ? '?' + qs : ''}`;
  },

  postmanUrl: () => `${API_BASE}/console/postman?base=${encodeURIComponent(API_BASE)}`,
};

// ---- SAP-facing call (used by ApiTester) ----

export async function sapCall(method: 'POST' | 'PUT', path: string, body: any, opts?: { user?: string; pass?: string }) {
  const auth =
    opts?.user && opts?.pass
      ? 'Basic ' + (typeof window === 'undefined'
          ? Buffer.from(`${opts.user}:${opts.pass}`).toString('base64')
          : btoa(`${opts.user}:${opts.pass}`))
      : SAP_AUTH;
  const start = performance.now();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return {
    status: res.status,
    statusText: res.statusText,
    body: parsed,
    ms: Math.round(performance.now() - start),
    size: text.length,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

// ---- Shared types ----

export interface RecentTxRow {
  id: number;
  tx_id: string;
  module_id: string;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  distributor_name: string | null;
  customer_code: string | null;
  doc_number: string | null;
  created_at: string;
}

export interface TxRow extends RecentTxRow {
  resource_id: string | null;
  pipeline_stage: string;
  error_message: string | null;
  bytes_in: number;
  bytes_out: number;
  retry_count: number;
}

export interface TxRowDetail extends TxRow {
  request_headers: any;
  request_body: any;
  response_body: any;
  remote_ip: string | null;
  user_agent: string | null;
  correlation_id: string;
}
