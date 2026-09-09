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
  ok: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  degraded: 'bg-orange-600/10 text-orange-500 border-orange-600/30',
};

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-blue-300">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

export function HealthPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthSnapshot>('/admin/health'),
    refetchInterval: POLL_INTERVAL_MS,
  });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Stream health</h1>
          <p className="mt-0.5 text-sm text-blue-300">Auto-refreshes every 10s.</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary btn-sm">
          {isFetching ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {isLoading && (
        <div className="card flex items-center justify-center py-16 text-sm text-blue-300">Loading…</div>
      )}
      {isError && (
        <div className="card flex items-center justify-center py-16 text-sm text-red-400">
          Couldn't reach the server — that's a "down" signal in itself.
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${STATUS_STYLES[data.status]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {data.status === 'ok' ? 'All good' : 'Degraded'}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Active streams" value={data.activeStreams} />
            <StatTile label="Transcoding" value={data.activeTranscodes} />
            <StatTile label="Uptime" value={formatUptime(data.uptimeSeconds)} />
            <StatTile label="Recent errors" value={data.recentErrors.length} />
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-blue-800">
                <tr className="text-xs uppercase tracking-wide text-blue-400">
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Track</th>
                  <th className="px-4 py-2.5 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-800/60">
                {data.recentErrors.map((e, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-blue-200">{new Date(e.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-blue-200">#{e.trackId}</td>
                    <td className="px-4 py-2.5 text-blue-100">{e.message}</td>
                  </tr>
                ))}
                {data.recentErrors.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-blue-300">
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
