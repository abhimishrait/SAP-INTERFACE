// Small reusable bits

function Chip({ kind='', children, dot=false }) {
  return (
    <span className={`chip ${kind}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

function Method({ m }) { return <span className={`method ${m}`}>{m}</span>; }

function Status({ code }) {
  const c = String(code)[0];
  return <span className={`status s${c}`}>{code}</span>;
}

function PulseDot({ color='var(--teal)' }) {
  return <span className="pulse-dot" style={{ background: color }} />;
}

// JSON syntax highlighter (very small, handles our sample payloads)
function highlightJson(src) {
  return src
    .replace(/(&)/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span class="tok-key">$1</span><span class="tok-punc">$2</span>')
    .replace(/("(?:\\.|[^"\\])*")(?!\s*:)/g, '<span class="tok-str">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="tok-num">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="tok-bool">$1</span>')
    .replace(/\bnull\b/g, '<span class="tok-null">null</span>')
    .replace(/([{}\[\],])/g, '<span class="tok-punc">$1</span>');
}

function JsonBlock({ src, style }) {
  return <pre className="code" style={style} dangerouslySetInnerHTML={{ __html: highlightJson(src) }} />;
}

function HttpHeadersBlock({ src }) {
  // first line bold-ish
  const lines = src.split('\n');
  return (
    <pre className="code" style={{ background: 'var(--code-bg-2)' }}>
      {lines.map((l, i) => {
        if (i===0) return <div key={i} style={{ color: 'var(--orange)' }}>{l}</div>;
        const idx = l.indexOf(':');
        if (idx === -1) return <div key={i}>{l}</div>;
        return (
          <div key={i}>
            <span className="tok-key">{l.slice(0, idx)}</span>
            <span className="tok-punc">:</span>
            <span style={{ color: 'var(--ink-1)' }}>{l.slice(idx+1)}</span>
          </div>
        );
      })}
    </pre>
  );
}

// Stat tile
function Stat({ label, value, sub, accent, trend, icon }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ color: 'var(--ink-2)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </div>
        {icon}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: accent || 'var(--ink-0)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.01em' }}>
          {value}
        </div>
        {trend && (
          <span style={{ fontSize: 11, color: trend.startsWith('+') ? 'var(--teal)' : trend.startsWith('-') ? 'var(--red)' : 'var(--ink-2)', fontWeight: 600 }}>
            {trend}
          </span>
        )}
      </div>
      {sub && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-2)' }}>{sub}</div>}
    </div>
  );
}

// Sparkline (deterministic, decorative)
function Sparkline({ seed=1, w=120, h=32, stroke='var(--teal)', fill=true }) {
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const v = (Math.sin((i+seed)*0.7)+Math.cos((i+seed*2)*0.4))*0.5 + 0.5;
    const x = (i/23)*w;
    const y = h - (v*0.7 + 0.15)*h;
    pts.push([x,y]);
  }
  const d = pts.map((p,i) => `${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const dFill = `${d} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`sg${seed}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={dFill} fill={`url(#sg${seed})`} />}
      <path d={d} stroke={stroke} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// Bar chart (24h, deterministic)
function BarChart({ seed=1, h=120, color='var(--teal)' }) {
  const bars = [];
  for (let i = 0; i < 48; i++) {
    const v = (Math.sin((i+seed)*0.5)+Math.cos((i+seed*1.7)*0.3)+2)/4;
    bars.push(0.15 + v*0.85);
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: h }}>
      {bars.map((b, i) => (
        <div key={i} style={{
          flex: 1, height: `${b*100}%`,
          background: i === bars.length-1 ? 'var(--orange)' : color,
          opacity: i === bars.length-1 ? 1 : 0.45 + b*0.4,
          borderRadius: '2px 2px 0 0',
          minWidth: 2,
        }} />
      ))}
    </div>
  );
}

// Topbar
function TopBar({ theme, setTheme, onCommand }) {
  return (
    <div style={{
      height: 52, flexShrink: 0,
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg-0)',
      display: 'flex', alignItems: 'center',
      padding: '0 22px', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        <Chip kind="ok" dot>LIVE</Chip>
        <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>Tenant</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ink-0)' }}>sujal-foods-prod</span>
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>Region</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ink-0)' }}>ap-south-1</span>
      </div>

      <div style={{ flex: 1, maxWidth: 480, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }}>
          <Icons.search />
        </div>
        <input
          placeholder="Search txn id, distributor, customer_code, DO #…"
          style={{
            width: '100%', padding: '8px 12px 8px 34px',
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            borderRadius: 8, color: 'var(--ink-0)', fontSize: 12.5,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <span style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ink-3)',
          background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4,
        }}>⌘K</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn ghost" title={`Switch to ${theme==='dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme && setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Icons.sun /> : <Icons.moon />}
        </button>
        <button className="btn ghost" style={{ position: 'relative' }}>
          <Icons.bell />
          <span style={{ position: 'absolute', top: 4, right: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--orange)' }} />
        </button>
        <button className="btn" onClick={() => onCommand && onCommand('replay')}>
          <Icons.refresh /> Replay DLQ
        </button>
        <button className="btn primary">
          <Icons.play /> Run Pipeline
        </button>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--orange), var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-orange)', fontWeight: 700, fontSize: 12 }}>SF</div>
      </div>
    </div>
  );
}


Object.assign(window, {
  Chip, Method, Status, PulseDot, highlightJson, JsonBlock, HttpHeadersBlock,
  Stat, Sparkline, BarChart, TopBar,
});
