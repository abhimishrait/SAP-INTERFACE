// Sync Queue view

function SyncQueue() {
  const running = QUEUE_JOBS.filter(j => j.stage !== 'queued');
  const queued = QUEUE_JOBS.filter(j => j.stage === 'queued');

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Header
        title="Sync Queue"
        sub="Each job moves SAP B1 payload through validation → mapping → DMS persist. State is durable in sync_jobs."
        actions={
          <>
            <button className="btn"><Icons.pause /> Pause queue</button>
            <button className="btn primary"><Icons.play /> + New job</button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Running"   value="3" sub="avg 38s wall-time" />
        <Stat label="Queued"    value="3" sub="ETA 06m 12s clear" />
        <Stat label="Completed · 1h" value="412" trend="+12%" />
        <Stat label="Failed · DLQ" value="14" accent="var(--amber)" sub="auto-retry · max 3" />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd">
          <div>
            <h3>Active jobs</h3>
            <div className="sub">5-stage pipeline: queued → mapping → validate → transform → persist.</div>
          </div>
          <Chip kind="ok" dot>3 workers online</Chip>
        </div>
        <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {running.map(j => <JobRow key={j.id} job={j} live />)}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd">
          <h3>Queued · waiting for worker</h3>
          <span style={{ fontSize: 11, color: 'var(--ink-2)' }} className="mono">{queued.length} jobs</span>
        </div>
        <table className="t">
          <thead><tr>
            <th>Job ID</th><th>Name</th><th>Module</th><th>Priority</th><th>Size</th><th>ETA</th><th></th>
          </tr></thead>
          <tbody>
            {queued.map(j => {
              const mod = MODULE_BY_ID[j.moduleId];
              return (
                <tr key={j.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{j.id}</td>
                  <td>{j.name}</td>
                  <td><span className="mono" style={{ fontSize: 11, color: 'var(--orange)' }}>{mod.code}</span> <span style={{ fontSize: 11.5 }}>{mod.label}</span></td>
                  <td><PriorityChip p={j.priority} /></td>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{j.size} rows</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{j.eta}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn ghost" style={{ padding: '4px 8px' }}>Promote</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="hd">
          <h3>Recently completed</h3>
          <button className="btn ghost"><Icons.refresh /> Replay all failed</button>
        </div>
        <table className="t">
          <thead><tr>
            <th>Job ID</th><th>Name</th><th>Module</th><th>Size</th><th>Duration</th><th>Outcome</th>
          </tr></thead>
          <tbody>
            {QUEUE_RECENT.map(j => {
              const mod = MODULE_BY_ID[j.moduleId];
              return (
                <tr key={j.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{j.id}</td>
                  <td>{j.name}</td>
                  <td><span className="mono" style={{ fontSize: 11, color: 'var(--orange)' }}>{mod.code}</span> <span style={{ fontSize: 11.5 }}>{mod.label}</span></td>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{j.size} rows</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{j.dur}</td>
                  <td>
                    {j.stage === 'completed' && <Chip kind="ok" dot>completed</Chip>}
                    {j.stage === 'failed'    && <Chip kind="err" dot>{j.err}</Chip>}
                    {j.stage === 'partial'   && <Chip kind="warn" dot>{j.err}</Chip>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JobRow({ job, live }) {
  const stages = ['queued','mapping','validate','transform','persist'];
  const curIdx = stages.indexOf(job.stage);
  const mod = MODULE_BY_ID[job.moduleId];
  return (
    <div style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{job.id}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)', flex: 1 }}>{job.name}</span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--orange)' }}>{mod.code} {mod.label}</span>
        <PriorityChip p={job.priority} />
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{job.size} rows · ETA {job.eta}</span>
        {live && <Chip kind="ok" dot>running</Chip>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {stages.map((s, i) => (
          <div key={s} style={{
            padding: '7px 8px', borderRadius: 6,
            background: i < curIdx ? 'var(--bg-3)' : i === curIdx ? 'var(--orange-bg)' : 'var(--bg-1)',
            border: `1px solid ${i === curIdx ? 'var(--orange)' : 'var(--line)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: i <= curIdx ? 'var(--ink-0)' : 'var(--ink-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {i < curIdx ? <Icons.check style={{ color: 'var(--teal)', width: 11, height: 11 }} />
                : i === curIdx ? <PulseDot color="var(--orange)" />
                : <span style={{ width: 8, height: 8, borderRadius: '50%', border: '1px solid var(--ink-3)' }} />}
              {s}
            </div>
            {i === curIdx && (
              <div style={{ marginTop: 6 }}>
                <div className="prog"><div style={{ width: `${job.progress}%` }} /></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PriorityChip({ p }) {
  const c = p==='high' ? 'var(--red)' : p==='normal' ? 'var(--ink-1)' : 'var(--ink-3)';
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: c }}>
      {p}
    </span>
  );
}

Object.assign(window, { SyncQueue });
