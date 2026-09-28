import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClient } from '../lib/apiClient';
import type {
  ControlCenterSnapshot,
  DiskUsage,
  HealthSnapshot,
  LibraryRoot,
  LibraryRootListResponse,
  PlaybackFailureEntry,
} from '../types/api';

const POLL_INTERVAL_MS = 10_000;
/** A scan moves fast enough that a 10s poll makes the bar jump instead of crawl. */
const SCANNING_POLL_INTERVAL_MS = 2_000;

/** MediaError codes, for a reader who doesn't have the spec memorized. */
const MEDIA_ERROR_LABELS: Record<number, string> = {
  1: 'aborted',
  2: 'network error',
  3: 'decode error',
  4: 'format not supported',
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

const STATUS_STYLES: Record<HealthSnapshot['status'], string> = {
  ok: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  degraded: 'bg-orange-600/10 text-orange-500 border-orange-600/30',
};

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-blue-300">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-blue-400">{hint}</p>}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {description && <p className="mt-0.5 mb-2 text-xs text-blue-300">{description}</p>}
      <div className={description ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-blue-300">
        {children}
      </td>
    </tr>
  );
}

/** Bar colour follows how close to full it is, not what it holds. */
function barColor(fraction: number): string {
  if (fraction >= 0.95) return 'bg-red-500';
  if (fraction >= 0.85) return 'bg-orange-500';
  return 'bg-emerald-500';
}

function UsageBar({ fraction, label, detail }: { fraction: number; label: string; detail: string }) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs tabular-nums text-blue-300">{detail}</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-950">
        <div className={`h-full rounded-full ${barColor(clamped)}`} style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  );
}

function DiskBar({ disk }: { disk: DiskUsage }) {
  const used = disk.totalBytes - disk.freeBytes;
  return (
    <UsageBar
      label={`${disk.label} disk`}
      fraction={disk.totalBytes > 0 ? used / disk.totalBytes : 0}
      detail={`${formatBytes(used)} used · ${formatBytes(disk.freeBytes)} free of ${formatBytes(disk.totalBytes)}`}
    />
  );
}

function RootScan({ root }: { root: LibraryRoot }) {
  const progress = root.scanProgress;
  const name = root.label ?? root.path;

  if (root.scanning) {
    return (
      <UsageBar
        label={`${name} — scanning`}
        fraction={progress && progress.total > 0 ? progress.processed / progress.total : 0}
        detail={
          progress
            ? `${progress.processed.toLocaleString()} of ${progress.total.toLocaleString()} files`
            : 'walking the folder tree…'
        }
      />
    );
  }

  return (
    <div className="card flex items-baseline justify-between gap-3 p-4">
      <p className="text-sm text-white">
        {name}
        {root.status === 'unreachable' && <span className="ml-2 text-xs text-red-400">unreachable</span>}
      </p>
      <p className="text-xs text-blue-300">
        {root.trackCount.toLocaleString()} tracks ·{' '}
        {root.lastScannedAt ? `scanned ${new Date(root.lastScannedAt).toLocaleString()}` : 'never scanned'}
      </p>
    </div>
  );
}

