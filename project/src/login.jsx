// Login / Logout screen + auth helpers

// localStorage keys
const AUTH_KEY = 'salesport_auth_v1';

function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setAuthLS(u) {
  if (u) localStorage.setItem(AUTH_KEY, JSON.stringify(u));
  else   localStorage.removeItem(AUTH_KEY);
}

function Login({ onLogin }) {
  const [email, setEmail] = React.useState('admin@sujalfoods.in');
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const recentUsers = [
    { name: 'R. Mehra',  role: 'Integration Lead', email: 'admin@sujalfoods.in',     last: '12 min ago', initial: 'RM' },
    { name: 'K. Iyer',   role: 'SAP B1 Admin',     email: 'kiyer@sujalfoods.in',      last: '2h ago',     initial: 'KI' },
    { name: 'S. Pillai', role: 'DevOps',           email: 'spillai@sortstring.com',   last: 'yesterday',  initial: 'SP' },
  ];

  const submit = (e) => {
    e?.preventDefault?.();
    setError(null);
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      // Find display name from recent users, else use email prefix
      const known = recentUsers.find(u => u.email === email);
      const user = {
        email,
        name: known ? known.name : email.split('@')[0],
        role: known ? known.role : 'User',
        initial: known ? known.initial : email.slice(0,2).toUpperCase(),
        loggedAt: new Date().toISOString(),
        tenant: 'sujal-foods-prod',
      };
      setAuthLS(remember ? user : user); // remember only affects long-term; we store either way for session
      setLoading(false);
      onLogin(user);
    }, 700);
  };

  const quickPick = (u) => {
    setEmail(u.email);
    setPassword('••••••••');
  };

  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'grid',
      gridTemplateColumns: '1.05fr 1fr', background: 'var(--bg-0)',
      overflow: 'hidden',
    }}>
      {/* LEFT PANE — brand / system mural */}
      <LoginBrandPane />

      {/* RIGHT PANE — form */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: 'var(--bg-1)', borderLeft: '1px solid var(--line)' }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
              <Icons.lock style={{ width: 11, height: 11 }} /> SECURE SIGN-IN
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink-0)' }}>
              Welcome back
            </h1>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>
              Sign in to the SAP B1 ↔ SalesPort DMS Integration Console.
              <br />Tenant: <span className="mono" style={{ color: 'var(--orange)' }}>sujal-foods-prod</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <LoginField label="Email" autoFocus>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@sujalfoods.in"
                autoComplete="email"
                style={loginInputStyle()}
              />
            </LoginField>

            <LoginField label="Password" right={
              <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600, textDecoration: 'none' }}>Forgot?</a>
            }>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={loginInputStyle()}
              />
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
            {loading ? <>
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
              Authenticating…
            </> : <>Sign in <Icons.arrow /></>}
          </button>

          {/* SSO Options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink-3)', fontSize: 11, margin: '4px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span>OR CONTINUE WITH</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" className="btn" style={{ height: 36, justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: 'linear-gradient(135deg,#1976d2,#0d47a1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 9 }}>S</span>
              SAML SSO
            </button>
            <button type="button" className="btn" style={{ height: 36, justifyContent: 'center', gap: 8 }}>
              <Icons.lock /> mTLS Cert
            </button>
          </div>

          {/* Recent users */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Recent on this device</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentUsers.map(u => (
                <button key={u.email} type="button" onClick={() => quickPick(u)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 6,
                  background: 'transparent', border: '1px solid var(--line)',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, var(--violet), var(--blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-orange)', fontWeight: 700, fontSize: 10 }}>{u.initial}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)' }}>{u.name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{u.email}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{u.last}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'center', marginTop: 6, lineHeight: 1.5 }}>
            By signing in you agree to the integration use policy.<br />
            Need access? Email <span className="mono" style={{ color: 'var(--orange)' }}>info@sortstring.com</span>
          </div>
        </form>
      </div>
    </div>
  );
}

