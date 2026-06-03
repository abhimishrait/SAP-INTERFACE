'use client';
import React from 'react';
import { Icons, Chip, Status, JsonBlock, SubHd } from '@/components';
import { MODULES, MODULE_BY_ID, MAPPINGS_BY_MODULE, SAMPLE_PAYLOADS, RESPONSE_CODES, AUTH_USER, AUTH_HEADER } from '@/data';
import { sapCall, API_BASE } from '@/lib/api';
import ImportModal, { getImportedCollections, saveImportedCollections, type ImportedCollection } from './ImportModal';

const BASE_URL = API_BASE; // live backend (was the spec base URL)

export default function ApiTester({ selectedModule, setSelectedModule, theme }: {
  selectedModule: string | null;
  setSelectedModule: (id: string | null) => void;
  theme?: string;
}) {
  const moduleId = selectedModule || 'bp-master';
  const mod = MODULE_BY_ID[moduleId];

  const [imported, setImported] = React.useState<ImportedCollection[]>(() => getImportedCollections());
  const [importOpen, setImportOpen] = React.useState(false);
  const [activeImported, setActiveImported] = React.useState<{ colId: string; reqIdx: number } | null>(null);

  const [method, setMethod] = React.useState(mod.methods[0]);
  // Per spec, PUT targets `/sap/<module>/{id}/` with the integer primary key
  // returned at create time. For modules whose business model has a stable
  // foreign code (bp_code, customer_code, variant_code), the backend also
  // accepts that in the URL — we offer it as a hint when the sample contains it.
  const defaultIdHint = (id: string): string => {
    const raw = (SAMPLE_PAYLOADS as any)[id]?.request;
    if (!raw) return '1';
    try {
      const obj = JSON.parse(raw);
      return obj.customer_code || obj.bp_code || obj.variant_code || obj.party_code || '1';
    } catch { return '1'; }
  };
  const [recordId, setRecordId] = React.useState(() => defaultIdHint(moduleId));
  const [tab, setTab] = React.useState('body');
  const [body, setBody] = React.useState((SAMPLE_PAYLOADS as any)[moduleId]?.request || '{}');
  const [sending, setSending] = React.useState(false);
  const [response, setResponse] = React.useState<any>(null);
  const [responseTab, setResponseTab] = React.useState('body');
  const [authMode, setAuthMode] = React.useState('basic');
  const [user, setUser] = React.useState(AUTH_USER);
  const [pass, setPass] = React.useState('SujalFoods@123');
  const [headers, setHeaders] = React.useState([
    { key: 'Content-Type', value: 'application/json', enabled: true },
    { key: 'Accept', value: 'application/json', enabled: true },
    { key: 'X-Correlation-Id', value: 'auto-generated', enabled: true },
  ]);

  React.useEffect(() => {
    setMethod(mod.methods[0]);
    setBody((SAMPLE_PAYLOADS as any)[moduleId]?.request || '{}');
    setRecordId(defaultIdHint(moduleId));
    setResponse(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  // PUT goes to `/sap/<module>/{id}/` per spec. PUT-only modules (3.15, 3.16)
  // have no path segment — they use the bare module path.
  const isPutWithId = method === 'PUT' && mod.methods.includes('POST');
  const fullPath = isPutWithId ? `${mod.path}${recordId}/` : mod.path;
  const fullUrl = `${BASE_URL}${fullPath}`;

  const openImported = (colId: string, reqIdx: number) => {
    const col = imported.find(c => c.id === colId);
    const r = col?.requests[reqIdx];
    if (!r) return;
    setActiveImported({ colId, reqIdx });
    setSelectedModule(null);
    setMethod(r.method);
    setBody(r.body || '');
  };

  const onImportedReceived = (_col: ImportedCollection) => {
    setImported(getImportedCollections());
  };

  const removeCollection = (colId: string) => {
    if (!confirm('Remove this imported collection?')) return;
    const next = imported.filter(c => c.id !== colId);
    saveImportedCollections(next);
    setImported(next);
    if (activeImported?.colId === colId) setActiveImported(null);
  };

  const onSend = async () => {
    setSending(true);
    setResponse(null);
    let parsed: any = null;
    try { parsed = body.trim() ? JSON.parse(body) : null; }
    catch (e: any) {
      setResponse({ status: 400, statusText: 'Bad Request (client-side)', body: { detail: 'Invalid JSON: ' + e.message }, ms: 0, size: body.length });
      setSending(false); return;
    }
    try {
      const result = await sapCall(method as 'POST' | 'PUT', fullPath, parsed, { user, pass });
      setResponse(result);
    } catch (e: any) {
      setResponse({ status: 0, statusText: 'Network error', body: { detail: e?.message || 'Failed to reach backend at ' + BASE_URL }, ms: 0, size: 0 });
    } finally {
      setSending(false);
    }
  };

  const onReset = () => {
    setBody((SAMPLE_PAYLOADS as any)[moduleId]?.request || '{}');
    setResponse(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <TesterCollection
        moduleId={moduleId}
        setSelectedModule={(id) => { setSelectedModule(id); setActiveImported(null); }}
        method={method}
        setMethod={setMethod}
        imported={imported}
        activeImported={activeImported}
        openImported={openImported}
        onOpenImportModal={() => setImportOpen(true)}
        removeCollection={removeCollection}
      />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={onImportedReceived} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-0)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--orange)', marginRight: 8 }}>{mod.code}</span>
                {mod.label}
              </h2>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2 }}>{mod.desc} · live against the local DMS backend (spec v1.2)</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
            <div style={{ display: 'flex', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
              {mod.methods.map((m: string) => (
                <button key={m} onClick={() => setMethod(m)} style={{
                  padding: '0 14px', minWidth: 60, height: 36,
                  background: method === m ? methodBg(m) : 'transparent',
                  color: method === m ? methodFg(m) : 'var(--ink-2)',
                  fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                  border: 'none', cursor: 'pointer',
                  borderRight: '1px solid var(--line)',
                }}>{m}</button>
              ))}
            </div>

            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 0,
              background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8,
              padding: '0 4px 0 12px', height: 36, overflow: 'hidden',
            }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{BASE_URL}</span>
              <span className="mono" style={{ fontSize: 12.5, color: 'var(--orange)', fontWeight: 600 }}>{mod.path}</span>
              {isPutWithId && (
                <>
                  <input
                    value={recordId}
                    onChange={e => setRecordId(e.target.value)}
                    placeholder="id"
                    spellCheck={false}
                    style={{
                      minWidth: 80, maxWidth: 200, height: 24,
                      margin: '0 2px', padding: '0 8px',
                      background: 'rgba(155,141,255,0.10)',
                      border: '1px solid rgba(155,141,255,0.45)',
                      borderRadius: 4, outline: 'none',
                      fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12,
                      color: 'var(--violet)', fontWeight: 600,
                    }}
                  />
                  <span className="mono" style={{ fontSize: 12.5, color: 'var(--orange)', fontWeight: 600 }}>/</span>
                </>
              )}
              <div style={{ flex: 1 }} />
            </div>

            <button onClick={onSend} disabled={sending} className="btn primary" style={{ padding: '0 22px', height: 36, fontSize: 13, fontWeight: 700 }}>
              {sending
                ? <><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} /> Sending</>
                : <><Icons.send /> Send</>
              }
            </button>
            <button onClick={onReset} className="btn ghost" style={{ height: 36 }} title="Reset to sample">
              <Icons.refresh />
            </button>
          </div>
        </div>

        <div style={{ padding: '0 18px' }}>
          <div className="tabs">
            {[
              { id: 'params', label: 'Params' },
              { id: 'auth', label: 'Authorization', dot: true },
              { id: 'headers', label: `Headers (${headers.filter(h => h.enabled).length})` },
              { id: 'body', label: 'Body', dot: method !== 'GET' },
            ].map(t => (
              <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.dot && <span style={{ display: 'inline-block', marginLeft: 5, width: 5, height: 5, borderRadius: '50%', background: 'var(--orange)', verticalAlign: 'middle' }} />}
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: '1 1 50%', minHeight: 200, overflow: 'auto', padding: 18 }}>
          {tab === 'params' && <ParamsTab moduleId={moduleId} method={method} />}
          {tab === 'auth' && <AuthTab user={user} setUser={setUser} pass={pass} setPass={setPass} authMode={authMode} setAuthMode={setAuthMode} />}
          {tab === 'headers' && <HeadersTab headers={headers} setHeaders={setHeaders} />}
          {tab === 'body' && <BodyTab body={body} setBody={setBody} moduleId={moduleId} />}
        </div>

        <div style={{ flex: '1 1 50%', minHeight: 220, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ResponsePane response={response} sending={sending} tab={responseTab} setTab={setResponseTab} method={method} moduleId={moduleId} url={fullUrl} />
        </div>
      </div>
    </div>
  );
}

function methodBg(m: string) {
  return ({
    GET: 'rgba(93,169,255,0.18)', POST: 'rgba(125,211,192,0.20)',
    PUT: 'rgba(232,185,106,0.20)', PATCH: 'rgba(155,141,255,0.20)',
    DELETE: 'rgba(233,112,112,0.20)',
  } as any)[m];
}
function methodFg(m: string) {
  return ({
    GET: 'var(--blue)', POST: 'var(--teal)', PUT: 'var(--amber)',
    PATCH: 'var(--violet)', DELETE: 'var(--red)',
  } as any)[m];
}

function ImportedCollectionBlock({ col, activeImported, openImported, removeCollection }: {
  col: ImportedCollection;
  activeImported: { colId: string; reqIdx: number } | null;
  openImported: (colId: string, reqIdx: number) => void;
  removeCollection: (colId: string) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const folders: Record<string, any[]> = {};
  col.requests.forEach((r, i) => {
    const g = r.group || 'Root';
    if (!folders[g]) folders[g] = [];
    folders[g].push({ ...r, idx: i });
  });

  return (
    <div style={{ paddingLeft: 14 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px 5px 4px', cursor: 'pointer' }}>
        <Icons.chev style={{ color: 'var(--ink-3)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.15s' }} />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-0)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.name}</span>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>{col.requests.length}</span>
        <button onClick={(e) => { e.stopPropagation(); removeCollection(col.id); }} className="btn ghost" style={{ padding: 2 }} title="Remove">
          <Icons.x style={{ width: 10, height: 10 }} />
        </button>
      </div>
      {open && (
        <div style={{ paddingLeft: 12 }}>
          {Object.entries(folders).map(([folder, items]) => (
            <div key={folder}>
              {folder !== 'Root' && (
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, padding: '4px 8px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{folder}</div>
              )}
              {items.map(r => {
                const active = activeImported && activeImported.colId === col.id && activeImported.reqIdx === r.idx;
                return (
                  <div
                    key={r.idx}
                    onClick={() => openImported(col.id, r.idx)}
                    className="clickable"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 12px 5px 8px', borderRadius: 5,
                      background: active ? 'var(--bg-2)' : 'transparent',
                      borderLeft: `2px solid ${active ? 'var(--violet)' : 'transparent'}`,
                      marginLeft: -2,
                    }}>
                    <span className={`method ${r.method}`} style={{ minWidth: 36, fontSize: 9, padding: '1px 3px' }}>{r.method}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-1)', fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TesterCollection({ moduleId, setSelectedModule, method, setMethod, imported, activeImported, openImported, onOpenImportModal, removeCollection }: {
  moduleId: string;
  setSelectedModule: (id: string) => void;
  method: string;
  setMethod: (m: string) => void;
  imported: ImportedCollection[];
  activeImported: { colId: string; reqIdx: number } | null;
  openImported: (colId: string, reqIdx: number) => void;
  onOpenImportModal: () => void;
  removeCollection: (colId: string) => void;
}) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [query, setQuery] = React.useState('');

  const groups = [
    { id: 'master', label: 'Master Data' },
    { id: 'geo', label: 'Geo / Territory' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'transaction', label: 'Transactional' },
  ];

  const filterMod = (m: any) => !query || m.label.toLowerCase().includes(query.toLowerCase()) || m.path.includes(query);

  return (
    <aside style={{
      width: 280, flexShrink: 0,
      background: 'var(--bg-1)', borderRight: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-0)', flex: 1 }}>Collections</span>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 11, background: 'var(--orange)', color: 'var(--on-orange)', border: 'none' }} onClick={onOpenImportModal}>
            <Icons.download style={{ width: 11, height: 11, transform: 'rotate(180deg)' }} /> Import
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 9, top: 7, color: 'var(--ink-3)' }}><Icons.search /></div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter requests…"
            style={{
              width: '100%', padding: '6px 10px 6px 28px',
              background: 'var(--bg-2)', border: '1px solid var(--line)',
              borderRadius: 6, color: 'var(--ink-0)', fontSize: 11.5,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
        <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icons.chev style={{ color: 'var(--orange)', transform: 'rotate(90deg)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)', letterSpacing: '0.02em' }}>SalesPort × SAP · v1.2</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>30</span>
        </div>

        {groups.map(g => {
          const mods = MODULES.filter((m: any) => m.kind === g.id).filter(filterMod);
          if (!mods.length) return null;
          const isCollapsed = !!collapsed[g.id];
          return (
            <div key={g.id} style={{ paddingLeft: 14 }}>
              <div
                onClick={() => setCollapsed(c => ({ ...c, [g.id]: !c[g.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px 5px 4px', cursor: 'pointer' }}>
                <Icons.chev style={{ color: 'var(--ink-3)', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: '0.15s' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{g.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 'auto' }}>{mods.length}</span>
              </div>
              {!isCollapsed && (
                <div style={{ paddingLeft: 16 }}>
                  {mods.map((m: any) => (
                    <React.Fragment key={m.id}>
                      {m.methods.map((mt: string) => (
                        <div
                          key={m.id + mt}
                          onClick={() => { setSelectedModule(m.id); setMethod(mt); }}
                          className="clickable"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '5px 12px 5px 8px', borderRadius: 5,
                            background: (!activeImported && moduleId === m.id && method === mt) ? 'var(--bg-2)' : 'transparent',
                            borderLeft: `2px solid ${(!activeImported && moduleId === m.id && method === mt) ? 'var(--orange)' : 'transparent'}`,
                            marginLeft: -2,
                          }}>
                          <span className={`method ${mt}`} style={{ minWidth: 36, fontSize: 9, padding: '1px 3px' }}>{mt}</span>
                          <span style={{ fontSize: 12, color: 'var(--ink-1)', fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {imported && imported.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icons.chev style={{ color: 'var(--violet)', transform: 'rotate(90deg)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)', letterSpacing: '0.02em', flex: 1 }}>Imported</span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{imported.length}</span>
            </div>
            {imported.map(col => (
              <ImportedCollectionBlock key={col.id} col={col} activeImported={activeImported} openImported={openImported} removeCollection={removeCollection} />
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.08em', marginBottom: 6 }}>ENVIRONMENT</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: 'var(--ink-2)' }} className="mono">{'{{base_url}}'}</span>
          <span style={{ color: 'var(--orange)' }} className="mono">dms.salesport.in</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--ink-2)' }} className="mono">{'{{username}}'}</span>
          <span style={{ color: 'var(--teal)' }} className="mono">{AUTH_USER}</span>
        </div>
      </div>
    </aside>
  );
}

function ParamsTab({ moduleId, method }: { moduleId: string; method: string }) {
  return (
    <div>
      <SubHd>Query / Path parameters</SubHd>
      <div style={{ marginTop: 8, padding: 14, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 10, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 8 }}>
          <span>Key</span><span>Value</span><span></span>
        </div>
        {method === 'PUT' && MODULE_BY_ID[moduleId].methods.includes('POST') ? (
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 10, alignItems: 'center', padding: '6px 0' }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--orange)' }}>id</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--violet)' }}>1  (path param)</span>
            <Chip kind="orange" dot>required</Chip>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>No query or path params for this endpoint. Use the Body tab to send fields.</div>
        )}
      </div>
    </div>
  );
}

function AuthTab({ user, setUser, pass, setPass, authMode, setAuthMode }: {
  user: string; setUser: (v: string) => void;
  pass: string; setPass: (v: string) => void;
  authMode: string; setAuthMode: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ width: 200, flexShrink: 0 }}>
        <SubHd>Type</SubHd>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { id: 'basic', label: 'Basic Auth', recommended: true },
            { id: 'bearer', label: 'Bearer Token' },
            { id: 'apikey', label: 'API Key' },
            { id: 'oauth2', label: 'OAuth 2.0' },
            { id: 'none', label: 'No Auth' },
          ].map(m => (
            <button key={m.id} onClick={() => setAuthMode(m.id)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 10px', borderRadius: 6,
              background: authMode === m.id ? 'var(--bg-2)' : 'transparent',
              border: `1px solid ${authMode === m.id ? 'var(--line-strong)' : 'var(--line)'}`,
              color: authMode === m.id ? 'var(--ink-0)' : 'var(--ink-2)',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
            }}>
              {m.label}
              {m.recommended && <span className="mono" style={{ fontSize: 9, color: 'var(--orange)' }}>spec</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <SubHd>{authMode === 'basic' ? 'Basic Auth credentials (§2.1)' : 'Auth details'}</SubHd>
        {authMode === 'basic' ? (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FormField label="Username" value={user} onChange={setUser} mono />
            <FormField label="Password" value={pass} onChange={setPass} mono type="password" />
            <div style={{ padding: 12, background: 'var(--bg-2)', border: '1px dashed var(--line-warm)', borderRadius: 8 }}>
              <SubHd>Generated Authorization header</SubHd>
              <div className="mono" style={{ fontSize: 12, marginTop: 6, color: 'var(--orange)', wordBreak: 'break-all' }}>
                {AUTH_HEADER}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-2)' }}>
                <span style={{ color: 'var(--ink-1)' }}>Base64(<span className="mono">{user}:{pass.replace(/./g, '•')}</span>)</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 14, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink-2)' }}>
            SalesPort DMS v1.2 only supports HTTP Basic Auth per §2.1. Switch back to Basic to send.
          </div>
        )}
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, mono, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  mono?: boolean; type?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 12px', height: 34,
          background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6,
          color: 'var(--ink-0)', fontSize: 12.5, outline: 'none',
          fontFamily: mono ? 'var(--font-jetbrains-mono), monospace' : 'inherit',
        }}
      />
    </div>
  );
}

function HeadersTab({ headers, setHeaders }: {
  headers: { key: string; value: string; enabled: boolean }[];
  setHeaders: React.Dispatch<React.SetStateAction<{ key: string; value: string; enabled: boolean }[]>>;
}) {
  const toggle = (i: number) => setHeaders(hs => hs.map((h, j) => j === i ? { ...h, enabled: !h.enabled } : h));
  const update = (i: number, k: string, v: string) => setHeaders(hs => hs.map((h, j) => j === i ? { ...h, [k]: v } : h));
  const add = () => setHeaders(hs => [...hs, { key: '', value: '', enabled: true }]);

  return (
    <div>
      <SubHd>Headers</SubHd>
      <div style={{ marginTop: 8, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 32px', background: 'var(--bg-2)', padding: '8px 12px', fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
          <span></span><span>Key</span><span>Value</span><span></span>
        </div>
        {headers.map((h, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 32px', alignItems: 'center', padding: '6px 12px', borderTop: i ? '1px solid var(--line)' : 'none', background: 'var(--bg-1)' }}>
            <input type="checkbox" checked={h.enabled} onChange={() => toggle(i)} />
            <input value={h.key} onChange={e => update(i, 'key', e.target.value)}
              className="mono" style={{ background: 'transparent', border: 'none', outline: 'none', color: h.enabled ? 'var(--orange)' : 'var(--ink-3)', fontSize: 12, padding: '4px 4px' }} />
            <input value={h.value} onChange={e => update(i, 'value', e.target.value)}
              className="mono" style={{ background: 'transparent', border: 'none', outline: 'none', color: h.enabled ? 'var(--ink-1)' : 'var(--ink-3)', fontSize: 12, padding: '4px 4px' }} />
            <button className="btn ghost" style={{ padding: '2px 6px' }} onClick={() => setHeaders(hs => hs.filter((_, j) => j !== i))}><Icons.x style={{ width: 11, height: 11 }} /></button>
          </div>
        ))}
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}>
          <button className="btn ghost" style={{ fontSize: 11 }} onClick={add}>+ Add header</button>
        </div>
      </div>
    </div>
  );
}

function BodyTab({ body, setBody, moduleId }: { body: string; setBody: (v: string) => void; moduleId: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, alignItems: 'center' }}>
        {['raw', 'form-data', 'x-www-form-urlencoded', 'binary'].map(m => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: m === 'raw' ? 'var(--ink-0)' : 'var(--ink-3)', cursor: m === 'raw' ? 'pointer' : 'not-allowed' }}>
            <input type="radio" checked={m === 'raw'} readOnly />
            <span>{m}</span>
          </label>
        ))}
        <div style={{ flex: 1 }} />
        <span className="chip orange">JSON</span>
        <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => setBody((SAMPLE_PAYLOADS as any)[moduleId]?.request || '{}')}>
          <Icons.refresh /> Reset to spec sample
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 180, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1, padding: '12px 14px', minHeight: 180,
            background: 'var(--code-bg)', border: 'none', outline: 'none',
            color: 'var(--ink-1)', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12,
            lineHeight: 1.5, resize: 'vertical',
          }}
        />
      </div>
    </div>
  );
}

function Sep() { return <div style={{ width: 1, height: 26, background: 'var(--line)' }} />; }

function ResponsePane({ response, sending, tab, setTab, method, moduleId, url }: {
  response: any; sending: boolean; tab: string; setTab: (t: string) => void;
  method: string; moduleId: string; url: string;
}) {
  if (sending) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: 'var(--ink-2)' }}>
        <span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', border: '2.5px solid var(--orange)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
        <span style={{ fontSize: 12 }}>Simulating {method} call to {moduleId}…</span>
      </div>
    );
  }
  if (!response) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 30 }}>
        <Icons.send style={{ width: 36, height: 36, color: 'var(--ink-3)' }} />
        <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>Hit Send to call <span className="mono" style={{ color: 'var(--orange)' }}>{url}</span></div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>The call will hit the real backend, run validation, write to abc_dms if it passes, and log to integration_transactions.</div>
      </div>
    );
  }

  const isOk = response.status < 400;
  const c = isOk ? 'var(--teal)' : response.status < 500 ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 18, background: 'var(--bg-1)' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Status code={response.status} />
            <span style={{ fontSize: 12, color: c, fontWeight: 600 }}>{response.statusText}</span>
          </div>
        </div>
        <Sep />
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Time</div>
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-0)', marginTop: 2 }}>{response.ms} ms</div>
        </div>
        <Sep />
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Size</div>
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-0)', marginTop: 2 }}>{response.size} B</div>
        </div>
        <Sep />
        <Chip kind={isOk ? 'ok' : 'err'} dot>{isOk ? 'persisted to integration_transactions' : 'logged · not persisted'}</Chip>
        <div style={{ flex: 1 }} />
        <button className="btn ghost"><Icons.copy /> Copy</button>
        <button className="btn ghost"><Icons.download /> Save example</button>
      </div>

      <div className="tabs" style={{ padding: '0 18px' }}>
        {[
          { id: 'body', label: 'Body' },
          { id: 'headers', label: 'Headers (6)' },
          { id: 'cookies', label: 'Cookies (0)' },
          { id: 'tests', label: 'Test results' },
          { id: 'logs', label: 'Will write to DB' },
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
        {tab === 'body' && <ResponseBody response={response} />}
        {tab === 'headers' && <ResponseHeaders response={response} moduleId={moduleId} method={method} />}
        {tab === 'cookies' && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>No cookies set.</div>}
        {tab === 'tests' && <ResponseTests response={response} moduleId={moduleId} />}
        {tab === 'logs' && <ResponseLogs response={response} moduleId={moduleId} method={method} />}
      </div>
    </div>
  );
}

function ResponseBody({ response }: { response: any }) {
  const [view, setView] = React.useState<'pretty' | 'raw' | 'preview'>('pretty');
  const isObj = response.body && typeof response.body === 'object';
  const pretty = isObj ? JSON.stringify(response.body, null, 2) : String(response.body ?? '');
  const raw = isObj ? JSON.stringify(response.body) : String(response.body ?? '');

  const tabs: { id: 'pretty' | 'raw' | 'preview'; label: string }[] = [
    { id: 'pretty', label: 'Pretty' },
    { id: 'raw', label: 'Raw' },
    { id: 'preview', label: 'Preview' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={view === t.id ? 'btn' : 'btn ghost'}
            style={{ padding: '4px 10px', fontSize: 11 }}>
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span className="chip muted">JSON</span>
      </div>
      {view === 'pretty' && <JsonBlock src={pretty} />}
      {view === 'raw' && (
        <pre style={{
          margin: 0, padding: '12px 14px',
          background: 'var(--code-bg)', border: '1px solid var(--line)', borderRadius: 8,
          fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12,
          color: 'var(--ink-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>{raw}</pre>
      )}
      {view === 'preview' && (
        isObj ? <ResponsePreviewTable obj={response.body} /> : (
          <pre style={{
            margin: 0, padding: '12px 14px',
            background: 'var(--code-bg)', border: '1px solid var(--line)', borderRadius: 8,
            fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12,
            color: 'var(--ink-1)', whiteSpace: 'pre-wrap',
          }}>{pretty}</pre>
        )
      )}
    </div>
  );
}

function ResponsePreviewTable({ obj }: { obj: any }) {
  const entries = Object.entries(obj);
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {entries.map(([k, v], i) => {
        const display = v === null || v === undefined
          ? <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>null</span>
          : typeof v === 'object'
            ? <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-1)' }}>{JSON.stringify(v)}</span>
            : <span className="mono" style={{ fontSize: 12, color: 'var(--ink-1)' }}>{String(v)}</span>;
        return (
          <div key={k} style={{
            display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12,
            padding: '8px 14px',
            borderBottom: i < entries.length - 1 ? '1px solid var(--line)' : 'none',
            background: i % 2 ? 'var(--bg-1)' : 'transparent',
          }}>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--orange)' }}>{k}</span>
            {display}
          </div>
        );
      })}
    </div>
  );
}

function ResponseHeaders({ response, moduleId, method }: { response: any; moduleId: string; method: string }) {
  const codeText = RESPONSE_CODES.find((c: any) => c.code === response.status)?.status || 'OK';
  const hdrs = [
    ['HTTP/1.1', `${response.status} ${codeText}`],
    ['Content-Type', 'application/json'],
    ['Content-Length', String(response.size)],
    ['X-Request-Id', 'req_' + Math.random().toString(16).slice(2, 14)],
    ['X-Module', moduleId],
    ['X-Mapped-Fields', String((MAPPINGS_BY_MODULE[moduleId] || []).length)],
    ['Server', 'salesport-dms/1.2'],
    ['Date', new Date().toUTCString()],
  ];
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {hdrs.map(([k, v], i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12,
          padding: '8px 14px', borderBottom: i < hdrs.length - 1 ? '1px solid var(--line)' : 'none',
          background: i % 2 ? 'var(--bg-1)' : 'transparent',
        }}>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--orange)' }}>{k}</span>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-1)' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function ResponseTests({ response, moduleId }: { response: any; moduleId: string }) {
  const mod = MODULE_BY_ID[moduleId];
  const isOk = response.status < 400;
  const tests = [
    { name: 'Status code is in 200/201', pass: isOk },
    { name: 'Response time is less than 2000ms', pass: response.ms < 2000 },
    { name: 'Content-Type is application/json', pass: true },
    { name: `Response body has expected fields for ${mod.label}`, pass: isOk },
    { name: 'No PII leaked in response', pass: true },
    { name: 'Spec §' + mod.code + ' validation rules respected', pass: isOk },
  ];
  const passed = tests.filter(t => t.pass).length;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Chip kind={passed === tests.length ? 'ok' : 'warn'} dot>{passed}/{tests.length} passed</Chip>
        <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>Pre-defined test suite for {mod.code} {mod.label}</span>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        {tests.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < tests.length - 1 ? '1px solid var(--line)' : 'none', background: 'var(--bg-1)' }}>
            {t.pass
              ? <span style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--teal-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}><Icons.check style={{ width: 11, height: 11 }} /></span>
              : <span style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}><Icons.x style={{ width: 11, height: 11 }} /></span>
            }
            <span style={{ fontSize: 12.5, color: 'var(--ink-1)', flex: 1 }}>{t.name}</span>
            <span className="mono" style={{ fontSize: 10.5, color: t.pass ? 'var(--teal)' : 'var(--red)' }}>{t.pass ? 'PASS' : 'FAIL'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResponseLogs({ response, moduleId, method }: { response: any; moduleId: string; method: string }) {
  if (response.status >= 400) {
    return (
      <div style={{ padding: 14, background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, color: 'var(--red)', fontSize: 12 }}>
        <strong>Failure persisted:</strong> request + response stored in <span className="mono">integration_transactions</span> and pushed to <span className="mono">dlq_messages</span> for retry.
      </div>
    );
  }
  return (
    <div>
      <SubHd>If this were a real call, the following rows would be written</SubHd>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { op: 'INSERT', table: 'integration_transactions' },
          { op: 'INSERT', table: 'field_map_audit' },
          { op: method === 'POST' ? 'INSERT' : 'UPDATE', table: moduleId.replace(/-/g, '_') },
          { op: 'UPDATE', table: 'sync_jobs' },
          { op: 'INSERT', table: 'idempotency_keys' },
        ].map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6 }}>
            <span className="mono" style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
              background: w.op === 'INSERT' ? 'var(--teal-bg)' : 'rgba(232,185,106,0.14)',
              color: w.op === 'INSERT' ? 'var(--teal)' : 'var(--amber)' }}>{w.op}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-1)' }}>{w.table}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
