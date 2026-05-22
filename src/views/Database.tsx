'use client';
import React from 'react';
import { Icons, Chip, Stat, SubHd, ViewHeader } from '@/components';
import { DB_TABLES, TRANSACTIONS, iso } from '@/data';

export default function Database() {
  const [selected, setSelected] = React.useState('integration_transactions');
  const t = DB_TABLES.find(x => x.name === selected);

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <ViewHeader
        title="Database"
        sub="Every request, response, mapping invocation, and pipeline state-change is durably written."
        actions={
          <>
            <Chip kind="info" dot>PostgreSQL 16 · row-store</Chip>
            <button className="btn"><Icons.download /> Schema DDL</button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Total rows"   value="2.9M"  sub="across 8 tables" />
        <Stat label="Storage used" value="5.1 GB" sub="46% of 11GB quota" />
        <Stat label="Writes / sec" value="224"    sub="peak 412/s today" />
        <Stat label="Retention"    value="90d"    sub="auto-archive to S3 cold" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 14 }}>
        <div className="card">
          <div className="hd">
            <h3>Tables</h3>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{DB_TABLES.length} tables</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {DB_TABLES.map(tbl => (
              <div key={tbl.name} onClick={() => setSelected(tbl.name)} className="clickable"
                style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', background: selected === tbl.name ? 'var(--bg-2)' : 'transparent', borderLeft: `3px solid ${selected === tbl.name ? 'var(--orange)' : 'transparent'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <Icons.db style={{ color: selected === tbl.name ? 'var(--orange)' : 'var(--ink-3)' }} />
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-0)' }}>{tbl.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-2)', marginLeft: 26 }}>
                  <span className="mono">{tbl.rows.toLocaleString()} rows</span>
                  <span>·</span>
                  <span className="mono">{tbl.size}</span>
                  <span>·</span>
                  <span className="mono" style={{ color: 'var(--teal)' }}>{tbl.writes}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <TableDetail table={t || null} />
      </div>
    </div>
  );
}

