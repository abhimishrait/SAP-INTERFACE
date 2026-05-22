// Modules catalog view — all 16 modules at a glance

function Modules({ setSelectedModule, setView }) {
  const groups = [
    { label: 'Master Data', kinds: ['master'] },
    { label: 'Geo / Territory', kinds: ['geo'] },
    { label: 'Catalog', kinds: ['catalog'] },
    { label: 'Pricing', kinds: ['pricing'] },
    { label: 'Transactional', kinds: ['transaction'] },
  ];

  const open = (id) => { setSelectedModule(id); setView('mapping'); };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Header
        title="Module Catalog"
        sub={<>All 16 endpoints from the SAP B1 ↔ SalesPort spec v1.2 · base <span className="mono">http://dms.salesport.in</span></>}
        actions={
          <>
            <Chip kind="info" dot>14 master + 2 transactional</Chip>
            <button className="btn"><Icons.download /> Postman collection</button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <Stat label="Total endpoints" value="30" sub="14 POST + 14 PUT + 2 PUT-only" />
        <Stat label="Modules"          value="16" sub="13 master + 3 transactional" />
        <Stat label="Required fields"  value="78" sub="across all module schemas" />
        <Stat label="HTTP codes"       value="7"  sub="200/201/400/401/404/405/500" />
      </div>

      {groups.map(g => {
        const mods = MODULES.filter(m => g.kinds.includes(m.kind));
        return (
          <div key={g.label} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 4, height: 14, background: 'var(--orange)', borderRadius: 2 }} />
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink-0)', letterSpacing: '-0.01em' }}>{g.label}</h3>
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{mods.length}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--line)', marginLeft: 8 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {mods.map(m => <ModuleCard key={m.id} mod={m} onOpen={() => open(m.id)} />)}
            </div>
          </div>
        );
      })}

      {/* Status mapping + error scenarios */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginTop: 12 }}>
        <div className="card">
          <div className="hd">
            <div>
              <h3>Status field mapping</h3>
              <div className="sub">§4.1 — flexible input values normalized to active/inactive booleans.</div>
            </div>
          </div>
          <table className="t">
            <thead><tr><th>Input</th><th>Interpreted as</th><th>Description</th></tr></thead>
            <tbody>
              {STATUS_MAPPING.map(s => (
                <tr key={s.input}>
                  <td><span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>{s.input}</span></td>
                  <td>
                    <Chip kind={s.interpreted==='Active' || s.interpreted==='OPEN' ? 'ok' : s.interpreted==='Inactive' || s.interpreted==='CANCELLED' || s.interpreted==='CLOSED' ? 'muted' : 'info'} dot>
                      {s.interpreted}
                    </Chip>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--ink-2)' }}>{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="hd">
            <div>
              <h3>HTTP response codes</h3>
              <div className="sub">§2.6 — every API call returns one of these.</div>
            </div>
          </div>
          <div style={{ padding: 4 }}>
            {RESPONSE_CODES.map(r => (
              <div key={r.code} style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14,
                padding: '10px 14px', borderBottom: '1px solid var(--line)',
                alignItems: 'center',
              }}>
                <Status code={r.code} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-0)' }}>{r.status}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd">
          <div>
            <h3>Common error scenarios</h3>
            <div className="sub">§5.2 — sample validation responses returned by SalesPort DMS.</div>
          </div>
          <Chip kind="warn" dot>retry strategy: 3× exp. backoff on 500/timeout</Chip>
        </div>
        <table className="t">
          <thead><tr><th>Scenario</th><th>Code</th><th>Example response body</th></tr></thead>
          <tbody>
            {ERROR_SCENARIOS.map((e, i) => (
              <tr key={i}>
                <td style={{ fontSize: 12.5 }}>{e.scenario}</td>
                <td><Status code={e.code} /></td>
                <td className="mono" style={{ fontSize: 11.5, color: e.code >= 400 ? 'var(--red)' : 'var(--ink-1)' }}>{e.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModuleCard({ mod, onOpen }) {
  const fields = (MAPPINGS_BY_MODULE[mod.id] || []).length;
  return (
    <div
      onClick={onOpen}
      className="clickable"
      style={{
        padding: 16, background: 'var(--bg-1)', border: '1px solid var(--line)',
        borderRadius: 10, transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--line-warm)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--orange)', fontWeight: 700 }}>{mod.code}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-0)' }}>{mod.label}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{mod.desc}</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {mod.methods.map(m => <Method key={m} m={m} />)}
        </div>
      </div>

      <div style={{
        padding: 8, marginTop: 10, marginBottom: 10,
        background: 'var(--code-bg)', borderRadius: 6, border: '1px solid var(--line)',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
        color: 'var(--ink-1)', wordBreak: 'break-all',
      }}>
        <span style={{ color: 'var(--orange)' }}>{mod.path}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--ink-3)' }}>
        <span><span className="mono" style={{ color: 'var(--teal)' }}>{fields}</span> fields · <span className="mono" style={{ color: 'var(--ink-1)' }}>{mod.rules.length}</span> rules</span>
        <span className="mono">~{mod.rps}/s</span>
      </div>
    </div>
  );
}

Object.assign(window, { Modules });