export function ControlCenterPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthSnapshot>('/admin/health'),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: center } = useQuery({
    queryKey: ['control-center'],
    queryFn: () => apiClient.get<ControlCenterSnapshot>('/admin/control-center'),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: failures, isLoading: isLoadingFailures } = useQuery({
    queryKey: ['playback-failures'],
    queryFn: () => apiClient.get<{ failures: PlaybackFailureEntry[] }>('/admin/playback-failures'),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: roots } = useQuery({
    queryKey: ['library-roots'],
    queryFn: () => apiClient.get<LibraryRootListResponse>('/library/roots'),
    refetchInterval: (query) =>
      query.state.data?.roots.some((r) => r.scanning) ? SCANNING_POLL_INTERVAL_MS : POLL_INTERVAL_MS,
  });

  const system = center?.system;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Control Center</h1>
          <p className="mt-0.5 text-sm text-blue-300">Auto-refreshes every 10s.</p>
        </div>
        <button
          onClick={() => {
            void refetch();
          }}
          disabled={isFetching}
          className="btn-secondary btn-sm"
        >
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
        <div className="space-y-6">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${STATUS_STYLES[data.status]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {data.status === 'ok' ? 'All good' : 'Degraded'}
          </div>

          <Section title="Server">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatTile label="Uptime" value={formatUptime(data.uptimeSeconds)} />
              <StatTile
                label="Memory"
                value={system ? formatBytes(system.memoryBytes) : '—'}
                hint={system ? `${formatBytes(system.heapUsedBytes)} heap in use` : undefined}
              />
              <StatTile
                label="CPU"
                value={system ? `${system.cpuPercent}%` : '—'}
                hint="server process, not ffmpeg"
              />
              <StatTile label="Transcoding" value={data.activeTranscodes} hint="ffmpeg jobs running" />
            </div>
          </Section>

          {system && (
            <Section title="Storage">
              <div className="grid gap-3 md:grid-cols-2">
                {system.disks.map((disk) => (
                  <DiskBar key={disk.path} disk={disk} />
                ))}
                <UsageBar
                  label="Transcode cache"
                  fraction={system.transcodeCache.maxBytes > 0 ? system.transcodeCache.usedBytes / system.transcodeCache.maxBytes : 0}
                  detail={`${formatBytes(system.transcodeCache.usedBytes)} of ${formatBytes(system.transcodeCache.maxBytes)} cap`}
                />
              </div>
            </Section>
          )}

          <Section
            title={`Now playing (${center?.activeSessions.length ?? data.activeStreams})`}
            description="Streams open right now. One listener can hold several while the player buffers or seeks."
          >
            <div className="card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-blue-800">
                  <tr className="text-xs uppercase tracking-wide text-blue-400">
                    <th className="px-4 py-2.5 font-medium">Listener</th>
                    <th className="px-4 py-2.5 font-medium">Track</th>
                    <th className="px-4 py-2.5 font-medium">Since</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-800/60">
                  {center?.activeSessions.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2.5 text-blue-200">{s.username}</td>
                      <td className="px-4 py-2.5 text-blue-100">{s.trackTitle}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-blue-200">
                        {new Date(s.startedAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                  {(center?.activeSessions.length ?? 0) === 0 && <EmptyRow colSpan={3}>Nobody is listening.</EmptyRow>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Library">
            <div className="grid gap-3 md:grid-cols-2">
              {roots?.roots.map((root) => <RootScan key={root.id} root={root} />)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile
                label="Missing files"
                value={data.missingTracks}
                hint="in the library, gone from disk"
              />
              <StatTile
                label="Unreadable files"
                value={center?.scanFailureCount ?? '—'}
                hint="failed the last scan"
              />
            </div>
          </Section>

          <Section
            title="File integrity"
            description="Files the last scan of each folder couldn't read — truncated, corrupt, or a tag block the reader chokes on. Replaced by each scan, so a fixed file drops off."
          >
            <div className="card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-blue-800">
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

          <Section title={`Stream errors (${data.recentErrors.length})`}>
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
                      <td className="px-4 py-2.5 whitespace-nowrap text-blue-200">
                        {new Date(e.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-blue-200">#{e.trackId}</td>
                      <td className="px-4 py-2.5 text-blue-100">{e.message}</td>
                    </tr>
                  ))}
                  {data.recentErrors.length === 0 && <EmptyRow colSpan={3}>No errors recently — good sign.</EmptyRow>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Playback failures"
            description="Who hit a track that wouldn't play, and why — a track a listener's device couldn't decode is invisible to the stream errors above, since the server served it fine."
          >
            <div className="card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-blue-800">
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
          </Section>
        </div>
      )}
    </div>
  );
}
