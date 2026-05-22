// Field Mapping view — module-aware. Top tab strip lets user pick any of 16 modules.

function FieldMapping({ selectedModule, setSelectedModule, density }) {
  const moduleId = selectedModule || 'bp-master';
  const mod = MODULE_BY_ID[moduleId];
  const allMappings = MAPPINGS_BY_MODULE[moduleId] || [];

  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const [filter, setFilter] = React.useState('all');

  React.useEffect(() => { setSelectedIdx(0); setFilter('all'); }, [moduleId]);

  const filtered = allMappings.filter(f =>
    filter === 'all' ? true
    : filter === 'required' ? f.required
    : f.status === filter
  );
  const selected = filtered[selectedIdx] || filtered[0];

  const counts = {
    all: allMappings.length,
    required: allMappings.filter(f => f.required).length,
    review: allMappings.filter(f => f.status==='review').length,
    unmapped: allMappings.filter(f => f.status==='unmapped').length,
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Header
        title="Field Mapping"
        sub={<>SAP B1 source → SalesPort DMS target · every mapping invocation is recorded in <span className="mono">field_map_audit</span></>}
        actions={
          <>
            <button className="btn"><Icons.download /> Export schema</button>
            <button className="btn primary"><Icons.play /> Dry-run with sample</button>
          </>
        }
      />

      {/* MODULE SWITCHER — horizontally scrolling tabs */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 12,
        borderBottom: '1px solid var(--line)',
      }}>
        {MODULES.map(m => (
          <button key={m.id} onClick={() => setSelectedModule(m.id)} style={{
            padding: '8px 12px', borderRadius: 8,
            background: moduleId===m.id ? 'var(--bg-2)' : 'transparent',
            border: `1px solid ${moduleId===m.id ? 'var(--orange)' : 'var(--line)'}`,
            color: moduleId===m.id ? 'var(--ink-0)' : 'var(--ink-2)',
            fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{m.code}</span>
            {m.label}
            <span className="mono" style={{
              fontSize: 10, color: moduleId===m.id ? 'var(--orange)' : 'var(--ink-3)',
              background: moduleId===m.id ? 'var(--orange-bg)' : 'var(--bg-3)',
              padding: '1px 5px', borderRadius: 3,
            }}>{(MAPPINGS_BY_MODULE[m.id]||[]).length}</span>
          </button>
        ))}
      </div>

      {/* MODULE META BAR */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 16px', marginBottom: 14,
        background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 700 }}>{mod.code}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-0)' }}>{mod.label}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2 }}>{mod.desc}</div>
        </div>
        <div style={{ flex: 1 }} />
        <div className="meta-row">
          <div>
            <label>Methods</label>
            <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
              {mod.methods.map(m => <Method key={m} m={m} />)}
            </div>
          </div>
          <div>
            <label>Endpoint</label>
            <span className="val" style={{ color: 'var(--orange)' }}>{mod.path}</span>
          </div>
          <div>
            <label>Rate</label>
            <span className="val">~{mod.rps}/s</span>
          </div>
          <div>
            <label>Error rate</label>
            <span className="val" style={{ color: mod.errRate > 1 ? 'var(--amber)' : 'var(--teal)' }}>{mod.errRate.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { id: 'all',      label: `All`,       count: counts.all,      color: 'var(--ink-1)' },
          { id: 'required', label: `Required`,  count: counts.required, color: 'var(--orange)' },
          { id: 'mapped',   label: `Mapped`,    count: allMappings.filter(f=>f.status==='mapped').length, color: 'var(--teal)' },
          ...(counts.review ? [{ id: 'review', label: 'Review', count: counts.review, color: 'var(--amber)' }] : []),
        ].map(t => (
          <button key={t.id} onClick={() => { setFilter(t.id); setSelectedIdx(0); }} style={{
            padding: '7px 12px', borderRadius: 8,
            background: filter===t.id ? 'var(--bg-2)' : 'transparent',
            border: `1px solid ${filter===t.id ? 'var(--line-strong)' : 'var(--line)'}`,
            color: filter===t.id ? 'var(--ink-0)' : 'var(--ink-2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {t.label}
            <span className="mono" style={{ color: t.color, fontSize: 11 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* mapping canvas + inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14, marginBottom: 14 }}>
        <div className="card">
          <div className="hd">
            <h3>Visual mapping · {allMappings.length} fields</h3>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: 'var(--teal)', borderRadius: 2 }} /> mapped</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: 'var(--amber)', borderRadius: 2 }} /> review</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: 'var(--orange)', borderRadius: 2 }} /> required</span>
            </div>
          </div>
          <MappingCanvas
            mappings={filtered}
            selectedIdx={selectedIdx}
            setSelectedIdx={setSelectedIdx}
          />
        </div>

        {selected && <FieldInspector field={selected} moduleId={moduleId} />}
      </div>

      {/* Business rules + sample payloads */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card">
          <div className="hd">
            <h3>Business rules & validation</h3>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{mod.rules.length}</span>
          </div>
          <div className="body">
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {mod.rules.map((r, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5 }}>
                  <span className="mono" style={{ color: 'var(--orange)', flexShrink: 0, marginTop: 1 }}>§{(i+1).toString().padStart(2,'0')}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="hd">
            <h3>Sample request → response</h3>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>from spec v1.2</span>
          </div>
          <SamplePayloadView moduleId={moduleId} />
        </div>
      </div>
    </div>
  );
}

