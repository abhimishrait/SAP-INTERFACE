'use client';
import React from 'react';
import { Icons } from '@/components';

const AUTH_KEY = 'salesport_auth_v1';

export type AuthUser = {
  email: string;
  name: string;
  role: string;
  initial: string;
  loggedAt: string;
  tenant: string;
};

export function getAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setAuthLS(u: AuthUser | null) {
  if (u) localStorage.setItem(AUTH_KEY, JSON.stringify(u));
  else localStorage.removeItem(AUTH_KEY);
}

export default function Login({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const [email, setEmail] = React.useState('admin@sujalfoods.in');
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const recentUsers = [
    { name: 'R. Mehra',  role: 'Integration Lead', email: 'admin@sujalfoods.in',   last: '12 min ago', initial: 'RM' },
    { name: 'K. Iyer',   role: 'SAP Admin',     email: 'kiyer@sujalfoods.in',    last: '2h ago',     initial: 'KI' },
    { name: 'S. Pillai', role: 'DevOps',           email: 'spillai@sortstring.com', last: 'yesterday',  initial: 'SP' },
  ];

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!email || !password) { setError('Please enter both email and password.'); return; }
    setLoading(true);
    setTimeout(() => {
      const known = recentUsers.find(u => u.email === email);
      const user: AuthUser = {
        email,
        name: known ? known.name : email.split('@')[0],
        role: known ? known.role : 'User',
        initial: known ? known.initial : email.slice(0, 2).toUpperCase(),
        loggedAt: new Date().toISOString(),
        tenant: 'sujal-foods-prod',
      };
      setAuthLS(user);
      setLoading(false);
      onLogin(user);
    }, 700);
  };

  const quickPick = (u: typeof recentUsers[0]) => {
    setEmail(u.email);
    setPassword('••••••••');
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'grid', gridTemplateColumns: '1.05fr 1fr', background: 'var(--bg-0)', overflow: 'hidden' }}>
      <LoginBrandPane />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: 'var(--bg-1)', borderLeft: '1px solid var(--line)' }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
              <Icons.lock style={{ width: 11, height: 11 }} /> SECURE SIGN-IN
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink-0)' }}>Welcome back</h1>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>
              Sign in to the SAP ↔ SalesPort DMS Integration Console.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <LoginField label="Email">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@sujalfoods.in" autoComplete="email" style={inputStyle()} />
            </LoginField>
            <LoginField label="Password">
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password" style={inputStyle()} />
            </LoginField>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-1)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ accentColor: 'var(--orange)' }} />
              Keep me signed in for 30 days
            </label>
          </div>

          {error && (
            <div style={{ padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn primary" style={{ height: 40, fontSize: 13, fontWeight: 700, justifyContent: 'center' }}>
            {loading ? (
              <><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} /> Authenticating…</>
            ) : (
              <>Sign in <Icons.arrow /></>
            )}
          </button>

        </form>
      </div>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return { width: '100%', padding: '10px 12px', height: 38, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 7, color: 'var(--ink-0)', fontSize: 13, outline: 'none', fontFamily: 'inherit' };
}

function LoginField({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <label style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</label>
        {right}
      </div>
      {children}
    </div>
  );
}

function LoginBrandPane() {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(155deg, var(--bg-1) 0%, var(--bg-0) 60%, var(--bg-2) 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 40,
    }}>
      {/* Subtle background grid + decorative connector graphic, faded so the title is the hero. */}
      <svg width="100%" height="100%" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, opacity: 0.18 }}>
        <defs>
          <linearGradient id="lg1" x1="0" x2="1">
            <stop offset="0" stopColor="var(--teal)" stopOpacity="0.5" />
            <stop offset="1" stopColor="var(--orange)" stopOpacity="0.5" />
          </linearGradient>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" stroke="var(--line)" strokeWidth="1" fill="none" />
          </pattern>
        </defs>
        <rect width="600" height="600" fill="url(#grid)" />
        {[200, 300, 400].map((y, i) => (
          <g key={'l' + i}>
            <circle cx="120" cy={y} r="14" fill="var(--bg-2)" stroke="var(--teal)" strokeWidth="1.5" />
            <path d={`M 134 ${y} C 200 ${y}, 230 300, 280 300`} stroke="url(#lg1)" strokeWidth="1.5" fill="none" strokeDasharray="6 6">
              <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="1.6s" repeatCount="indefinite" />
            </path>
          </g>
        ))}
        {[200, 300, 400].map((y, i) => (
          <g key={'r' + i}>
            <path d={`M 320 300 C 370 300, 400 ${y}, 460 ${y}`} stroke="url(#lg1)" strokeWidth="1.5" fill="none" strokeDasharray="6 6">
              <animate attributeName="stroke-dashoffset" from="-24" to="0" dur="1.6s" repeatCount="indefinite" />
            </path>
            <circle cx="476" cy={y} r="14" fill="var(--bg-2)" stroke="var(--orange)" strokeWidth="1.5" />
          </g>
        ))}
      </svg>

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 64, height: 64, borderRadius: 14, background: 'var(--bg-2)', border: '1px solid var(--line-strong)', position: 'relative', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
          <svg width="64" height="64" viewBox="0 0 36 36" style={{ position: 'absolute', inset: 0 }}>
            <rect x="6" y="7" width="11" height="11" rx="2" fill="var(--teal)" opacity="0.85" />
            <rect x="19" y="18" width="11" height="11" rx="2" fill="var(--orange)" opacity="0.9" />
            <path d="M 13 14 L 23 22" stroke="var(--ink-0)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 38, fontWeight: 800, color: 'var(--ink-0)', letterSpacing: '-0.025em', lineHeight: 1.05 }}>Integrator</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 8 }}>SAP ⇄ SalesPort DMS</div>
        </div>
      </div>
    </div>
  );
}
