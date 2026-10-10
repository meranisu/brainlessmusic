import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../lib/apiClient';
import { formatBytes, formatTotalLength } from '../lib/format';
import type { LibraryStats } from '../types/api';

/**
 * One line above the Full view's toolbar: what is in the library, then each format's share of the disk (A52). A
 * readout, not a row of stat cards (DESIGN.md, "Never"). Keyed under `tracks` so every track mutation refreshes it.
 */
export function LibraryStatsLine() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    // Per user: the hidden count is admin-only, so a guest must never be shown an admin's cached answer.
    queryKey: ['tracks', 'stats', user?.id],
    queryFn: () => apiClient.get<LibraryStats>('/library/stats'),
  });

  if (isLoading) return <p className="lf-stats lf-muted">Counting the library…</p>;
  if (isError || !data) return <p className="lf-stats lf-muted">Couldn't load the library totals.</p>;
  if (data.tracks === 0 && !data.missing) return null;

  return (
    <div className="lf-stats">
      <p className="tabular-nums">
        <span className="font-semibold text-white">{data.tracks.toLocaleString()}</span>
        <span className="lf-muted"> {data.tracks === 1 ? 'track' : 'tracks'} · </span>
        <span className="text-white">{formatTotalLength(data.seconds)}</span>
        <span className="lf-muted"> · </span>
        <span className="text-white">{formatBytes(data.bytes)}</span>
        <span className="lf-muted"> on disk</span>
        {data.hidden ? <span className="lf-muted"> · {data.hidden.toLocaleString()} hidden</span> : null}
        {data.missing ? <span className="lf-muted"> · {data.missing.toLocaleString()} missing</span> : null}
      </p>
      {data.formats.length > 0 && (
        <ul className="lf-stats-formats" aria-label="Formats, largest first">
          {data.formats.map((f) => (
            <li key={f.format ?? 'unknown'}>
              <span className="text-blue-100">{f.format ?? 'Unknown'}</span>{' '}
              <span className="lf-muted tabular-nums">
                {f.tracks.toLocaleString()} · {formatBytes(f.bytes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
