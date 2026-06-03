'use client';
import React from 'react';
import { Icons, Chip, Stat, ViewHeader, Status, Method } from '@/components';
import { MODULE_BY_ID } from '@/data';
import { useApi } from '@/lib/useApi';
import { console_ } from '@/lib/api';
import { relTimeNow } from '@/lib/adapters';

export default function SyncQueue() {
  const { data, loading, error, refetch } = useApi(() => console_.queue(), [], { pollMs: 4000 });
  const recent = data?.recent || [];
  const completed1h = recent.filter(r => Date.now() - new Date(r.created_at).getTime() < 3_600_000).length;
  const failed = recent.filter(r => r.status_code >= 400).length;

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <ViewHeader
        title="Sync Queue"
        sub="Each SAP push moves through validate → mapping → persist synchronously. State lives in sap_sync_logs."
        actions={
          <>
            {error ? <Chip kind="err" dot>backend offline</Chip> : <Chip kind="ok" dot>{loading ? 'loading' : 'live'}</Chip>}
            <button className="btn" onClick={refetch}><Icons.refresh /> Refresh</button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Completed · 1h" value={String(completed1h)} sub="last hour" />
        <Stat label="Failed"         value={String(failed)} accent={failed > 0 ? 'var(--amber)' : undefined} sub="status ≥ 400" />
        <Stat label="Total tracked"  value={String(recent.length)} sub="visible in this view" />
      </div>

      <div className="card">
        <div className="hd">
          <h3>Recently completed</h3>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{recent.length} jobs</span>
        </div>
        <table className="t">
          <thead><tr>
            <th>Job ID</th><th>Module</th><th>Path</th><th>Status</th><th>Duration</th><th>When</th><th>Outcome</th>
          </tr></thead>
          <tbody>
            {recent.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
                No completed jobs yet.
              </td></tr>
            )}
            {recent.map(j => {
              const mod = MODULE_BY_ID[j.module_id];
              return (
                <tr key={j.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{j.job_id}</td>
                  <td><span className="mono" style={{ fontSize: 11, color: 'var(--orange)' }}>{mod?.code || ''}</span> <span style={{ fontSize: 11.5 }}>{mod?.label || j.module_id}</span></td>
                  <td><Method m={j.method} /> <span className="mono" style={{ color: 'var(--ink-1)', fontSize: 11 }}>{j.path}</span></td>
                  <td><Status code={j.status_code} /></td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{j.duration_ms}ms</td>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{relTimeNow(new Date(j.created_at))}</td>
                  <td>
                    {j.status_code < 400 && <Chip kind="ok" dot>completed</Chip>}
                    {j.status_code >= 400 && j.status_code < 500 && <Chip kind="warn" dot>{j.error_message || 'rejected'}</Chip>}
                    {j.status_code >= 500 && <Chip kind="err" dot>{j.error_message || 'failed'}</Chip>}
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

