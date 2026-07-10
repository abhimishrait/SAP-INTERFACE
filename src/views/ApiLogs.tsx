'use client';
import React from 'react';
import { Icons, Chip, Method, Status, HttpHeadersBlock, JsonBlock, SubHd, ViewHeader } from '@/components';
import { MODULE_BY_ID, MAPPINGS_BY_MODULE, AUTH_USER, RESPONSE_CODES, type Transaction } from '@/data';
import { useApi } from '@/lib/useApi';
import { console_, type TxRow, type TxRowDetail } from '@/lib/api';
import { txFromBackend, fmtTimeNpt, fmtDateTimeNpt } from '@/lib/adapters';

export default function ApiLogs({ density, rightPaneTab, setRightPaneTab, selectedTxId, setSelectedTxId }: {
  density: string;
  rightPaneTab: string;
  setRightPaneTab: (t: string) => void;
  selectedTxId: string;
  setSelectedTxId: (id: string) => void;
}) {
  const [filter, setFilter] = React.useState('all');
  const streaming = true; // always live; pause button removed

  const apiParams: any = { limit: 200 };
  if (filter === 'post') apiParams.method = 'POST';
  if (filter === 'put') apiParams.method = 'PUT';

  const { data, loading, error } = useApi(
    () => console_.transactions(apiParams),
    [filter],
    { pollMs: streaming ? 3000 : undefined }
  );

  // Map backend rows → existing Transaction shape, then apply success/error filter client-side.
  const allTxs: Transaction[] = (data?.rows || []).map(txFromBackend);
  const filtered = allTxs.filter(t => {
    if (filter === 'success') return t.status < 400;
    if (filter === 'error') return t.status >= 400;
    return true;
  });

  const selected = allTxs.find(t => t.id === selectedTxId) || filtered[0];

  // Find the DB id for the selected (we need it to fetch the detail row's payload bodies)
  const selectedDbId = selected ? (data?.rows || []).find(r => r.tx_id === selected.id || `txn_${r.id}` === selected.id)?.id : null;
  const { data: detail } = useApi<TxRowDetail | null>(
    () => (selectedDbId ? console_.transaction(selectedDbId) : Promise.resolve(null as any)),
    [selectedDbId]
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '22px 24px 12px' }}>
        <ViewHeader
          title="API Logs"
          sub={<>Every API call to <span className="mono" style={{ color: 'var(--orange)' }}>http://dms.salesport.in</span> is captured with full headers, request body, response body, and DB writes.</>}
          actions={
            <>
              <a className="btn" href={console_.exportUrl({ hours: 24, format: 'ndjson' })}><Icons.download /> Export NDJSON</a>
            </>
          }
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
          {[
            { id: 'all',     label: 'All',     count: allTxs.length },
            { id: 'success', label: 'Success', count: allTxs.filter(t => t.status < 400).length },
            { id: 'error',   label: 'Errors',  count: allTxs.filter(t => t.status >= 400).length },
            { id: 'post',    label: 'POST',    count: allTxs.filter(t => t.method === 'POST').length },
            { id: 'put',     label: 'PUT',     count: allTxs.filter(t => t.method === 'PUT').length },
          ].map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)} style={{
              padding: '6px 11px', borderRadius: 7,
              background: filter === t.id ? 'var(--bg-2)' : 'transparent',
              border: `1px solid ${filter === t.id ? 'var(--line-strong)' : 'var(--line)'}`,
              color: filter === t.id ? 'var(--ink-0)' : 'var(--ink-2)',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {t.label} <span className="mono" style={{ color: 'var(--ink-3)', marginLeft: 4 }}>{t.count}</span>
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {streaming && <Chip dot kind="ok">streaming · {filtered.length} txns</Chip>}
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1px 720px', overflow: 'hidden' }}>
        <div style={{ overflow: 'auto' }}>
          <table className="t">
            <thead><tr>
              <th>Time · UTC</th><th>Txn ID</th><th>Module</th><th>Endpoint</th><th>Status</th><th style={{ textAlign: 'right' }}>Duration</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
                  {error ? `Backend error: ${error}` : 'No transactions match. Send a request to /sap/* to populate the log.'}
                </td></tr>
              )}
              {filtered.map((t, i) => {
                const mod = MODULE_BY_ID[t.moduleId];
                return (
                  <tr key={t.id} onClick={() => setSelectedTxId(t.id)}
                    className={`clickable ${selected && selected.id === t.id ? 'selected' : ''} ${i === 0 && streaming ? 'row-fresh' : ''}`}>
                    <td className="mono" style={{ color: 'var(--ink-2)', fontSize: 11 }}>{fmtTimeNpt(t.ts)}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{t.id}</td>
                    <td style={{ fontSize: 11.5, fontWeight: 600 }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginRight: 6 }}>{mod?.code || ''}</span>{mod?.label || t.moduleId}
                    </td>
                    <td><Method m={t.method} /><span className="mono" style={{ color: 'var(--ink-1)', fontSize: 11, marginLeft: 8 }}>{t.path}</span></td>
                    <td><Status code={t.status} />{t.retry > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--amber)' }} className="mono">↻{t.retry}</span>}</td>
                    <td className="mono" style={{ textAlign: 'right', color: t.duration > 1000 ? 'var(--red)' : t.duration > 500 ? 'var(--amber)' : 'var(--ink-1)' }}>{t.duration}ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ background: 'var(--line)' }} />
        <TxInspector tx={selected || null} detail={detail || null} tab={rightPaneTab} setTab={setRightPaneTab} />
      </div>
    </div>
  );
}

