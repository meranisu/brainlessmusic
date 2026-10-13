import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useUploads } from '../components/UploadProvider';
import { UploadQueueList } from '../components/UploadQueueList';
import { apiClient } from '../lib/apiClient';
import { formatBytes } from '../lib/format';
import type {
  AdminRoomsResponse,
  ControlCenterSnapshot,
  DiskUsage,
  HealthSnapshot,
  LibraryRoot,
  LibraryRootListResponse,
  PlaybackFailureEntry,
} from '../types/api';

const POLL_INTERVAL_MS = 10_000;
/** Players report their drift every 5 s, so polling slower would show stale numbers. */
const ROOMS_POLL_INTERVAL_MS = 5_000;
/** Where a room member counts as out of step (spec: `.docs/specs/room-sync.md`, "Drift"). */
const ROOM_DRIFT_LIMIT_MS = 300;
/** A scan moves fast enough that a 10s poll makes the bar jump instead of crawl. */
const SCANNING_POLL_INTERVAL_MS = 2_000;
/** Playback failures per page; the server keeps up to 1000. */
const FAILURES_PAGE_SIZE = 50;

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

const STATUS_STYLES: Record<HealthSnapshot['status'], string> = {
  ok: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  degraded: 'bg-orange-600/10 text-accent-ink border-orange-600/30',
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
      {/* h3: under the tab's own "Overview" heading. */}
      <h3 className="text-sm font-semibold text-white">{title}</h3>
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
        label={`${name}: scanning`}
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
        {root.status === 'unreachable' && <span className="ml-2 text-xs text-red-300">unreachable</span>}
      </p>
      <p className="text-xs text-blue-300">
        {root.trackCount.toLocaleString()} tracks ·{' '}
        {root.lastScannedAt ? `scanned ${new Date(root.lastScannedAt).toLocaleString()}` : 'never scanned'}
      </p>
    </div>
  );
}

type AdminRoom = AdminRoomsResponse['rooms'][number];

/** What one member's last report says, in words: drift is the number that answers "are we in sync". */
function memberState(m: AdminRoom['members'][number]): { text: string; outOfStep: boolean } {
  if (!m.connected) return { text: 'Away', outOfStep: false };
  if (m.buffering) return { text: 'Buffering', outOfStep: false };
  if (m.driftMs === null) return { text: 'Waiting for a report', outOfStep: false };
  const ms = Math.abs(m.driftMs);
  const side = m.driftMs > 0 ? 'ahead' : 'behind';
  return ms < ROOM_DRIFT_LIMIT_MS
    ? { text: `In step (${ms} ms ${side})`, outOfStep: false }
    : { text: `${ms} ms ${side}`, outOfStep: true };
}