const SCHEMAS: Record<string, { name: string; type: string }[]> = {
  integration_transactions: [
    { name: 'id', type: 'uuid PRIMARY KEY' },
    { name: 'txn_id', type: 'text UNIQUE NOT NULL' },
    { name: 'ts', type: 'timestamptz NOT NULL' },
    { name: 'module_id', type: 'text NOT NULL' },
    { name: 'method', type: "enum('POST','PUT')" },
    { name: 'endpoint', type: 'text' },
    { name: 'request_headers', type: 'jsonb' },
    { name: 'request_body', type: 'jsonb COMPRESSED' },
    { name: 'response_status', type: 'int2' },
    { name: 'response_headers', type: 'jsonb' },
    { name: 'response_body', type: 'jsonb COMPRESSED' },
    { name: 'duration_ms', type: 'int4' },
    { name: 'mapped_fields', type: 'int2' },
    { name: 'pipeline_state', type: 'text' },
    { name: 'retry_count', type: 'int2 DEFAULT 0' },
    { name: 'tenant_id', type: 'uuid FOREIGN KEY' },
    { name: 'created_at', type: 'timestamptz DEFAULT now()' },
  ],
  field_map_audit: [
    { name: 'id', type: 'uuid PRIMARY KEY' },
    { name: 'txn_id', type: 'text FOREIGN KEY' },
    { name: 'module_id', type: 'text' },
    { name: 'sap_field', type: 'text' },
    { name: 'dms_field', type: 'text' },
    { name: 'transform', type: 'text' },
    { name: 'input_value', type: 'jsonb' },
    { name: 'output_value', type: 'jsonb' },
    { name: 'confidence', type: 'numeric(5,2)' },
    { name: 'review_flag', type: 'boolean DEFAULT false' },
    { name: 'duration_us', type: 'int4' },
    { name: 'created_at', type: 'timestamptz DEFAULT now()' },
  ],
  sync_jobs: [
    { name: 'job_id', type: 'text PRIMARY KEY' },
    { name: 'name', type: 'text' },
    { name: 'stage', type: "enum('queued','mapping','validate','transform','persist','completed','failed')" },
    { name: 'priority', type: "enum('low','normal','high')" },
    { name: 'source', type: 'text' },
    { name: 'target', type: 'text' },
    { name: 'rows_total', type: 'int4' },
    { name: 'rows_done', type: 'int4' },
    { name: 'started_at', type: 'timestamptz' },
    { name: 'finished_at', type: 'timestamptz' },
    { name: 'error', type: 'text' },
  ],
  bp_master: [
    { name: 'id', type: 'serial PRIMARY KEY' },
    { name: 'customer_code', type: 'varchar(50) UNIQUE NOT NULL' },
    { name: 'store_name', type: 'varchar(255) NOT NULL' },
    { name: 'first_name', type: 'varchar(100) NOT NULL' },
    { name: 'last_name', type: 'varchar(100) NOT NULL' },
    { name: 'contact_country_code', type: 'varchar(5) NOT NULL' },
    { name: 'contact_number', type: 'varchar(20) UNIQUE NOT NULL' },
    { name: 'email_id', type: 'varchar(255) UNIQUE' },
    { name: 'bill_to_country_name', type: 'varchar(100) NOT NULL' },
    { name: 'vat_number', type: 'varchar(15) NOT NULL' },
    { name: 'greater_circle_id', type: 'int FOREIGN KEY' },
    { name: 'circle_id', type: 'int FOREIGN KEY' },
    { name: 'payment_terms_id', type: 'int FOREIGN KEY' },
    { name: 'outstanding_balance', type: 'numeric(15,2) DEFAULT 0' },
    { name: 'is_active', type: 'boolean NOT NULL DEFAULT true' },
    { name: 'created_at', type: 'timestamptz DEFAULT now()' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
  delivery_order: [
    { name: 'id', type: 'serial PRIMARY KEY' },
    { name: 'do_entry', type: 'varchar(50) UNIQUE NOT NULL' },
    { name: 'do_number', type: 'varchar(50) NOT NULL' },
    { name: 'sap_doc_entry', type: 'varchar(50) NOT NULL' },
    { name: 'do_date', type: 'date NOT NULL' },
    { name: 'amount', type: 'numeric(15,2) NOT NULL CHECK (amount >= 0)' },
    { name: 'tax', type: 'numeric(15,2) NOT NULL CHECK (tax >= 0)' },
    { name: 'total', type: 'numeric(15,2) NOT NULL CHECK (total >= 0)' },
    { name: 'order_status', type: "enum('OPEN','CLOSED','CANCELLED')" },
    { name: 'created_at', type: 'timestamptz DEFAULT now()' },
  ],
  products: [
    { name: 'id', type: 'serial PRIMARY KEY' },
    { name: 'variant_code', type: 'varchar(25) UNIQUE NOT NULL' },
    { name: 'product_name_id', type: 'int FOREIGN KEY' },
    { name: 'hsn_code', type: 'varchar(50) NOT NULL' },
    { name: 'mrp', type: 'numeric(15,2) NOT NULL' },
    { name: 'taxes', type: 'jsonb NOT NULL' },
    { name: 'is_active', type: 'boolean DEFAULT true' },
    { name: 'created_at', type: 'timestamptz DEFAULT now()' },
  ],
  idempotency_keys: [
    { name: 'key', type: 'text PRIMARY KEY' },
    { name: 'txn_id', type: 'text' },
    { name: 'expires_at', type: 'timestamptz' },
    { name: 'response_cache', type: 'jsonb' },
  ],
  dlq_messages: [
    { name: 'id', type: 'uuid PRIMARY KEY' },
    { name: 'original_txn', type: 'text' },
    { name: 'payload', type: 'jsonb' },
    { name: 'error_class', type: 'text' },
    { name: 'retry_count', type: 'int2' },
    { name: 'next_retry_at', type: 'timestamptz' },
    { name: 'created_at', type: 'timestamptz DEFAULT now()' },
  ],
};

function TableDetail({ table }: { table: typeof DB_TABLES[0] | null }) {
  if (!table) return null;
  const schema = SCHEMAS[table.name] || [];

  const sampleRows: Record<string, string | number>[] = (() => {
    if (table.name === 'integration_transactions') {
      return TRANSACTIONS.slice(0, 5).map(t => ({ txn_id: t.id, ts: iso(t.ts).slice(11, 19), module: t.moduleId, status: t.status, ms: t.duration }));
    }
    if (table.name === 'bp_master') {
      return [
        { customer_code: 'CUST1013', store_name: 'Param Dairy Store', vat: '123456789', active: 'true' },
        { customer_code: 'CUST1012', store_name: 'Sundar Traders',    vat: '198273410', active: 'true' },
        { customer_code: 'CUST1011', store_name: 'Krishna Distrib.',  vat: '227841092', active: 'true' },
      ];
    }
    if (table.name === 'delivery_order') {
      return [
        { do_number: 'DO-1248', amount: '5000.00', tax: '650.00', status: 'OPEN' },
        { do_number: 'DO-1247', amount: '12480.00', tax: '1622.40', status: 'CLOSED' },
        { do_number: 'DO-1246', amount: '3200.00', tax: '416.00', status: 'CANCELLED' },
      ];
    }
    return [{ id: 'sample_001', ts: '11:42:18', detail: '—' }, { id: 'sample_002', ts: '11:42:14', detail: '—' }];
  })();

  return (
    <div className="card">
      <div className="hd">
        <div>
          <h3 style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{table.name}</h3>
          <div className="sub">{table.desc}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{table.rows.toLocaleString()} rows</span>
          <span style={{ color: 'var(--ink-3)' }}>·</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--teal)' }}>{table.writes}</span>
        </div>
      </div>

      <div className="body">
        <SubHd>Schema</SubHd>
        <div style={{ marginTop: 8, background: 'var(--code-bg)', borderRadius: 8, border: '1px solid var(--line)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11.5 }}>
            <tbody>
              {schema.map(c => (
                <tr key={c.name} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '7px 12px', color: 'var(--ink-0)', width: '40%', fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--teal)' }}>{c.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16 }}>
          <SubHd>Recent rows · live tail</SubHd>
          <div style={{ marginTop: 8, background: 'var(--code-bg)', borderRadius: 8, border: '1px solid var(--line)', overflow: 'auto', maxHeight: 240 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11 }}>
              <thead>
                <tr>
                  {Object.keys(sampleRows[0] || {}).map(k => (
                    <th key={k} style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--line)' }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                    {Object.values(r).map((v, j) => (
                      <td key={j} style={{ padding: '6px 12px', color: j === 0 ? 'var(--orange)' : 'var(--ink-1)' }}>{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-2)', borderRadius: 8, border: '1px dashed var(--line-strong)', fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icons.check style={{ color: 'var(--teal)' }} />
          <span><span style={{ color: 'var(--teal)', fontWeight: 600 }}>Append-only.</span> Updates emit new rows; never destructive. Soft-delete via <span className="mono">deleted_at</span>.</span>
        </div>
      </div>
    </div>
  );
}