function SamplePayloadView({ moduleId }) {
  const [side, setSide] = React.useState('request');
  const sample = SAMPLE_PAYLOADS[moduleId];
  if (!sample) return <div className="body" style={{ color: 'var(--ink-3)' }}>(no sample available)</div>;
  return (
    <div className="body" style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['request', 'response'].map(s => (
          <button key={s} onClick={() => setSide(s)} style={{
            padding: '5px 10px', borderRadius: 6,
            background: side===s ? 'var(--bg-3)' : 'transparent',
            border: `1px solid ${side===s ? 'var(--line-strong)' : 'var(--line)'}`,
            color: side===s ? 'var(--ink-0)' : 'var(--ink-2)',
            fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>{s}</button>
        ))}
      </div>
      <JsonBlock src={sample[side]} style={{ maxHeight: 280 }} />
    </div>
  );
}

function MappingCanvas({ mappings, selectedIdx, setSelectedIdx }) {
  const rowH = 36;
  const topPad = 50;
  const sideW = 320;
  const totalH = Math.max(topPad + mappings.length * rowH + 20, 400);

  const statusColor = (s) => s==='mapped' ? 'var(--teal)' : s==='review' ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `${sideW}px 1fr ${sideW}px`, gap: 0, padding: '18px 0' }}>
      <div style={{ paddingLeft: 18 }}>
        <ColHeader2 label="SAP Business One" sub="source · REST POST/PUT" color="var(--teal-dim)" align="left" />
        <div style={{ marginTop: 16 }}>
          {mappings.map((f, i) => (
            <FieldRow
              key={f.sap+i}
              field={f.sap}
              type={f.sapType}
              desc={f.sapDesc}
              required={f.required}
              side="left"
              active={i === selectedIdx}
              onClick={() => setSelectedIdx(i)}
              statusColor={statusColor(f.status)}
            />
          ))}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <svg width="100%" height={totalH} style={{ display: 'block', position: 'absolute', inset: 0 }} preserveAspectRatio="none" viewBox={`0 0 200 ${totalH}`}>
          {mappings.map((f, i) => {
            const y = topPad + i*rowH + rowH/2 + 6;
            const c = statusColor(f.status);
            const isSel = i === selectedIdx;
            return (
              <g key={i}>
                <path
                  d={`M 0 ${y} C 60 ${y}, 140 ${y}, 200 ${y}`}
                  stroke={c}
                  strokeWidth={isSel ? 2 : 1.2}
                  fill="none"
                  opacity={isSel ? 1 : 0.45}
                />
                <g transform={`translate(72 ${y-9})`}>
                  <rect width="56" height="18" rx="9" fill="var(--bg-2)" stroke={c} strokeWidth={isSel ? 1.4 : 1} opacity={isSel ? 1 : 0.75} />
                  <text x="28" y="12" fontFamily="JetBrains Mono, monospace" fontSize="9" fill={c} textAnchor="middle" fontWeight="600" opacity={isSel ? 1 : 0.85}>
                    {f.status === 'review' ? '? review' : truncateFn(f.xform)}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ paddingRight: 18 }}>
        <ColHeader2 label="SalesPort DMS" sub="target · v1.2 schema" color="var(--orange)" align="right" />
        <div style={{ marginTop: 16 }}>
          {mappings.map((f, i) => (
            <FieldRow
              key={f.dms+i}
              field={f.dms}
              type={f.dmsType}
              desc={f.dmsDesc}
              side="right"
              active={i === selectedIdx}
              onClick={() => setSelectedIdx(i)}
              statusColor={statusColor(f.status)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function truncateFn(xform) {
  if (xform === 'direct') return 'direct';
  if (xform === 'lookup') return 'lookup';
  if (xform.startsWith('lookup')) return 'lookup';
  if (xform.startsWith('statusMap')) return 'status';
  if (xform.startsWith('parseISO')) return 'date';
  if (xform.startsWith('toDecimal')) return 'decimal';
  if (xform.startsWith('parseInt')) return 'int';
  if (xform.startsWith('enumMap')) return 'enum';
  if (xform.startsWith('validate')) return 'validate';
  if (xform.length > 8) return 'ƒ()';
  return xform.slice(0, 8);
}

function ColHeader2({ label, sub, color, align }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: align==='right' ? 'flex-end' : 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 4, height: 14, background: color, borderRadius: 2 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-0)' }}>{label}</span>
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--ink-3)', paddingLeft: align==='right' ? 0 : 12, paddingRight: align==='right' ? 12 : 0 }}>{sub}</span>
    </div>
  );
}

function FieldRow({ field, type, desc, required, side, active, onClick, statusColor }) {
  return (
    <div
      onClick={onClick}
      className="clickable"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', borderRadius: 6,
        background: active ? 'var(--bg-3)' : 'transparent',
        border: `1px solid ${active ? statusColor : 'transparent'}`,
        marginBottom: 4, height: 32,
        flexDirection: side==='right' ? 'row-reverse' : 'row',
        textAlign: side==='right' ? 'right' : 'left',
      }}
    >
      <div style={{ width: 6, height: 22, background: statusColor, borderRadius: 2, opacity: active ? 1 : 0.5 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', gap: 5, alignItems: 'center', justifyContent: side==='right' ? 'flex-end' : 'flex-start' }}>
          {required && side==='left' && <span style={{ color: 'var(--orange)', fontSize: 13, lineHeight: 0 }}>*</span>}
          <span>{field}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', display: 'flex', gap: 6, justifyContent: side==='right' ? 'flex-end' : 'flex-start' }}>
          <span className="mono">{type}</span>
          <span>·</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</span>
        </div>
      </div>
    </div>
  );
}

function FieldInspector({ field, moduleId }) {
  if (!field) return null;
  const statusColor = field.status==='mapped' ? 'var(--teal)' : field.status==='review' ? 'var(--amber)' : 'var(--red)';
  const statusKind = field.status==='mapped' ? 'ok' : field.status==='review' ? 'warn' : 'err';

  return (
    <div className="card" style={{ position: 'sticky', top: 0, height: 'fit-content' }}>
      <div className="hd">
        <h3>Field inspector</h3>
        <Chip kind={statusKind} dot>{field.status}</Chip>
      </div>
      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 4, height: 12, background: 'var(--teal-dim)' }} />
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em' }}>SAP B1 SOURCE</span>
            {field.required && <span className="chip orange" style={{ marginLeft: 'auto' }}>required</span>}
          </div>
          <div className="mono" style={{ fontSize: 14, fontWeight: 700, wordBreak: 'break-all' }}>{field.sap}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }}>{field.sapDesc}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{field.sapType}</div>
        </div>

        <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line-warm)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>TRANSFORM</div>
          <div className="mono" style={{ fontSize: 12, color: 'var(--orange)', wordBreak: 'break-all' }}>{field.xform}</div>
          {field.confidence > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-2)', marginBottom: 4 }}>
                <span>Confidence</span>
                <span className="mono">{field.confidence}%</span>
              </div>
              <div className="prog"><div style={{ width: `${field.confidence}%`, background: statusColor }} /></div>
            </div>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 4, height: 12, background: 'var(--orange)' }} />
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em' }}>DMS TARGET</span>
          </div>
          <div className="mono" style={{ fontSize: 14, fontWeight: 700, wordBreak: 'break-all' }}>{field.dms}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }}>{field.dmsDesc}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{field.dmsType}</div>
        </div>

        <div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>LIVE SAMPLE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', background: 'var(--code-bg)', padding: 10, borderRadius: 6, border: '1px solid var(--line)' }}>
            <code className="mono" style={{ fontSize: 11, color: 'var(--teal)', wordBreak: 'break-all' }}>{sampleValueFor(moduleId, field.sap, false)}</code>
            <Icons.arrow style={{ color: 'var(--orange)' }} />
            <code className="mono" style={{ fontSize: 11, color: 'var(--orange)', textAlign: 'right', wordBreak: 'break-all' }}>{sampleValueFor(moduleId, field.sap, true)}</code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" style={{ flex: 1 }}>Edit rule</button>
          <button className="btn ghost" style={{ flex: 1 }}>View audit</button>
        </div>
      </div>
    </div>
  );
}