function RoomCard({ room }: { room: AdminRoom }) {
  const playing = room.queue[room.current];
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-blue-800 px-4 py-3">
        <span className="font-display text-xl font-extrabold tracking-[0.15em] text-white">{room.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-blue-200">
          {playing
            ? `${room.playback.playing ? 'Playing' : 'Paused on'} "${playing.title}"${playing.artist ? ` by ${playing.artist}` : ''}`
            : 'Nothing queued'}
        </span>
        <span className="text-xs text-blue-300">since {new Date(room.createdAt).toLocaleTimeString()}</span>
      </div>
      <ul className="divide-y divide-blue-800/60">
        {room.members.map((m) => {
          const state = memberState(m);
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-blue-100">{m.name}</span>
              {m.userId === room.hostUserId && <span className="badge-admin">Host</span>}
              {m.kind === 'guest' && <span className="badge-neutral">Guest</span>}
              <span className={`whitespace-nowrap font-mono text-xs ${state.outOfStep ? 'text-red-300' : 'text-blue-200'}`}>
                {state.text}
              </span>
            </li>
          );
        })}
      </ul>
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

  const {
    data: rooms,
    isLoading: isLoadingRooms,
    isError: isRoomsError,
  } = useQuery({
    queryKey: ['admin-rooms'],
    queryFn: () => apiClient.get<AdminRoomsResponse>('/admin/rooms'),
    refetchInterval: ROOMS_POLL_INTERVAL_MS,
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

  const { data: roots } = useQuery({
    queryKey: ['library-roots'],
    queryFn: () => apiClient.get<LibraryRootListResponse>('/library/roots'),
    refetchInterval: (query) =>
      query.state.data?.roots.some((r) => r.scanning) ? SCANNING_POLL_INTERVAL_MS : POLL_INTERVAL_MS,
  });

  const system = center?.system;
  const { queue: uploads } = useUploads();
  const uploading = uploads.filter((u) => u.status === 'queued' || u.status === 'uploading').length;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          {/* A tab of the dashboard now (`AdminDashboard`), which carries the page title. */}
          <h2 className="text-base font-semibold text-white">Overview</h2>
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

      {/* Outside the health data: uploads run in this tab, so they show even when the server checks fail. */}
      <div className="mb-6">
        <Section
          title={uploading > 0 ? `Uploads (${uploading} in progress)` : 'Uploads'}
          description="Started in this tab. They keep going on other pages; closing or reloading the tab stops them."
        >
          {uploads.length > 0 ? (
            // Scrolls inside its box: a big batch would otherwise push every other section off the screen.
            <UploadQueueList scrollable />
          ) : (
            <div className="card px-4 py-6 text-center text-sm text-blue-300">
              No uploads in this tab.{' '}
              <Link to="/control-center/upload" className="text-accent-ink underline">
                Upload files
              </Link>
            </div>
          )}
        </Section>
      </div>

      {isLoading && (
        <div className="card flex items-center justify-center py-16 text-sm text-blue-300">Loading…</div>
      )}
      {isError && (
        <div className="card flex items-center justify-center py-16 text-sm text-red-300">
          Couldn't reach the server, which is a "down" signal in itself.
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
            title={`Now playing (${center?.listeners.length ?? 0})`}
            description="Players that checked in within the last 30 seconds. One account on a phone and a browser shows twice."
          >
            <div className="card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-blue-800">
                  <tr className="text-xs uppercase tracking-wide text-blue-400">
                    <th className="px-4 py-2.5 font-medium">Listener</th>
                    <th className="px-4 py-2.5 font-medium">Device</th>
                    <th className="px-4 py-2.5 font-medium">Track</th>
                    <th className="px-4 py-2.5 font-medium">Since</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-800/60">
                  {center?.listeners.map((l) => (
                    <tr key={`${l.userId}-${l.client}-${l.since}`}>
                      <td className="px-4 py-2.5 text-blue-200">{l.username}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-blue-200">{l.client}</td>
                      <td className="px-4 py-2.5 text-blue-100">{l.trackTitle}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-blue-200">
                        {new Date(l.since).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                  {(center?.listeners.length ?? 0) === 0 && <EmptyRow colSpan={4}>Nobody is listening.</EmptyRow>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title={`Listen together (${rooms?.rooms.length ?? 0} ${rooms?.rooms.length === 1 ? 'room' : 'rooms'})`}
            description={`Each person's distance from the room, from their last report (every 5 s). Under ${ROOM_DRIFT_LIMIT_MS} ms is in step; more is shown in red until their player corrects it.`}
          >
            {isLoadingRooms ? (
              <p className="card px-4 py-6 text-center text-sm text-blue-300">Loading rooms…</p>
            ) : isRoomsError ? (
              <p className="card px-4 py-6 text-center text-sm text-red-300">
                Couldn't load the rooms. This retries every 5 seconds.
              </p>
            ) : rooms && rooms.rooms.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {rooms.rooms.map((room) => (
                  <RoomCard key={room.code} room={room} />
                ))}
              </div>
            ) : (
              <p className="card px-4 py-6 text-center text-sm text-blue-300">
                No rooms right now. Anyone can start one from{' '}
                <Link to="/together" className="text-accent-ink underline underline-offset-2">
                  Listen together
                </Link>
                .
              </p>
            )}
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
            description="Files the last scan of each folder couldn't read: truncated, corrupt, or a tag block the reader chokes on. Replaced by each scan, so a fixed file drops off."
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
                  {data.recentErrors.map((e, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-blue-200">
                        {new Date(e.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-blue-200">#{e.trackId}</td>
                      <td className="px-4 py-2.5 text-blue-100">{e.message}</td>
                    </tr>
                  ))}
                  {data.recentErrors.length === 0 && <EmptyRow colSpan={3}>No errors recently.</EmptyRow>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Playback failures"
            description="Who hit a track that wouldn't play, and why. A track a listener's device couldn't decode is invisible to the stream errors above, since the server served it fine."
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
                  Page {failuresPage + 1} of {failurePages} · {failures?.total} failures
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
        </div>
      )}
    </div>
  );
}
