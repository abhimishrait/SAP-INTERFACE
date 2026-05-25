'use client';
import React from 'react';
import { Icons } from '@/components';
import type { AuthUser } from '@/views/Login';

export default function Sidebar({ view, setView, user, onLogout, env, setEnv }: {
  view: string;
  setView: (v: string) => void;
  user: AuthUser;
  onLogout: () => void;
  env: string;
  setEnv: (e: string) => void;
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
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.1 }}>Integrator</div>
          <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>SAP ⇄ DMS</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: 10, marginBottom: 18, border: '1px solid var(--line)' }}>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Environment</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['prod', 'staging', 'dev'].map((e) => {
            const active = env === e;
            return (
              <button key={e} onClick={() => setEnv(e)} className="clickable" style={{
                flex: 1, padding: '5px 0',
                background: active ? 'var(--bg-3)' : 'transparent',
                border: active ? '1px solid var(--line-strong)' : '1px solid transparent',
                borderRadius: 5, fontSize: 11, fontWeight: 600,
                color: active ? 'var(--ink-0)' : 'var(--ink-2)',
                fontFamily: 'inherit', cursor: 'pointer',
              }}>{e}</button>
            );
          })}
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

      <div style={{ flex: 1 }} />

      <UserFooter user={user} onLogout={onLogout} env={env} />
    </aside>
  );
}

function UserFooter({ user, onLogout, env }: { user: AuthUser; onLogout: () => void; env: string }) {
  const [open, setOpen] = React.useState(false);
  const initials = user?.initial || 'SF';
  const displayName = user?.name || 'Sujal Foods';
  const displayRole = user?.role || `Tenant · ${env}`;

  return (
    <div style={{ position: 'relative' }}>
      {open && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 4, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', zIndex: 10 }}>
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

