'use client';
import React from 'react';
import { Icons, Chip } from '@/components';

export const IMPORTED_COLLECTIONS_KEY = 'salesport_imported_collections_v1';

export type ImportedRequest = {
  name: string;
  group: string;
  method: string;
  url: string;
  body: string;
  headers: { key: string; value: string }[];
};

export type ImportedCollection = {
  id: string;
  name: string;
  source: string;
  description: string;
  requests: ImportedRequest[];
};

export function getImportedCollections(): ImportedCollection[] {
  try {
    const raw = localStorage.getItem(IMPORTED_COLLECTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveImportedCollections(cs: ImportedCollection[]) {
  localStorage.setItem(IMPORTED_COLLECTIONS_KEY, JSON.stringify(cs));
}

function parsePostman(json: any): ImportedCollection {
  if (!json.info || !json.item) throw new Error('Not a valid Postman v2.1 collection (missing info/item).');
  const flatten = (items: any[], prefix = ''): ImportedRequest[] => {
    let out: ImportedRequest[] = [];
    for (const it of items) {
      if (it.item) {
        out = out.concat(flatten(it.item, prefix ? `${prefix} / ${it.name}` : it.name));
      } else if (it.request) {
        const r = it.request;
        const url = typeof r.url === 'string' ? r.url : (r.url?.raw || (r.url?.host?.join('.') + '/' + (r.url?.path || []).join('/')));
        out.push({
          name: it.name || 'Request',
          group: prefix || 'Root',
          method: (typeof r.method === 'string' ? r.method : 'GET').toUpperCase(),
          url: url || '',
          body: r.body?.raw || '',
          headers: (r.header || []).filter((h: any) => !h.disabled).map((h: any) => ({ key: h.key, value: h.value })),
        });
      }
    }
    return out;
  };
  return {
    id: 'imp_' + Math.random().toString(36).slice(2, 10),
    name: json.info.name || 'Imported collection',
    source: 'postman',
    description: json.info.description || '',
    requests: flatten(json.item),
  };
}

function parseOpenAPI(json: any): ImportedCollection {
  if (!json.openapi && !json.swagger) throw new Error('Not OpenAPI/Swagger spec.');
  const base = json.servers?.[0]?.url || '';
  const requests: ImportedRequest[] = [];
  for (const [path, ops] of Object.entries(json.paths || {})) {
    for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = (ops as any)[m];
      if (op) {
        requests.push({
          name: op.summary || op.operationId || `${m.toUpperCase()} ${path}`,
          group: op.tags?.[0] || 'default',
          method: m.toUpperCase(),
          url: base + path,
          body: '',
          headers: [],
        });
      }
    }
  }
  return {
    id: 'imp_' + Math.random().toString(36).slice(2, 10),
    name: json.info?.title || 'OpenAPI collection',
    source: 'openapi',
    description: json.info?.description || '',
    requests,
  };
}

export function tryParseCollection(text: string): ImportedCollection {
  let json: any;
  try { json = JSON.parse(text); }
  catch (e: any) { throw new Error('Invalid JSON: ' + e.message); }
  if (json.info?.schema && json.info.schema.includes('postman')) return parsePostman(json);
  if (json.item && json.info) return parsePostman(json);
  if (json.openapi || json.swagger) return parseOpenAPI(json);
  if (json.collection && json.collection.item) return parsePostman(json.collection);
  throw new Error('Unknown collection format. Supported: Postman v2.1, OpenAPI 3.x, Swagger 2.0.');
}

const SAMPLE_POSTMAN_JSON = `{
  "info": {
    "name": "Sujal Foods · Field POS",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    "description": "Mobile POS endpoints used by field reps."
  },
  "item": [
    {
      "name": "Auth",
      "item": [
        { "name": "Login",  "request": { "method": "POST", "url": "https://pos.salesport.in/v1/auth/login", "body": {"raw": "{\\"email\\":\\"rep@sujalfoods.in\\",\\"pin\\":\\"1234\\"}"} } },
        { "name": "Logout", "request": { "method": "POST", "url": "https://pos.salesport.in/v1/auth/logout" } }
      ]
    },
    {
      "name": "Orders",
      "item": [
        { "name": "List orders", "request": { "method": "GET",  "url": "https://pos.salesport.in/v1/orders" } },
        { "name": "Create order","request": { "method": "POST", "url": "https://pos.salesport.in/v1/orders" } },
        { "name": "Cancel order","request": { "method": "DELETE","url": "https://pos.salesport.in/v1/orders/{{order_id}}" } }
      ]
    },
    { "name": "Sync stock", "request": { "method": "PATCH", "url": "https://pos.salesport.in/v1/stock/sync" } }
  ]
}`;

function loginInputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '8px 12px', height: 36,
    background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6,
    color: 'var(--ink-0)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
  };
}

function FormField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} style={loginInputStyle()} />
    </div>
  );
}