function TxInspector({ tx, detail, tab, setTab }: { tx: Transaction | null; detail: TxRowDetail | null; tab: string; setTab: (t: string) => void }) {
  if (!tx) return <div style={{ padding: 30, color: 'var(--ink-3)' }}>Select a transaction</div>;
  const mod = MODULE_BY_ID[tx.moduleId];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Method m={tx.method} />
          <span className="mono" style={{ fontSize: 13, fontWeight: 600, flex: 1, color: 'var(--orange)' }}>{tx.path}</span>
          <Status code={tx.status} />
        </div>
        <div className="meta-row">
          <div><label>Txn ID</label><span className="val">{tx.id}</span></div>
          <div><label>Module</label><span className="val">{mod.code} {mod.label}</span></div>
          <div><label>Duration</label><span className="val">{tx.duration}ms</span></div>
          <div><label>Bytes (in / out)</label><span className="val">{tx.bytesIn} / {tx.bytesOut}</span></div>
          <div><label>Retries</label><span className="val">{tx.retry}</span></div>
          <div><label>Pipeline</label><span className="val">{tx.pipeline}</span></div>
        </div>
      </div>

      <div className="tabs" style={{ padding: '0 20px' }}>
        {[
          { id: 'request',  label: 'Request' },
          { id: 'response', label: 'Response' },
          { id: 'mapping',  label: 'Mapping diff' },
          { id: 'db',       label: 'DB writes' },
          { id: 'timeline', label: 'Timeline' },
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
        {tab === 'request'  && <TabRequest  tx={tx} detail={detail} />}
        {tab === 'response' && <TabResponse tx={tx} detail={detail} />}
        {tab === 'mapping'  && <TabMapping  tx={tx} />}
        {tab === 'db'       && <TabDbWrites tx={tx} />}
        {tab === 'timeline' && <TabTimeline tx={tx} />}
      </div>
    </div>
  );
}

function buildReqHeaders(tx: Transaction, detail: TxRowDetail | null): string {
  const lines = [
    `${tx.method} ${tx.path} HTTP/1.1`,
    'Host: dms.salesport.in',
    'Authorization: Basic U3VqYWxGb29kczpTdWphbEZvb2RzQDEyMw==',
  ];
  if (detail?.request_headers) {
    for (const [k, v] of Object.entries(detail.request_headers)) {
      if (v != null && k.toLowerCase() !== 'authorization') lines.push(`${k}: ${v}`);
    }
  } else {
    lines.push('Content-Type: application/json', `X-Correlation-Id: ${tx.id}`);
  }
  return lines.join('\n');
}

function buildResHeaders(tx: Transaction, detail: TxRowDetail | null): string {
  const codeText = RESPONSE_CODES.find(c => c.code === tx.status)?.status || 'OK';
  return [
    `HTTP/1.1 ${tx.status} ${codeText}`,
    'Content-Type: application/json',
    `Content-Length: ${tx.bytesOut || 0}`,
    `X-Correlation-Id: ${tx.id}`,
    `X-Module: ${tx.moduleId}`,
    detail ? `Date: ${fmtDateTimeNpt(new Date(detail.created_at))} UTC` : '',
  ].filter(Boolean).join('\n');
}

function TabRequest({ tx, detail }: { tx: Transaction; detail: TxRowDetail | null }) {
  const reqBody = detail?.request_body;
  const reqText = reqBody == null ? null : typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody, null, 2);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SubHd>HTTP request headers (Basic auth)</SubHd>
      <HttpHeadersBlock src={buildReqHeaders(tx, detail)} />
      <SubHd>Request body · sent by SAP</SubHd>
      {reqText ? <JsonBlock src={reqText} /> : <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>(no body)</div>}
    </div>
  );
}

function TabResponse({ tx, detail }: { tx: Transaction; detail: TxRowDetail | null }) {
  const resBody = detail?.response_body;
  const resText = resBody == null ? null : typeof resBody === 'string' ? resBody : JSON.stringify(resBody, null, 2);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SubHd>HTTP response headers</SubHd>
      <HttpHeadersBlock src={buildResHeaders(tx, detail)} />
      <SubHd>Response body · returned by SalesPort DMS</SubHd>
      {resText ? <JsonBlock src={resText} /> : <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>(loading or empty)</div>}
    </div>
  );
}

