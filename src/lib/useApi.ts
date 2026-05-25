'use client';
import React from 'react';
import { ApiError } from './api';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Fetch on mount + on `deps` change. Optionally polls every `pollMs`.
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
  opts: { pollMs?: number } = {}
): ApiState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    fetcher()
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(e => {
        if (!alive) return;
        const msg = e instanceof ApiError ? `${e.status}: ${typeof e.body === 'object' ? JSON.stringify(e.body) : e.message}` : (e?.message || 'Request failed');
        setError(msg);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  React.useEffect(() => {
    if (!opts.pollMs) return;
    const id = setInterval(() => setTick(t => t + 1), opts.pollMs);
    return () => clearInterval(id);
  }, [opts.pollMs]);

  const refetch = React.useCallback(() => setTick(t => t + 1), []);
  return { data, loading, error, refetch };
}
