'use client';
import React from 'react';
import { Icons, Chip, Method, Status, Stat, Sparkline, BarChart, ViewHeader } from '@/components';
import { MODULE_BY_ID } from '@/data';
import { useApi } from '@/lib/useApi';
import { console_ } from '@/lib/api';
import { txFromBackend, fmtTimeNpt } from '@/lib/adapters';

export default function Overview({ flowAnim, density }: { flowAnim: boolean; density: string }) {
  const { data, loading, error } = useApi(() => console_.overview(), [], { pollMs: 5000 });
  const { data: vol } = useApi(() => console_.volume(30, 48), [], { pollMs: 5000 });
  const { data: mods } = useApi(() => console_.modulesStats(), [], { pollMs: 5000 });
  const recent = (data?.recent || []).map(txFromBackend).slice(0, 8);
  const totals = data?.totals;
  const volBars = vol?.data.map(b => b.post) || [];
  const volPuts = vol?.data.map(b => b.put) || [];
  const modHealth = (mods?.rows || [])
    .map(m => {
      const calls = Number(m.calls_24h) || 0;
      const errs = Number(m.errors_24h) || 0;
      const rate = calls > 0 ? 100 - (errs / calls) * 100 : null;
      return { id: m.module_id, calls, errs, rate, mod: MODULE_BY_ID[m.module_id] };
    })
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 6);
  const fmt = (n?: number | null) => (n == null ? '—' : n.toLocaleString());
  const successRate = totals && totals.calls > 0
    ? ((totals.ok / totals.calls) * 100).toFixed(2) + '%'
    : '—';

  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!flowAnim) return;
    const id = setInterval(() => setTick(t => t + 1), 1400);
    return () => clearInterval(id);
  }, [flowAnim]);

  return (
    <div style={{ padding: density === 'compact' ? 18 : 24, overflow: 'auto', height: '100%' }}>
      <ViewHeader
        title="Integration Overview"
        sub="Real-time view of SAP Business One → SalesPort DMS push pipeline · 16 modules · v1.2"
        actions={
          <>
            {error ? <Chip kind="err" dot>backend offline</Chip> : <Chip kind="ok" dot>live · {loading ? 'loading' : 'connected'}</Chip>}
            <a className="btn" href={console_.exportUrl({ hours: 24, format: 'xlsx' })}><Icons.download /> Export 24h Excel</a>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Requests · 24h"   value={fmt(totals?.calls)} sub="last 24 hours" icon={<Sparkline seed={2} stroke="var(--teal)" w={88} h={28} />} />
        <Stat label="Success rate"     value={successRate} accent="var(--teal)" sub={`${fmt(totals?.errors)} errored`} />
        <Stat label="Avg latency"      value={totals?.avg_ms ? `${Math.round(totals.avg_ms)}ms` : '—'} sub="across all 16 modules" />
        <Stat label="Last call · UTC"  value={totals?.latest ? fmtTimeNpt(new Date(totals.latest)) : '—'} sub={data?.by_module.length ? `${data.by_module.length} modules active` : 'no traffic yet'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 20 }}>
        <div className="card">
          <div className="hd">
            <div>
              <h3>Request volume · last 48 buckets (30 min each)</h3>
              <div className="sub">Inbound from SAP — 16 module endpoints combined</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, background: 'var(--teal)', borderRadius: 2 }} /> POST (create)</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, background: 'var(--orange)', borderRadius: 2 }} /> PUT (update)</span>
            </div>
          </div>
          <div className="body">
            <BarChart h={140} color="var(--teal)" bars={volBars} accent={volPuts} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
              <span>24h ago</span><span>18h</span><span>12h</span><span>6h</span><span>now · UTC</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="hd"><h3>Module health · top {modHealth.length || 6}</h3></div>
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {modHealth.length === 0 && (
              <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>No traffic in the last 24h.</div>
            )}
            {modHealth.map(m => (
              <PipelineRow
                key={m.id}
                name={m.id}
                rate={m.rate == null ? '—' : m.rate.toFixed(2) + '%'}
                reqs={m.calls.toLocaleString()}
                status={m.rate == null || m.rate >= 99 ? 'ok' : m.rate >= 95 ? 'warn' : 'err'}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="hd">
          <div>
            <h3>Recent transactions</h3>
            <div className="sub">Every API call is persisted to <span className="mono">sap_sync_logs</span> with full request + response bodies.</div>
          </div>
          <Chip dot kind="ok">streaming</Chip>
        </div>
        <table className="t">
          <thead><tr>
            <th>Time · UTC</th><th>Txn ID</th><th>Module</th><th>Endpoint</th><th>Status</th><th>Customer</th><th style={{ textAlign: 'right' }}>Duration</th>
          </tr></thead>
          <tbody>
            {recent.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
                No transactions yet. POST to <span className="mono">/sap/...</span> to see live data here.
              </td></tr>
            )}
            {recent.map((tx, i) => {
              const mod = MODULE_BY_ID[tx.moduleId];
              return (
                <tr key={tx.id} className={i === 0 && flowAnim ? 'row-fresh' : ''}>
                  <td className="mono" style={{ color: 'var(--ink-2)', fontSize: 11 }}>{fmtTimeNpt(tx.ts)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{tx.id}</td>
                  <td style={{ fontSize: 11.5, fontWeight: 600 }}>{mod?.label || tx.moduleId}</td>
                  <td><Method m={tx.method} /> <span className="mono" style={{ color: 'var(--ink-1)', fontSize: 11 }}>{tx.path}</span></td>
                  <td><Status code={tx.status} /></td>
                  <td className="mono" style={{ color: 'var(--ink-1)', fontSize: 11 }}>{tx.customerCode || tx.distributor || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', color: tx.duration > 800 ? 'var(--amber)' : 'var(--ink-1)' }}>{tx.duration}ms</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PipelineRow({ name, rate, reqs, status }: { name: string; rate: string; reqs: string; status: string }) {
  const pct = Number.isFinite(parseFloat(rate)) ? parseFloat(rate) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-0)' }}>{name}</span>
          <span style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{reqs}</span>
        </div>
        <div className="prog">
          <div style={{ width: `${pct}%`, background: status === 'ok' ? 'var(--teal)' : status === 'warn' ? 'var(--amber)' : 'var(--red)' }} />
        </div>
      </div>
      <div className="mono" style={{ width: 56, textAlign: 'right', fontSize: 11, color: status === 'err' ? 'var(--red)' : 'var(--ink-1)' }}>{rate}</div>
    </div>
  );
}