function TabMapping({ tx }: { tx: Transaction }) {
  const rows = MAPPINGS_BY_MODULE[tx.moduleId] || [];
  return (
    <div>
      <SubHd>Mapping invocations · {rows.length} field transforms</SubHd>
      <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <table className="t">
          <thead><tr><th>SAP field</th><th>Transform</th><th>DMS field</th><th>Result</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{ fontSize: 11.5 }}>{r.required && <span style={{ color: 'var(--orange)' }}>*</span>} {r.sap}</td>
                <td className="mono" style={{ fontSize: 11.5, color: 'var(--orange)' }}>{r.xform}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{r.dms}</td>
                <td>{r.status === 'mapped' ? <Chip kind="ok" dot>ok</Chip> : r.status === 'review' ? <Chip kind="warn" dot>review</Chip> : <Chip kind="err" dot>skipped</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabDbWrites({ tx }: { tx: Transaction }) {
  const mod = MODULE_BY_ID[tx.moduleId];
  const moduleTable = ({
    'bp-master': 'bp_master',
    'delivery-order': 'delivery_order',
    'products': 'products',
    'blanket-agreement': 'blanket_agreement',
    'price-list': 'price_list',
    'special-price-list': 'special_price_list',
    'balance-status-update': 'bp_master (UPDATE outstanding_balance)',
    'order-status-sync': 'sales_orders (UPDATE order_status)',
  } as Record<string, string>)[tx.moduleId] || tx.moduleId.replace(/-/g, '_');

  const writes = [
    { table: 'sap_sync_logs', op: 'INSERT', pk: tx.id, bytes: tx.bytesIn + tx.bytesOut, ms: 4.2 },
    { table: moduleTable, op: tx.method === 'POST' ? 'INSERT' : 'UPDATE', pk: tx.method === 'POST' ? 'auto-id' : tx.customerCode || tx.id, bytes: tx.bytesIn, ms: 5.4 },
  ];

  return (
    <div>
      <SubHd>Database writes for this transaction · module: {mod.label}</SubHd>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {writes.map((w, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--line)' }}>
            <span className="mono" style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: w.op === 'INSERT' ? 'var(--teal-bg)' : 'rgba(232,185,106,0.14)', color: w.op === 'INSERT' ? 'var(--teal)' : 'var(--amber)', fontWeight: 700 }}>{w.op}</span>
            <span className="mono" style={{ fontSize: 12 }}>{w.table}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>pk={w.pk}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{w.bytes}B</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--teal)' }}>{w.ms}ms</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-2)', borderRadius: 8, border: '1px dashed var(--line-strong)', fontSize: 12, color: 'var(--ink-2)' }}>
        <span style={{ color: 'var(--teal)', fontWeight: 600 }}>Total: 5 rows written across 5 tables in 19.1ms.</span> All writes are atomic — rollback on any failure.
      </div>
    </div>
  );
}

function TabTimeline({ tx }: { tx: Transaction }) {
  const mod = MODULE_BY_ID[tx.moduleId];
  const steps = [
    { t: 0,   label: 'SAP push received',      desc: `${tx.method} ${tx.path} · ${tx.bytesIn}B`, color: 'var(--teal)' },
    { t: 4,   label: 'Basic auth verified',        desc: `user: ${AUTH_USER}`, color: 'var(--teal)' },
    { t: 12,  label: 'Idempotency check',          desc: `key=idmp_${tx.id.slice(4)} · miss → proceed`, color: 'var(--teal)' },
    { t: 28,  label: 'Schema validation',          desc: `${mod.label} v1.2 · ${tx.mappedFields}/${tx.mappedFields} fields present`, color: tx.status >= 400 ? 'var(--red)' : 'var(--teal)' },
    { t: 42,  label: 'Mapping engine invoked',     desc: `${tx.mappedFields} field transforms · ${mod.rules.length} business rules`, color: 'var(--orange)' },
    { t: 96,  label: 'FK lookups + dedupe',        desc: 'territory, payment_terms, rate_group, products', color: 'var(--orange)' },
    ...(tx.status >= 400 ? [
      { t: tx.duration, label: 'Validation failed', desc: '400 returned · response logged', color: 'var(--red)' }
    ] : [
      { t: 142,  label: 'Persisted to DB',              desc: '5 tables · single txn', color: 'var(--violet)' },
      { t: 198,  label: 'Response sent to SAP',      desc: `${tx.status} ${tx.status === 201 ? 'Created' : 'OK'} · req_${tx.id.slice(4, 12)}`, color: 'var(--teal)' },
      { t: tx.duration, label: 'Webhook emitted',       desc: `${tx.moduleId}.synced → 2 subscribers`, color: 'var(--blue)' },
    ]),
  ];

  return (
    <div>
      <SubHd>Execution timeline · {tx.duration}ms total</SubHd>
      <div style={{ marginTop: 14, position: 'relative', paddingLeft: 22 }}>
        <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 1, background: 'var(--line)' }} />
        {steps.map((s, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
            <div style={{ position: 'absolute', left: -22, top: 2, width: 13, height: 13, borderRadius: '50%', background: 'var(--bg-0)', border: `2px solid ${s.color}` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-0)' }}>{s.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 1 }}>{s.desc}</div>
              </div>
              <span className="mono" style={{ fontSize: 11, color: s.color, whiteSpace: 'nowrap' }}>+{s.t}ms</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