function sampleValueFor(moduleId, sap, mapped) {
  const samples = {
    'bp-master': {
      customer_code: ['"CUST1013"', '"CUST1013"'],
      store_name: ['"Param Dairy Store"', '"Param Dairy Store"'],
      first_name: ['"Ram"', '"Ram"'],
      last_name: ['"Sharma"', '"Sharma"'],
      contact_country_code: ['"+977"', '"+977"'],
      contact_number: ['"9800000000"', '"9800000000"'],
      email_id: ['""', 'null'],
      bill_to_country_name: ['"Nepal"', '"Nepal"'],
      greater_circle_name: ['"Zone A"', '12  (zone_id)'],
      circle_name: ['"Town X"', '47  (circle_id)'],
      payment_terms: ['"Net 30"', '3  (terms_id)'],
      rate_group: ['"Standard"', '1  (group_id)'],
      status: ['"Y"', 'true'],
      cost_center_master: ['"CC.100"', '"CC.100"'],
      vat_number: ['"123456789"', '"123456789"'],
      date_of_joining: ['"2026-01-15"', '2026-01-15'],
    },
    'delivery-order': {
      do_entry: ['"DOE001"', '"DOE001"'],
      do_number: ['"DO-001"', '"DO-001"'],
      doc_entry: ['"DOC001"', '"DOC001"'],
      doc_number_so: ['"DOC-SO-001"', '"DOC-SO-001"'],
      do_amount: ['"5000.00"', '5000.00'],
      do_tax: ['"650.00"', '650.00'],
      do_total: ['"5650.00"', '5650.00'],
      'do_details[].item_code': ['"SKU001"', '4218 (variant_id)'],
      'do_details[].quantity': ['"50"', '50'],
      'do_details[].rate': ['"100.00"', '100.00'],
    },
    'order-status-sync': {
      doc_entry: ['"DOC001"', '"DOC001"'],
      doc_number_so: ['"DOC-SO-001"', '"DOC-SO-001"'],
      status: ['"Cancel"', '"CANCELLED"'],
    },
    'balance-status-update': {
      party_code: ['"PARTY001"', '4218 (bp_id)'],
      updated_amount: ['1500.5', '1500.50'],
    },
  };
  const m = samples[moduleId];
  if (!m || !m[sap]) return mapped ? '(transformed)' : '(value)';
  return mapped ? m[sap][1] : m[sap][0];
}

Object.assign(window, { FieldMapping });
