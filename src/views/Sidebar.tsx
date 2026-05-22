'use client';
import React from 'react';
import { Icons, Chip, PulseDot } from '@/components';
import type { AuthUser } from '@/views/Login';
import { AUTH_USER } from '@/data';

export default function Sidebar({ view, setView, user, onLogout }: {
  view: string;
  setView: (v: string) => void;
  user: AuthUser;
  onLogout: () => void;
}) {
  const items = [
    { id: 'overview', label: 'Overview',      ico: Icons.overview, badge: null as string | null },
    { id: 'modules',  label: 'Modules',       ico: Icons.modules,  badge: '16' },
    { id: 'tester',   label: 'API Tester',    ico: Icons.tester,   badge: null },
    { id: 'mapping',  label: 'Field Mapping', ico: Icons.mapping,  badge: null },
    { id: 'logs',     label: 'API Logs',      ico: Icons.logs,     badge: 'live' },
    { id: 'queue',    label: 'Sync Queue',    ico: Icons.queue,    badge: '6' },
    { id: 'database', label: 'Database',      ico: Icons.db,       badge: null },
    { id: 'conns',    label: 'Connections',   ico: Icons.conn,     badge: null },
  ];

  return (
    <aside style={{ width: 232, flexShrink: 0, background: 'var(--bg-1)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', padding: '18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 22px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-3)', position: 'relative', overflow: 'hidden', border: '1px solid var(--line-strong)' }}>
          <svg width="30" height="30" viewBox="0 0 30 30" style={{ position: 'absolute', inset: 0 }}>
            <rect x="5" y="6" width="9" height="9" rx="1.5" fill="var(--teal)" opacity="0.85" />
            <rect x="16" y="15" width="9" height="9" rx="1.5" fill="var(--orange)" opacity="0.9" />
            <path d="M 11 12 L 19 18" stroke="var(--ink-0)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }}>SalesPort × SAP B1</div>
          <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>Integration Console</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: 10, marginBottom: 18, border: '1px solid var(--line)' }}>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Environment</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['prod', 'staging', 'dev'].map((e, i) => (
            <button key={e} className="clickable" style={{
              flex: 1, padding: '5px 0',
              background: i === 0 ? 'var(--bg-3)' : 'transparent',
              border: i === 0 ? '1px solid var(--line-strong)' : '1px solid transparent',
              borderRadius: 5, fontSize: 11, fontWeight: 600,
              color: i === 0 ? 'var(--ink-0)' : 'var(--ink-2)',
              fontFamily: 'inherit', cursor: 'pointer',
            }}>{e}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px 8px' }}>Workspace</div>
        {items.map(it => {
          const IcoComponent = it.ico;
          return (
            <div key={it.id} className={`nav-item ${view === it.id ? 'active' : ''}`} onClick={() => setView(it.id)}>
              <span className="ico"><IcoComponent /></span>
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.badge && (
                <span style={{
                  fontSize: 10, fontFamily: it.badge === 'live' ? 'inherit' : 'var(--font-jetbrains-mono), monospace',
                  fontWeight: 600,
                  color: it.badge === 'live' ? 'var(--teal)' : 'var(--ink-2)',
                  background: it.badge === 'live' ? 'var(--teal-bg)' : 'var(--bg-3)',
                  padding: '1px 6px', borderRadius: 4,
                  letterSpacing: it.badge === 'live' ? '0.04em' : '0',
                }}>{it.badge}</span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 20, fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px 8px' }}>Systems</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SystemCard label="SAP Business One" tag="SOURCE · v10" color="var(--teal-dim)" detail="Basic auth · 142ms" />
        <SystemCard label="SalesPort DMS" tag="TARGET · v1.2" color="var(--orange)" detail="dms.salesport.in" />
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: 10, borderRadius: 8, marginBottom: 8, background: 'var(--bg-2)', border: '1px dashed var(--line)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>BASE URL</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--orange)', wordBreak: 'break-all' }}>http://dms.salesport.in</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 10, color: 'var(--ink-2)' }}>
          <Icons.lock style={{ width: 11, height: 11 }} />
          <span>Basic auth · {AUTH_USER}</span>
        </div>
      </div>

      <UserFooter user={user} onLogout={onLogout} />
    </aside>
  );
}

function UserFooter({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [open, setOpen] = React.useState(false);
  const initials = user?.initial || 'SF';
  const displayName = user?.name || 'Sujal Foods';
  const displayRole = user?.role || 'Tenant · prod';

  return (
    <div style={{ position: 'relative' }}>
      {open && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 4, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', zIndex: 10 }}>
          <MenuItem label="Profile"    icon={<Icons.conn />}    onClick={() => setOpen(false)} />
          <MenuItem label="Settings"   icon={<Icons.modules />} onClick={() => setOpen(false)} />
          <MenuItem label="API tokens" icon={<Icons.lock />}    onClick={() => setOpen(false)} />
          <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
          <MenuItem label="Sign out"   icon={<LogoutIcon />}    danger onClick={() => { setOpen(false); onLogout(); }} />
        </div>
      )}
      <div onClick={() => setOpen(o => !o)} className="clickable" style={{ padding: 10, borderRadius: 8, background: 'var(--bg-2)', border: `1px solid ${open ? 'var(--line-strong)' : 'var(--line)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, var(--violet), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-orange)', fontWeight: 700, fontSize: 11 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayRole}</div>
        </div>
        <Icons.chev style={{ color: 'var(--ink-3)', transform: open ? 'rotate(-90deg)' : 'rotate(90deg)', transition: '0.15s' }} />
      </div>
    </div>
  );
}

function MenuItem({ label, icon, onClick, danger }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <div onClick={onClick} className="clickable" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, color: danger ? 'var(--red)' : 'var(--ink-1)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? 'var(--red-bg)' : 'var(--bg-3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
      <span style={{ color: 'currentColor', display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </div>
  );
}

function LogoutIcon() {
  return (<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M9 3H4a1 1 0 00-1 1v8a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 5l3 3-3 3M14 8H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>);
}

function SystemCard({ label, tag, color, detail }: { label: string; tag: string; color: string; detail: string }) {
  return (
    <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 4, height: 16, borderRadius: 2, background: color }} />
        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--ink-0)' }}>{label}</div>
        <PulseDot />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 12 }}>
        <span style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.08em' }}>{tag}</span>
        <span style={{ fontSize: 10, color: 'var(--ink-2)', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{detail}</span>
      </div>
    </div>
  );
}