function loginInputStyle() {
  return {
    width: '100%', padding: '10px 12px', height: 38,
    background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 7,
    color: 'var(--ink-0)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
  };
}

function LoginField({ label, right, children }) {
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

// Decorative brand pane — shows the same pipeline metaphor with dim/animated nodes
function LoginBrandPane() {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(155deg, var(--bg-1) 0%, var(--bg-0) 60%, var(--bg-2) 100%)',
      display: 'flex', flexDirection: 'column', padding: 40,
    }}>
      <svg width="100%" height="100%" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, opacity: 0.32 }}>
        <defs>
          <linearGradient id="lg1" x1="0" x2="1"><stop offset="0" stopColor="var(--teal)" stopOpacity="0.5" /><stop offset="1" stopColor="var(--orange)" stopOpacity="0.5" /></linearGradient>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" stroke="var(--line)" strokeWidth="1" fill="none"/>
          </pattern>
        </defs>
        <rect width="600" height="800" fill="url(#grid)" />
        {/* Source nodes */}
        {[180, 280, 380, 480].map((y, i) => (
          <g key={'l'+i}>
            <circle cx="80" cy={y} r="22" fill="var(--bg-2)" stroke="var(--teal)" strokeWidth="1.5" />
            <path d={`M 102 ${y} C 180 ${y}, 220 400, 300 400`} stroke="url(#lg1)" strokeWidth="1.5" fill="none" strokeDasharray="6 6">
              <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="1.6s" repeatCount="indefinite" />
            </path>
          </g>
        ))}
        {/* Engine */}
        <rect x="280" y="360" width="120" height="80" rx="10" fill="var(--bg-2)" stroke="var(--orange)" strokeWidth="1.5" />
        <text x="340" y="400" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="var(--orange)" textAnchor="middle" fontWeight="700">MAPPER</text>
        <text x="340" y="416" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="var(--ink-2)" textAnchor="middle">v1.2</text>
        {/* Target nodes */}
        {[180, 280, 380, 480].map((y, i) => (
          <g key={'r'+i}>
            <path d={`M 400 400 C 480 400, 520 ${y}, 520 ${y}`} stroke="url(#lg1)" strokeWidth="1.5" fill="none" strokeDasharray="6 6">
              <animate attributeName="stroke-dashoffset" from="-24" to="0" dur="1.6s" repeatCount="indefinite" />
            </path>
            <circle cx="540" cy={y} r="22" fill="var(--bg-2)" stroke="var(--orange)" strokeWidth="1.5" />
          </g>
        ))}
      </svg>

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--bg-2)', border: '1px solid var(--line-strong)', position: 'relative' }}>
          <svg width="36" height="36" viewBox="0 0 36 36" style={{ position: 'absolute', inset: 0 }}>
            <rect x="6" y="7" width="11" height="11" rx="2" fill="var(--teal)" opacity="0.85" />
            <rect x="19" y="18" width="11" height="11" rx="2" fill="var(--orange)" opacity="0.9" />
            <path d="M 13 14 L 23 22" stroke="var(--ink-0)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-0)', letterSpacing: '-0.01em' }}>SalesPort × SAP B1</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Integration Console</div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', maxWidth: 360, lineHeight: 1.5, marginBottom: 16 }}>
          One pane of glass for every API call between SAP Business One and SalesPort DMS — with field mapping, validation, replay, and full request/response audit.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <BrandStat label="Modules" value="16" />
          <BrandStat label="Endpoints" value="30" />
          <BrandStat label="Field maps" value="148" />
          <BrandStat label="Spec" value="v1.2" />
        </div>
      </div>
    </div>
  );
}

function BrandStat({ label, value }) {
  return (
    <div style={{ padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, minWidth: 80 }}>
      <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-0)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

Object.assign(window, { Login, getAuth, setAuthLS, AUTH_KEY });
