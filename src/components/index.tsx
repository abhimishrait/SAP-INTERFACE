'use client';
import React from 'react';

export const Icons: Record<string, (p?: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
  overview: (p) => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/></svg>),
  modules: (p) => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}><rect x="2" y="2" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="10" y="2" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="6" y="10" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4 6v2M12 6v2M8 8v2" stroke="currentColor" strokeWidth="1.4"/></svg>),
  mapping: (p) => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}><circle cx="3" cy="4" r="1.4" stroke="currentColor" strokeWidth="1.4"/><circle cx="3" cy="12" r="1.4" stroke="currentColor" strokeWidth="1.4"/><circle cx="13" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.4"/><path d="M4.2 4.5L11.6 7.4M4.2 11.5L11.6 8.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>),
  logs: (p) => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}><path d="M3 3h10M3 6h10M3 9h7M3 12h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>),
  queue: (p) => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}><rect x="2" y="3" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="2" y="10" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="4" y="6.5" width="8" height="3" rx="1" stroke="currentColor" strokeWidth="1.4"/></svg>),
  db: (p) => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}><ellipse cx="8" cy="3.5" rx="5" ry="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 3.5v9c0 .83 2.24 1.5 5 1.5s5-.67 5-1.5v-9" stroke="currentColor" strokeWidth="1.4"/><path d="M3 8c0 .83 2.24 1.5 5 1.5s5-.67 5-1.5" stroke="currentColor" strokeWidth="1.4"/></svg>),
  conn: (p) => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}><path d="M5 5l-2 2a2.5 2.5 0 003.5 3.5l2-2M11 11l2-2a2.5 2.5 0 00-3.5-3.5l-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>),
  tester: (p) => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}><path d="M3 13l4-4 3 3 3-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="13" cy="5" r="1.4" fill="currentColor"/><path d="M2 2h12" stroke="currentColor" strokeWidth="1" opacity="0.3"/></svg>),
  send: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M2 8L14 2l-4 12-3-5-5-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity="0.2"/></svg>),
  copy: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M3 11V3a1 1 0 011-1h7" stroke="currentColor" strokeWidth="1.4"/></svg>),
  sun: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>),
  moon: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M13 9a5 5 0 11-6-6 4 4 0 006 6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>),
  search: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>),
  bell: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M4 6.5a4 4 0 118 0V9l1 2H3l1-2V6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4"/></svg>),
  arrow: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  check: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  x: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>),
  play: (p) => (<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" {...p}><path d="M4 3l9 5-9 5z"/></svg>),
  pause: (p) => (<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" {...p}><rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/></svg>),
  refresh: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M13 8a5 5 0 11-1.5-3.5L13 6V3M13 6h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  download: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M8 2v8m-3-3l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  filter: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><path d="M2 3h12l-4.5 6V13L6.5 11V9L2 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>),
  chev: (p) => (<svg width="10" height="10" viewBox="0 0 16 16" fill="none" {...p}><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  dot: (p) => (<svg width="4" height="4" viewBox="0 0 4 4" {...p}><circle cx="2" cy="2" r="2" fill="currentColor"/></svg>),
  lock: (p) => (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}><rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.4"/></svg>),
};

export function Chip({ kind = '', children, dot = false }: { kind?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`chip ${kind}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function Method({ m }: { m: string }) {
  return <span className={`method ${m}`}>{m}</span>;
}

export function Status({ code }: { code: number }) {
  const c = String(code)[0];
  return <span className={`status s${c}`}>{code}</span>;
}

export function PulseDot({ color = 'var(--teal)' }: { color?: string }) {
  return <span className="pulse-dot" style={{ background: color }} />;
}

export function highlightJson(src: string): string {
  // Escape first, then do ALL token replacements in a single pass so the
  // injected `<span class="tok-*">` markup isn't re-scanned by later
  // passes — otherwise the class-name strings ("tok-key", "tok-punc"…)
  // get matched by the string regex and the output becomes broken HTML
  // that renders as literal `"tok-key">"card_code"…` text.
  const escaped = src
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+\.?\d*)|([{}\[\],])/g,
    (_m, str, colon, kw, num, punct) => {
      if (str !== undefined) {
        return colon
          ? `<span class="tok-key">${str}</span><span class="tok-punc">${colon}</span>`
          : `<span class="tok-str">${str}</span>`;
      }
      if (kw) return `<span class="tok-${kw === 'null' ? 'null' : 'bool'}">${kw}</span>`;
      if (num !== undefined) return `<span class="tok-num">${num}</span>`;
      if (punct) return `<span class="tok-punc">${punct}</span>`;
      return _m;
    }
  );
}

export function JsonBlock({ src, style }: { src: string; style?: React.CSSProperties }) {
  return <pre className="code" style={style} dangerouslySetInnerHTML={{ __html: highlightJson(src) }} />;
}

export function HttpHeadersBlock({ src }: { src: string }) {
  const lines = src.split('\n');
  return (
    <pre className="code" style={{ background: 'var(--code-bg-2)' }}>
      {lines.map((l, i) => {
        if (i === 0) return <div key={i} style={{ color: 'var(--orange)' }}>{l}</div>;
        const idx = l.indexOf(':');
        if (idx === -1) return <div key={i}>{l}</div>;
        return (
          <div key={i}>
            <span className="tok-key">{l.slice(0, idx)}</span>
            <span className="tok-punc">:</span>
            <span style={{ color: 'var(--ink-1)' }}>{l.slice(idx + 1)}</span>
          </div>
        );
      })}
    </pre>
  );
}

export function Stat({ label, value, sub, accent, trend, icon }: {
  label: string; value: string | number; sub?: React.ReactNode;
  accent?: string; trend?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ color: 'var(--ink-2)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </div>
        {icon}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: accent || 'var(--ink-0)', fontFamily: 'var(--font-jetbrains-mono), monospace', letterSpacing: '-0.01em' }}>
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

export function Sparkline({ seed = 1, w = 120, h = 32, stroke = 'var(--teal)', fill = true }: {
  seed?: number; w?: number; h?: number; stroke?: string; fill?: boolean;
}) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const v = (Math.sin((i + seed) * 0.7) + Math.cos((i + seed * 2) * 0.4)) * 0.5 + 0.5;
    const x = (i / 23) * w;
    const y = h - (v * 0.7 + 0.15) * h;
    pts.push([x, y]);
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
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

export function BarChart({ seed = 1, h = 120, color = 'var(--teal)', bars: realBars, accent }: {
  seed?: number; h?: number; color?: string;
  bars?: number[];     // real, raw counts; component normalizes against max
  accent?: number[];   // optional secondary series (e.g. PUT counts) stacked above
}) {
  let bars: number[];
  let stack: number[] | null = null;
  if (realBars && realBars.length) {
    const peak = Math.max(1, ...(accent ? realBars.map((b, i) => b + (accent[i] || 0)) : realBars));
    bars = realBars.map(b => b / peak);
    stack = accent ? accent.map(b => b / peak) : null;
  } else {
    bars = [];
    for (let i = 0; i < 48; i++) {
      const v = (Math.sin((i + seed) * 0.5) + Math.cos((i + seed * 1.7) * 0.3) + 2) / 4;
      bars.push(0.15 + v * 0.85);
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: h }}>
      {bars.map((b, i) => (
        <div key={i} style={{
          flex: 1, height: `${Math.max(b, stack?.[i] ? 0 : 0) * 100}%`,
          display: 'flex', flexDirection: 'column-reverse', minWidth: 2,
        }}>
          <div style={{
            height: `${b * 100}%`,
            background: i === bars.length - 1 ? 'var(--orange)' : color,
            opacity: i === bars.length - 1 ? 1 : 0.45 + b * 0.4,
            borderRadius: stack && stack[i] ? '0' : '2px 2px 0 0',
          }} />
          {stack && stack[i] > 0 && (
            <div style={{
              height: `${stack[i] * 100}%`,
              background: 'var(--orange)', opacity: 0.85,
              borderRadius: '2px 2px 0 0',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function TopBar({ theme, setTheme, env = 'staging' }: { theme: string; setTheme: (t: string) => void; env?: string }) {
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
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn ghost" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Icons.sun /> : <Icons.moon />}
        </button>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--orange), var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-orange)', fontWeight: 700, fontSize: 12 }}>SF</div>
      </div>
    </div>
  );
}

export function SubHd({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
      {children}
    </div>
  );
}

export function ViewHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22, gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>{title}</h1>
        {sub && <div style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 4 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{actions}</div>
    </div>
  );
}
