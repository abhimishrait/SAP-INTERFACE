'use client';
import React from 'react';
import { Icons, Chip, Method, Status, PulseDot, Stat, Sparkline, BarChart, ViewHeader } from '@/components';
import { TRANSACTIONS, MODULE_BY_ID, iso, AUTH_USER } from '@/data';

export default function Overview({ flowAnim, density }: { flowAnim: boolean; density: string }) {
  const recent = TRANSACTIONS.slice(0, 8);
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
            <Chip kind="ok" dot>All connectors healthy</Chip>
            <button className="btn"><Icons.download /> Export 24h report</button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Requests · 24h"   value="42,318" trend="+8.4%" sub="vs prior 24h" icon={<Sparkline seed={2} stroke="var(--teal)" w={88} h={28} />} />
        <Stat label="Success rate"     value="98.91%" accent="var(--teal)" trend="+0.12%" sub="461 errored · 14 in DLQ" />
        <Stat label="p50 / p95 latency" value="218ms" sub={<span><span className="mono">p95</span> 1.42s · <span className="mono">p99</span> 3.81s</span>} />
        <Stat label="Records persisted" value="89,201" trend="+5.1%" sub="across 8 tables · 1.2GB written" />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="hd">
          <div>
            <h3>Live pipeline · SAP Business One → SalesPort DMS</h3>
            <div className="sub">Push-based architecture · POST creates, PUT updates · HTTP Basic auth · TLS 1.2+</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Chip dot kind="ok">{flowAnim ? 'Flowing' : 'Paused'}</Chip>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>tick {String(tick).padStart(4, '0')}</span>
          </div>
        </div>
        <div className="body" style={{ padding: 0 }}>
          <FlowDiagram animate={flowAnim} tick={tick} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 20 }}>
        <div className="card">
          <div className="hd">
            <div>
              <h3>Request volume · last 48 buckets (30 min each)</h3>
              <div className="sub">Inbound from SAP B1 — 16 module endpoints combined</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, background: 'var(--teal)', borderRadius: 2 }} /> POST (create)</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, background: 'var(--orange)', borderRadius: 2 }} /> PUT (update)</span>
            </div>
          </div>
          <div className="body">
            <BarChart seed={3} h={140} color="var(--teal)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
              <span>11:42 yest.</span><span>17:30</span><span>23:00</span><span>04:30</span><span>11:42 today</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="hd"><h3>Module health · top 6</h3></div>
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PipelineRow name="delivery-order"        rate="99.41%" reqs="38,902" status="ok" />
            <PipelineRow name="balance-status-update" rate="99.84%" reqs="14,221" status="ok" />
            <PipelineRow name="order-status-sync"     rate="99.12%" reqs="6,801"  status="ok" />
            <PipelineRow name="bp-master"             rate="99.98%" reqs="2,104"  status="ok" />
            <PipelineRow name="price-list"            rate="98.42%" reqs="9,418"  status="warn" />
            <PipelineRow name="products"              rate="97.12%" reqs="1,288"  status="warn" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="hd">
          <div>
            <h3>Recent transactions</h3>
            <div className="sub">Every API call is persisted to <span className="mono">integration_transactions</span> with full request + response bodies.</div>
          </div>
          <Chip dot kind="ok">streaming</Chip>
        </div>
        <table className="t">
          <thead><tr>
            <th>Timestamp</th><th>Txn ID</th><th>Module</th><th>Endpoint</th><th>Status</th><th>Mapped</th><th style={{ textAlign: 'right' }}>Duration</th>
          </tr></thead>
          <tbody>
            {recent.map((tx, i) => {
              const mod = MODULE_BY_ID[tx.moduleId];
              return (
                <tr key={tx.id} className={i === 0 && flowAnim ? 'row-fresh' : ''}>
                  <td className="mono" style={{ color: 'var(--ink-2)', fontSize: 11 }}>{iso(tx.ts).slice(11, 19)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{tx.id}</td>
                  <td style={{ fontSize: 11.5, fontWeight: 600 }}>{mod.label}</td>
                  <td><Method m={tx.method} /> <span className="mono" style={{ color: 'var(--ink-1)', fontSize: 11 }}>{tx.path}</span></td>
                  <td><Status code={tx.status} /></td>
                  <td className="mono" style={{ color: 'var(--ink-1)', fontSize: 11 }}>{tx.mappedFields} fields</td>
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
  const pct = parseFloat(rate);
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

function FlowDiagram({ animate, tick }: { animate: boolean; tick: number }) {
  const sapNodes = [
    { label: 'BP Master',       rate: '4/s',   icon: 'BP' },
    { label: 'Delivery Order',  rate: '12/s',  icon: 'DO' },
    { label: 'Balance Update',  rate: '2.4/s', icon: 'BL' },
    { label: 'Order Status',    rate: '1.6/s', icon: 'OS' },
  ];
  const dmsNodes = [
    { label: 'distributors',    rate: '4/s',   icon: 'DS' },
    { label: 'delivery_orders', rate: '12/s',  icon: 'DO' },
    { label: 'bp_balance',      rate: '2.4/s', icon: 'BL' },
    { label: 'sales_orders',    rate: '1.6/s', icon: 'SO' },
  ];
  const dbs = ['integration_transactions', 'field_map_audit', 'sync_jobs', 'idempotency_keys'];

  return (
    <div className="grid-bg" style={{ padding: '28px 18px 24px', position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', gap: 0, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 2 }}>
          <ColumnHeader label="SAP Business One" tag="SOURCE · push" color="var(--teal)" />
          {sapNodes.map((n, i) => (
            <FlowNode key={n.label} {...n} side="sap" active={animate && (tick + i) % 4 === 0} />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <svg width="100%" height="100%" viewBox="0 0 360 360" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
            {[60, 130, 200, 270].map((y, i) => (
              <path key={`l${i}`} d={`M 0 ${y} C 60 ${y}, 100 180, 160 180`}
                stroke={animate ? 'var(--teal)' : 'var(--teal-dim)'} strokeWidth="1.5" fill="none" opacity="0.55"
                className={animate ? 'flow-line' : ''} />
            ))}
            {[60, 130, 200, 270].map((y, i) => (
              <path key={`r${i}`} d={`M 200 180 C 260 180, 300 ${y}, 360 ${y}`}
                stroke={animate ? 'var(--orange)' : '#a76d2e'} strokeWidth="1.5" fill="none" opacity="0.55"
                className={animate ? 'flow-line' : ''} style={{ animationDirection: 'reverse' }} />
            ))}
          </svg>
          <TransformEngine animate={animate} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 2 }}>
          <ColumnHeader label="SalesPort DMS" tag="TARGET · v1.2" color="var(--orange)" align="right" />
          {dmsNodes.map((n, i) => (
            <FlowNode key={n.label} {...n} side="dms" active={animate && (tick + i + 2) % 4 === 0} />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28, padding: '14px 18px', background: 'var(--bg-2)', borderRadius: 10, border: '1px dashed var(--line-strong)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icons.db style={{ color: 'var(--violet)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Persisted to</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {dbs.map(d => (
            <span key={d} className="mono" style={{ fontSize: 11, padding: '4px 8px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 5, color: 'var(--ink-1)' }}>{d}</span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>Every request + response stored · 90d retention · auto-archive to S3 cold</span>
      </div>
    </div>
  );
}

function ColumnHeader({ label, tag, color, align }: { label: string; tag: string; color: string; align?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: align === 'right' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.1em' }}>{tag}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 16, background: color, borderRadius: 2 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-0)' }}>{label}</span>
      </div>
    </div>
  );
}

function FlowNode({ label, rate, icon, side, active }: { label: string; rate: string; icon: string; side: string; active: boolean }) {
  const c = side === 'sap' ? 'var(--teal)' : 'var(--orange)';
  return (
    <div style={{ padding: '10px 12px', background: active ? (side === 'sap' ? 'var(--teal-bg)' : 'var(--orange-bg)') : 'var(--bg-2)', border: `1px solid ${active ? c : 'var(--line)'}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.3s' }}>
      <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--bg-3)', border: `1px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 10, fontWeight: 700, color: c }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)' }}>{label}</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>{rate}</div>
      </div>
      {active && <span className="pulse-dot" style={{ background: c, width: 6, height: 6 }} />}
    </div>
  );
}

function TransformEngine({ animate }: { animate: boolean }) {
  return (
    <div style={{ width: 200, padding: '18px 16px', background: 'var(--bg-2)', border: '1px solid var(--line-warm)', borderRadius: 12, position: 'relative', zIndex: 3, boxShadow: '0 0 0 4px rgba(245,155,61,0.04), 0 12px 32px rgba(0,0,0,0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.1em' }}>TRANSFORM</span>
        {animate && <PulseDot color="var(--orange)" />}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.01em' }}>Mapping Engine</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { label: 'Verify Basic auth', highlight: false },
          { label: 'Validate schema', highlight: false },
          { label: 'Map fields', highlight: true },
          { label: 'FK lookups + dedupe', highlight: false },
          { label: 'Idempotency check', highlight: false },
          { label: 'Persist + audit', highlight: false },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: s.highlight ? 'var(--ink-0)' : 'var(--ink-1)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.highlight ? 'var(--orange)' : 'var(--teal-dim)' }} />
            {s.label}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono), monospace', color: 'var(--ink-2)' }}>
        <span>spec v1.2</span>
        <span style={{ color: 'var(--teal)' }}>218ms p50</span>
      </div>
    </div>
  );
}