export default function ImportModal({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: (col: ImportedCollection) => void;
}) {
  const [text, setText] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ImportedCollection | null>(null);
  const [tab, setTab] = React.useState('paste');
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) { setText(''); setName(''); setError(null); setPreview(null); setTab('paste'); }
  }, [open]);

  const onParse = (raw: string) => {
    setError(null); setPreview(null);
    try {
      const parsed = tryParseCollection(raw);
      if (name) parsed.name = name;
      setPreview(parsed);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const onFileChosen = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setText(result);
      onParse(result);
    };
    reader.readAsText(file);
  };

  const onConfirm = () => {
    if (!preview) return;
    const existing = getImportedCollections();
    const next = [...existing, preview];
    saveImportedCollections(next);
    onImported(preview);
    onClose();
  };

  const loadSample = () => {
    setText(SAMPLE_POSTMAN_JSON);
    onParse(SAMPLE_POSTMAN_JSON);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 880, maxHeight: '88vh',
        background: 'var(--bg-1)', border: '1px solid var(--line-strong)', borderRadius: 14,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--orange-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--orange)' }}>
            <Icons.download style={{ width: 18, height: 18, transform: 'rotate(180deg)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink-0)' }}>Import API collection</h2>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2 }}>Paste a Postman v2.1, OpenAPI 3.x, or Swagger 2.0 file. Requests show up alongside the SalesPort × SAP B1 spec.</div>
          </div>
          <button className="btn ghost" onClick={onClose}><Icons.x /></button>
        </div>

        <div className="tabs" style={{ padding: '0 20px' }}>
          {[
            { id: 'paste', label: 'Paste JSON' },
            { id: 'upload', label: 'Upload file' },
            { id: 'url', label: 'From URL' },
          ].map(t => (
            <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>
          ))}
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 0, overflow: 'hidden' }}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, borderRight: '1px solid var(--line)', overflow: 'auto' }}>
            <FormField label="Collection name (optional)" value={name} onChange={setName} />

            {tab === 'paste' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Collection JSON</div>
                  <button className="btn ghost" style={{ fontSize: 11 }} onClick={loadSample}>
                    <Icons.download style={{ width: 11, height: 11 }} /> Try with sample
                  </button>
                </div>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onBlur={() => text.trim() && onParse(text)}
                  placeholder='{ "info": { "name": "...", "schema": "...postman...v2.1.0..." }, "item": [ ... ] }'
                  spellCheck={false}
                  style={{
                    flex: 1, minHeight: 260, resize: 'vertical',
                    padding: 12, background: 'var(--code-bg)', border: '1px solid var(--line)', borderRadius: 8,
                    color: 'var(--ink-1)', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11.5, lineHeight: 1.5, outline: 'none',
                  }}
                />
                <button className="btn" onClick={() => onParse(text)} style={{ alignSelf: 'flex-start' }}>
                  <Icons.check /> Parse
                </button>
              </div>
            )}

            {tab === 'upload' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Pick a .json file</div>
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); onFileChosen(e.dataTransfer.files[0]); }}
                  style={{
                    border: '2px dashed var(--line-strong)', borderRadius: 10,
                    padding: 32, textAlign: 'center', cursor: 'pointer',
                    background: 'var(--bg-2)', color: 'var(--ink-2)',
                  }}>
                  <Icons.download style={{ width: 26, height: 26, color: 'var(--orange)', display: 'inline-block' }} />
                  <div style={{ fontSize: 13, color: 'var(--ink-0)', fontWeight: 600, marginTop: 8 }}>Drop your collection file here</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>or click to browse — .json up to 2MB</div>
                  <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => onFileChosen(e.target.files?.[0])} />
                </div>
              </div>
            )}

            {tab === 'url' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Collection URL</div>
                <input
                  placeholder="https://api.example.com/openapi.json"
                  style={loginInputStyle()}
                  onChange={e => setText(e.target.value)}
                />
                <div style={{ marginTop: 10, padding: 12, background: 'var(--bg-2)', border: '1px dashed var(--line)', borderRadius: 8, fontSize: 11.5, color: 'var(--ink-2)' }}>
                  Remote fetch is sandboxed in this preview. In the live console it pulls the URL via the integration network, validates the schema, and stores the parsed collection in <span className="mono">connector_state</span>.
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>
                <strong>Parse failed.</strong> {error}
              </div>
            )}
          </div>

          <div style={{ padding: 20, overflow: 'auto', background: 'var(--bg-0)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Preview</div>
            {!preview ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5, border: '1px dashed var(--line)', borderRadius: 8 }}>
                <Icons.dot style={{ marginBottom: 8, color: 'var(--ink-3)' }} />
                <div>Parsed requests appear here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ padding: 12, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-0)', flex: 1 }}>{preview.name}</span>
                    <Chip kind="info" dot>{preview.source}</Chip>
                  </div>
                  {preview.description && <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 4 }}>{preview.description}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: 'var(--ink-2)' }}>
                    <span><span className="mono" style={{ color: 'var(--teal)' }}>{preview.requests.length}</span> requests</span>
                    <span><span className="mono" style={{ color: 'var(--orange)' }}>{new Set(preview.requests.map(r => r.group)).size}</span> folders</span>
                  </div>
                </div>

                <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', maxHeight: 320 }}>
                  {preview.requests.slice(0, 40).map((r, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '54px 1fr', gap: 8, alignItems: 'center',
                      padding: '8px 12px', borderBottom: i < preview.requests.length - 1 ? '1px solid var(--line)' : 'none',
                      background: 'var(--bg-1)',
                    }}>
                      <span className={`method ${r.method}`}>{r.method}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.group} · {r.url}</div>
                      </div>
                    </div>
                  ))}
                  {preview.requests.length > 40 && (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', background: 'var(--bg-1)' }}>
                      + {preview.requests.length - 40} more…
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Imported collections are stored locally and shown in the API Tester collection list.
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={onConfirm} disabled={!preview}>
            <Icons.check /> Import {preview ? `${preview.requests.length} request${preview.requests.length === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
