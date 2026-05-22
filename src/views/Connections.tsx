'use client';
import React from 'react';
import { Icons, Chip, Method, Stat, Sparkline, SubHd, ViewHeader } from '@/components';
import { MODULES, CONNECTORS, AUTH_USER, AUTH_HEADER } from '@/data';

export default function Connections() {
  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <ViewHeader
        title="Connections"
        sub={<>Endpoint inventory and live health · base <span className="mono" style={{ color: 'var(--orange)' }}>http://dms.salesport.in</span> · HTTP Basic auth (TLS 1.2+)</>}
        actions={
          <>
            <button className="btn"><Icons.refresh /> Recheck all</button>
            <button className="btn primary">+ Add connector</button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <SidePanel side="sap" connectors={CONNECTORS.filter(c => c.side === 'sap')} />
        <SidePanel side="dms" connectors={CONNECTORS.filter(c => c.side === 'dms')} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd">
          <div>
            <h3>Authentication header</h3>
            <div className="sub">§2.1 — HTTP Basic with Base64-encoded credentials. Every request must include the Authorization header.</div>
          </div>
          <Chip kind="warn" dot>rotate every 24h</Chip>
        </div>
        <div className="body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <SubHd>Username</SubHd>
              <div className="mono" style={{ fontSize: 13, padding: '8px 12px', background: 'var(--code-bg)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--teal)' }}>{AUTH_USER}</div>
            </div>
            <div>
              <SubHd>Header</SubHd>
              <div className="mono" style={{ fontSize: 13, padding: '8px 12px', background: 'var(--code-bg)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--orange)', wordBreak: 'break-all' }}>
                Authorization: <span style={{ color: 'var(--ink-1)' }}>{AUTH_HEADER}</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-2)', borderRadius: 8, border: '1px dashed var(--line-strong)', fontSize: 12, color: 'var(--ink-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Icons.lock style={{ color: 'var(--orange)' }} />
              <span style={{ color: 'var(--ink-0)', fontWeight: 600 }}>Security guidelines (§2.5)</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Credentials must never be embedded in URLs or query parameters.</li>
              <li>Failed authentication returns HTTP 401 Unauthorized.</li>
              <li>All API requests must include the Authorization header with every call.</li>
              <li>Credentials should be stored securely and not hard-coded in client applications.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="hd"><h3>Endpoint health · live ping</h3></div>
        <table className="t">
          <thead><tr>
            <th>Module</th><th>POST</th><th>PUT</th><th>p50 latency</th><th>Calls · 1h</th><th>Error rate</th><th>Last sync</th>
          </tr></thead>
          <tbody>
            {MODULES.map(m => (
              <tr key={m.id}>
                <td><span className="mono" style={{ fontSize: 11, color: 'var(--orange)', marginRight: 6 }}>{m.code}</span> <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.label}</span></td>
                <td>{m.methods.includes('POST') ? <Method m="POST" /> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                <td>{m.methods.includes('PUT') ? <Method m="PUT" /> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{Math.round(80 + m.rps * 8)}ms</td>
                <td className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{Math.round(m.rps * 3600)}</td>
                <td className="mono" style={{ fontSize: 11.5, color: m.errRate > 1 ? 'var(--amber)' : 'var(--teal)' }}>{m.errRate.toFixed(2)}%</td>
                <td><Chip dot kind="ok">live</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SidePanel({ side, connectors }: { side: string; connectors: typeof CONNECTORS }) {
  const isSap = side === 'sap';
  const accent = isSap ? 'var(--teal)' : 'var(--orange)';
  return (
    <div className="card">
      <div className="hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 22, background: accent, borderRadius: 2 }} />
          <div>
            <h3>{isSap ? 'SAP Business One' : 'SalesPort DMS'}</h3>
            <div className="sub">{isSap ? 'Source · push-based' : 'Target · REST receiver'} · {connectors.length} connectors</div>
          </div>
        </div>
        <Chip dot kind={connectors.some(c => c.status === 'degraded') ? 'warn' : 'ok'}>
          {connectors.filter(c => c.status === 'healthy').length}/{connectors.length} healthy
        </Chip>
      </div>
      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {connectors.map(c => <ConnectorRow key={c.name} c={c} accent={accent} />)}
      </div>
    </div>
  );
}

function ConnectorRow({ c, accent }: { c: typeof CONNECTORS[0]; accent: string }) {
  const sk = c.status === 'healthy' ? 'ok' : c.status === 'degraded' ? 'warn' : 'err';
  return (
    <div style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)', flex: 1 }}>{c.name}</span>
        <span className="chip muted" style={{ fontSize: 10 }}>{c.env}</span>
        <Chip kind={sk as any} dot>{c.status}</Chip>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 11, color: accent }}>{c.protocol}</span>
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.host}</span>
      </div>
      <div style={{ display: 'flex', gap: 18 }}>
        <MiniStat label="auth" value={c.auth} />
        <MiniStat label="latency" value={`${c.latency}ms`} accent={c.latency > 500 ? 'var(--amber)' : 'var(--teal)'} />
        <MiniStat label="rate" value={`${c.rps}/s`} />
        <MiniStat label="last" value={c.lastSync} />
        <div style={{ flex: 1 }} />
        <Sparkline seed={c.name.length} stroke={c.status === 'degraded' ? 'var(--amber)' : accent} w={80} h={22} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div className="mono" style={{ fontSize: 11.5, color: accent || 'var(--ink-1)', marginTop: 1 }}>{value}</div>
    </div>
  );
}
