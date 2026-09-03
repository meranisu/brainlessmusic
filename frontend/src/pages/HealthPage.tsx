import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { HealthSnapshot } from '../types/api';

const POLL_INTERVAL_MS = 10_000;

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const STATUS_STYLES: Record<HealthSnapshot['status'], string> = {
  ok: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  degraded: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

export function HealthPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthSnapshot>('/admin/health'),
    refetchInterval: POLL_INTERVAL_MS,
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">Stream health</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 disabled:opacity-50"
        >
          {isFetching ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {isError && (
        <p className="text-sm text-red-400">
          Couldn't reach the server — that's a "down" signal in itself.
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${STATUS_STYLES[data.status]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {data.status === 'ok' ? 'All good' : 'Degraded'}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-500">Active streams</p>
              <p className="mt-1 text-2xl font-semibold text-neutral-100">{data.activeStreams}</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-500">Uptime</p>
              <p className="mt-1 text-2xl font-semibold text-neutral-100">{formatUptime(data.uptimeSeconds)}</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-500">Recent errors</p>
              <p className="mt-1 text-2xl font-semibold text-neutral-100">{data.recentErrors.length}</p>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-800 text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Track</th>
                  <th className="px-3 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {data.recentErrors.map((e, i) => (
                  <tr key={i} className="border-b border-neutral-900">
                    <td className="px-3 py-2 text-neutral-400">{new Date(e.timestamp).toLocaleString()}</td>
                    <td className="px-3 py-2 text-neutral-400">#{e.trackId}</td>
                    <td className="px-3 py-2 text-neutral-300">{e.message}</td>
                  </tr>
                ))}
                {data.recentErrors.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-neutral-500">
                      No errors recently — good sign.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
