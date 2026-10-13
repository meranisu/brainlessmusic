import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient } from '../lib/apiClient';
import type { ControlCenterSnapshot, HealthSnapshot, PlaybackFailureEntry } from '../types/api';
import { EmptyRow, Section } from './controlCenterParts';

/**
 * The Control Center's long tables (A158): stream errors, playback failures and file integrity. The Overview shows
 * each one's count and newest entry and links here.
 */

const POLL_INTERVAL_MS = 10_000;
/** Playback failures per page; the server keeps up to 1000. */
const FAILURES_PAGE_SIZE = 50;

/** MediaError codes, for a reader who doesn't have the spec memorized. */
const MEDIA_ERROR_LABELS: Record<number, string> = {
  1: 'aborted',
  2: 'network error',
  3: 'decode error',
  4: 'format not supported',
};

export function LogsPage() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthSnapshot>('/admin/health'),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: center } = useQuery({
    queryKey: ['control-center'],
    queryFn: () => apiClient.get<ControlCenterSnapshot>('/admin/control-center'),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const [failuresPage, setFailuresPage] = useState(0);
  const { data: failures, isLoading: isLoadingFailures } = useQuery({
    queryKey: ['playback-failures', failuresPage],
    queryFn: () =>
      apiClient.get<{ failures: PlaybackFailureEntry[]; total: number }>(
        `/admin/playback-failures?limit=${FAILURES_PAGE_SIZE}&offset=${failuresPage * FAILURES_PAGE_SIZE}`,
      ),
    refetchInterval: POLL_INTERVAL_MS,
    placeholderData: (prev) => prev,
  });
  const failurePages = failures ? Math.max(1, Math.ceil(failures.total / FAILURES_PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Logs</h2>
        <p className="mt-0.5 text-sm text-blue-300">Auto-refreshes every 10s.</p>
      </div>

      <Section
        title={failures ? `Playback failures (${failures.total})` : 'Playback failures'}
        description="Who hit a track that wouldn't play, and why. A track a listener's device couldn't decode is invisible to the stream errors below, since the server served it fine."
      >
        {/* Scrolls inside its own box, header pinned, so 50 rows don't push the rest of the page away. */}
        <div className="card max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-blue-800 bg-blue-900">
              <tr className="text-xs uppercase tracking-wide text-blue-400">
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Track</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-800/60">
              {failures?.failures.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-blue-200">
                    {new Date(f.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-blue-200">{f.username}</td>
                  <td className="px-4 py-2.5 text-blue-100">{f.trackTitle ?? `#${f.trackId}`}</td>
                  <td className="px-4 py-2.5 text-blue-200">{f.userAgent ?? '—'}</td>
                  <td className="px-4 py-2.5 text-blue-100">
                    {f.message}
                    {f.mediaErrorCode !== null && (
                      <span className="text-blue-300">
                        {' '}
                        ({MEDIA_ERROR_LABELS[f.mediaErrorCode] ?? `code ${f.mediaErrorCode}`}
                        {f.contentType ? `, served as ${f.contentType}` : ''})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoadingFailures && (failures?.failures.length ?? 0) === 0 && (
                <EmptyRow colSpan={5}>No playback failures reported.</EmptyRow>
              )}
            </tbody>
          </table>
        </div>
        {failurePages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-sm text-blue-200">
            <button
              disabled={failuresPage === 0}
              onClick={() => setFailuresPage((p) => p - 1)}
              className="btn-secondary btn-sm"
            >
              Prev
            </button>
            <span>
              Page {failuresPage + 1} of {failurePages}
            </span>
            <button
              disabled={failuresPage + 1 >= failurePages}
              onClick={() => setFailuresPage((p) => p + 1)}
              className="btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        )}
      </Section>

      <Section
        title={health ? `Stream errors (${health.recentErrors.length})` : 'Stream errors'}
        description="The newest 10 requests the stream route refused or failed. Kept in memory, so a restart clears them."
      >
        {/* Scrolls inside its own box too, header pinned, so a burst of errors doesn't push the rest of the page away. */}
        <div className="card max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-blue-800 bg-blue-900">
              <tr className="text-xs uppercase tracking-wide text-blue-400">
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-4 py-2.5 font-medium">Track</th>
                <th className="px-4 py-2.5 font-medium">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-800/60">
              {health?.recentErrors.map((e, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-blue-200">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-blue-200">#{e.trackId}</td>
                  <td className="px-4 py-2.5 text-blue-100">{e.message}</td>
                </tr>
              ))}
              {health && health.recentErrors.length === 0 && <EmptyRow colSpan={3}>No errors recently.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title={center ? `File integrity (${center.scanFailureCount})` : 'File integrity'}
        description="Files the last scan of each folder couldn't read: truncated, corrupt, or a tag block the reader chokes on. Replaced by each scan, so a fixed file drops off."
      >
        <div className="card max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-blue-800 bg-blue-900">
              <tr className="text-xs uppercase tracking-wide text-blue-400">
                <th className="px-4 py-2.5 font-medium">Folder</th>
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="px-4 py-2.5 font-medium">Problem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-800/60">
              {center?.scanFailures.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-2.5 text-blue-200">{f.rootLabel ?? f.rootPath}</td>
                  <td className="px-4 py-2.5 break-all text-blue-100">{f.path}</td>
                  <td className="px-4 py-2.5 text-blue-200">{f.message}</td>
                </tr>
              ))}
              {center && center.scanFailures.length === 0 && (
                <EmptyRow colSpan={3}>Every file the last scan touched was readable.</EmptyRow>
              )}
            </tbody>
          </table>
        </div>
        {center && center.scanFailureCount > center.scanFailures.length && (
          <p className="mt-2 text-xs text-blue-300">
            Showing {center.scanFailures.length} of {center.scanFailureCount}.
          </p>
        )}
      </Section>
    </div>
  );
}
