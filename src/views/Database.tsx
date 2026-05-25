'use client';
import React from 'react';
import { Icons, Chip, Stat, SubHd, ViewHeader } from '@/components';
import { useApi } from '@/lib/useApi';
import { console_ } from '@/lib/api';

export default function Database() {
  const { data: list, loading, error } = useApi(() => console_.dbTables(), [], { pollMs: 10000 });
  const tables = list?.rows || [];
  const [selected, setSelected] = React.useState<string>('integration_transactions');

  const totalRows = tables.reduce((s, t) => s + (Number(t.approx_rows) || 0), 0);
  const totalMb = tables.reduce((s, t) => s + (Number(t.size_mb) || 0), 0);

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <ViewHeader
        title="Database"
        sub="Live view of the abc_dms tables the integration touches — schemas + most recent rows."
        actions={
          <>
            {error ? <Chip kind="err" dot>backend offline</Chip> : <Chip kind="info" dot>MySQL · abc_dms</Chip>}
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Total rows"   value={totalRows.toLocaleString()}  sub={`across ${tables.length} integration tables`} />
        <Stat label="Storage used" value={`${totalMb.toFixed(1)} MB`} sub="tables shown here only" />
        <Stat label="Tables"       value={String(tables.length)} sub="exposed to the console" />
        <Stat label="Updated"      value={loading ? '…' : 'now'} sub="auto-refresh every 10s" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
        <div className="card">
          <div className="hd">
            <h3>Tables</h3>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{tables.length} tables</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {tables.map(tbl => (
              <div key={tbl.name} onClick={() => setSelected(tbl.name)} className="clickable"
                style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', background: selected === tbl.name ? 'var(--bg-2)' : 'transparent', borderLeft: `3px solid ${selected === tbl.name ? 'var(--orange)' : 'transparent'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <Icons.db style={{ color: selected === tbl.name ? 'var(--orange)' : 'var(--ink-3)' }} />
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-0)' }}>{tbl.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-2)', marginLeft: 26 }}>
                  <span className="mono">{(tbl.approx_rows ?? 0).toLocaleString()} rows</span>
                  <span>·</span>
                  <span className="mono">{(tbl.size_mb ?? 0).toFixed(2)} MB</span>
                </div>
              </div>
            ))}
            {tables.length === 0 && !loading && (
              <div style={{ padding: 18, color: 'var(--ink-3)', fontSize: 12 }}>{error || 'No tables found.'}</div>
            )}
          </div>
        </div>
        <TableDetail name={selected} />
      </div>
    </div>
  );
}

function TableDetail({ name }: { name: string }) {
  const { data, loading, error } = useApi(() => console_.dbTable(name), [name]);
  if (loading) return <div className="card"><div className="body" style={{ color: 'var(--ink-3)' }}>Loading {name}…</div></div>;
  if (error || !data) return <div className="card"><div className="body" style={{ color: 'var(--red)' }}>{error || 'Not found'}</div></div>;
  const columns = data.columns;
  const recent = data.recent || [];
  const colNames = columns.slice(0, 8).map(c => c.name); // limit columns shown

  return (
    <div className="card">
      <div className="hd">
        <div>
          <h3 style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{data.name}</h3>
          <div className="sub">{columns.length} columns · live preview from abc_dms</div>
        </div>
      </div>

      <div className="body">
        <SubHd>Schema</SubHd>
        <div style={{ marginTop: 8, background: 'var(--code-bg)', borderRadius: 8, border: '1px solid var(--line)', overflow: 'auto', maxHeight: 280 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11.5 }}>
            <tbody>
              {columns.map(c => (
                <tr key={c.name} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 12px', color: 'var(--ink-0)', width: '38%', fontWeight: 600 }}>
                    {c.k === 'PRI' && <span style={{ color: 'var(--orange)', marginRight: 6 }}>PK</span>}
                    {c.k === 'UNI' && <span style={{ color: 'var(--violet)', marginRight: 6 }}>UQ</span>}
                    {c.name}
                  </td>
                  <td style={{ padding: '6px 12px', color: 'var(--teal)' }}>
                    {c.type} {c.nullable === 'NO' ? <span style={{ color: 'var(--ink-3)' }}>NOT NULL</span> : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16 }}>
          <SubHd>Recent rows ({recent.length})</SubHd>
          <div style={{ marginTop: 8, background: 'var(--code-bg)', borderRadius: 8, border: '1px solid var(--line)', overflow: 'auto', maxHeight: 300 }}>
            {recent.length === 0 ? (
              <div style={{ padding: 14, color: 'var(--ink-3)', fontSize: 12 }}>Table is empty.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11 }}>
                <thead>
                  <tr>
                    {colNames.map(k => (
                      <th key={k} style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--line)' }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                      {colNames.map((k, j) => {
                        const v = r[k];
                        const str = v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 60);
                        return (
                          <td key={j} style={{ padding: '6px 12px', color: j === 0 ? 'var(--orange)' : 'var(--ink-1)', whiteSpace: 'nowrap' }}>{str}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
