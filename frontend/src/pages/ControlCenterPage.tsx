import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useUploads } from '../components/UploadProvider';
import { UploadQueueList } from '../components/UploadQueueList';
import { apiClient } from '../lib/apiClient';
import { formatBytes, formatTotalLength } from '../lib/format';
import type {
  AdminRoomsResponse,
  ControlCenterSnapshot,
  GuestCodesSnapshot,
  HealthSnapshot,
  LibraryRoot,
  LibraryRootListResponse,
  LibraryStats,
  LoudnessReport,
  PlaybackFailureEntry,
  PlayWindow,
  UserSummary,
} from '../types/api';
import { Section } from './controlCenterParts';

/**
 * The Control Center's Overview as an arcade cabinet's operator test mode (A156): a self-check board, one line per
 * subsystem with OK / CHECK / NG, then the bookkeeping and who is on air. The long tables are on the Logs tab (A158).
 */

const POLL_INTERVAL_MS = 10_000;
/** Players report their drift every 5 s, so polling slower would show stale numbers. */
const ROOMS_POLL_INTERVAL_MS = 5_000;
/** Where a room member counts as out of step (spec: `.docs/specs/room-sync.md`, "Drift"). */
const ROOM_DRIFT_LIMIT_MS = 300;
/** A scan moves fast enough that a 10s poll makes the bar jump instead of crawl. */
const SCANNING_POLL_INTERVAL_MS = 2_000;
/** Newest failures fetched to count the last day's; more than this in a day shows as "50+". */
const RECENT_FAILURES_FETCHED = 50;
const DAY_MS = 86_400_000;

/** OK and NG as a cabinet prints them; CHECK is "look at this", not broken. `wait` is before the first answer. */
type Verdict = 'ok' | 'check' | 'ng' | 'wait';

const VERDICT_TEXT: Record<Verdict, string> = { ok: 'OK', check: 'CHECK', ng: 'NG', wait: '--' };
const VERDICT_STYLE: Record<Verdict, string> = {
  ok: 'text-emerald-400',
  check: 'text-accent-ink',
  ng: 'text-red-400',
  wait: 'text-blue-400',
};

interface CheckRow {
  key: string;
  label: string;
  verdict: Verdict;
  readout: ReactNode;
  /** How full, for disks, the cache, levelling and a scan in progress. */
  fill?: number;
  link?: { to: string; text: string };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** SQLite's `datetime('now')` is UTC without a zone; read bare, a browser would take it as local time. */
function parseServerTime(value: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
}

/** Same thresholds as a disk filling up: the colour follows how close to full, not what it holds. */
function fillVerdict(fraction: number): Verdict {
  if (fraction >= 0.95) return 'ng';
  if (fraction >= 0.85) return 'check';
  return 'ok';
}

const FILL_STYLE: Record<Verdict, string> = {
  ok: 'bg-emerald-500',
  check: 'bg-orange-500',
  ng: 'bg-red-500',
  wait: 'bg-blue-700',
};

function FillBar({ fraction, verdict }: { fraction: number; verdict: Verdict }) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return (
    <span className="inline-block h-2 w-20 shrink-0 bg-blue-950" aria-hidden="true">
      <span className={`block h-full ${FILL_STYLE[verdict]}`} style={{ width: `${clamped * 100}%` }} />
    </span>
  );
}

function CheckBoard({ rows }: { rows: CheckRow[] }) {
  const ng = rows.filter((r) => r.verdict === 'ng').length;
  const check = rows.filter((r) => r.verdict === 'check').length;
  const waiting = rows.some((r) => r.verdict === 'wait');
  const summary: { text: string; verdict: Verdict } = ng
    ? { text: `${ng} NG`, verdict: 'ng' }
    : check
      ? { text: `${check} TO CHECK`, verdict: 'check' }
      : waiting
        ? { text: 'CHECKING', verdict: 'wait' }
        : { text: 'ALL OK', verdict: 'ok' };

  return (
    <div className="card overflow-hidden font-mono">
      <div className="flex items-baseline justify-between gap-3 border-b border-blue-800 px-4 py-3">
        <h3 className="text-xs font-semibold tracking-[0.2em] text-blue-300">SYSTEM CHECK</h3>
        <p className={`text-sm font-bold tracking-wider ${VERDICT_STYLE[summary.verdict]}`}>{summary.text}</p>
      </div>
      <ul className="divide-y divide-blue-800/60">
        {rows.map((row) => (
          <li
            key={row.key}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-2 text-sm sm:grid-cols-[6rem_minmax(0,1fr)_auto]"
          >
            <span className="text-xs tracking-widest text-blue-300">{row.label}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-blue-100">
              {row.fill !== undefined && <FillBar fraction={row.fill} verdict={row.verdict} />}
              <span className="min-w-0 wrap-break-word">{row.readout}</span>
              {row.link && (
                <Link
                  to={row.link.to}
                  className="font-sans text-xs text-accent-ink underline underline-offset-2 hover:text-white"
                >
                  {row.link.text}
                </Link>
              )}
            </span>
            <span className={`w-12 text-right text-sm font-bold ${VERDICT_STYLE[row.verdict]}`}>
              {VERDICT_TEXT[row.verdict]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bookkeeping({ plays }: { plays: { day: PlayWindow; week: PlayWindow } | undefined }) {
  const lines: { label: string; value: (w: PlayWindow) => string }[] = [
    { label: 'PLAYS', value: (w) => w.plays.toLocaleString() },
    { label: 'SKIPS', value: (w) => w.skips.toLocaleString() },
    { label: 'LISTENERS', value: (w) => w.listeners.toLocaleString() },
    { label: 'LISTENED', value: (w) => formatTotalLength(w.minutes * 60) },
  ];
  return (
    <div className="card overflow-hidden font-mono">
      <h3 className="border-b border-blue-800 px-4 py-3 text-xs font-semibold tracking-[0.2em] text-blue-300">
        BOOKKEEPING
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs tracking-widest text-blue-400">
            <th className="px-4 pt-2.5 pb-1 text-left font-normal">
              <span className="sr-only">Count</span>
            </th>
            <th className="px-4 pt-2.5 pb-1 text-right font-normal">24 H</th>
            <th className="px-4 pt-2.5 pb-1 text-right font-normal">7 DAYS</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.label}>
              <th scope="row" className="px-4 py-1.5 text-left text-xs font-normal tracking-widest text-blue-300">
                {line.label}
              </th>
              <td className="px-4 py-1.5 text-right tabular-nums text-white">{plays ? line.value(plays.day) : '--'}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-white">{plays ? line.value(plays.week) : '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 pt-1 pb-3 font-sans text-xs text-blue-400">
        Everyone, rolling windows. A skip is a song stopped before it counts as a play.
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

function folderRow(root: LibraryRoot): CheckRow {
  const key = `root-${root.id}`;
  const name = root.label ?? root.path;
  const progress = root.scanProgress;
  if (root.status === 'unreachable') {
    return { key, label: 'FOLDER', verdict: 'ng', readout: `${name}: unreachable` };
  }
  if (root.scanning) {
    return {
      key,
      label: 'FOLDER',
      verdict: 'ok',
      fill: progress && progress.total > 0 ? progress.processed / progress.total : 0,
      readout: progress
        ? `${name}: scanning ${progress.processed.toLocaleString()} of ${progress.total.toLocaleString()} files`
        : `${name}: scanning, walking the folder tree`,
    };
  }
  return {
    key,
    label: 'FOLDER',
    verdict: root.lastScannedAt ? 'ok' : 'check',
    readout: `${name}: ${root.trackCount.toLocaleString()} tracks, ${
      root.lastScannedAt ? `scanned ${new Date(parseServerTime(root.lastScannedAt)).toLocaleString()}` : 'never scanned'
    }`,
  };
}

export function ControlCenterPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthSnapshot>('/admin/health'),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const center = useQuery({
    queryKey: ['control-center'],
    queryFn: () => apiClient.get<ControlCenterSnapshot>('/admin/control-center'),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const rooms = useQuery({
    queryKey: ['admin-rooms'],
    queryFn: () => apiClient.get<AdminRoomsResponse>('/admin/rooms'),
    refetchInterval: ROOMS_POLL_INTERVAL_MS,
  });
  const failures = useQuery({
    queryKey: ['playback-failures', 'recent'],
    queryFn: () =>
      apiClient.get<{ failures: PlaybackFailureEntry[]; total: number }>(
        `/admin/playback-failures?limit=${RECENT_FAILURES_FETCHED}`,
      ),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const roots = useQuery({
    queryKey: ['library-roots'],
    queryFn: () => apiClient.get<LibraryRootListResponse>('/library/roots'),
    refetchInterval: (query) =>
      query.state.data?.roots.some((r) => r.scanning) ? SCANNING_POLL_INTERVAL_MS : POLL_INTERVAL_MS,
  });
  const library = useQuery({
    queryKey: ['library-stats'],
    queryFn: () => apiClient.get<LibraryStats>('/library/stats'),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const levelling = useQuery({
    queryKey: ['loudness', 'overview'],
    queryFn: () => apiClient.get<LoudnessReport>('/admin/loudness?limit=1'),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get<{ users: UserSummary[] }>('/users'),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const guestCodes = useQuery({
    queryKey: ['guest-codes'],
    queryFn: () => apiClient.get<GuestCodesSnapshot>('/guest-codes'),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { queue: uploads } = useUploads();

  const h = health.data;
  const c = center.data;
  const system = c?.system;
  const rows: CheckRow[] = [];

  rows.push(
    health.isError
      ? { key: 'server', label: 'SERVER', verdict: 'ng', readout: 'No answer. The server may be down or restarting.' }
      : !h
        ? { key: 'server', label: 'SERVER', verdict: 'wait', readout: 'Asking the server…' }
        : {
            key: 'server',
            label: 'SERVER',
            verdict: 'ok',
            readout: `up ${formatUptime(h.uptimeSeconds)}${
              system
                ? `, cpu ${system.cpuPercent}%, memory ${formatBytes(system.memoryBytes)} (${formatBytes(system.heapUsedBytes)} heap)`
                : ''
            }`,
          },
  );

  for (const disk of system?.disks ?? []) {
    const used = disk.totalBytes - disk.freeBytes;
    const fraction = disk.totalBytes > 0 ? used / disk.totalBytes : 0;
    rows.push({
      key: `disk-${disk.path}`,
      label: 'DISK',
      verdict: fillVerdict(fraction),
      fill: fraction,
      readout: `${disk.label}: ${Math.round(fraction * 100)}% used, ${formatBytes(disk.freeBytes)} free of ${formatBytes(disk.totalBytes)}`,
    });
  }

  if (system) {
    const { usedBytes, maxBytes } = system.transcodeCache;
    rows.push({
      key: 'cache',
      label: 'CACHE',
      // It evicts the least recently used past its cap, so full is normal.
      verdict: 'ok',
      fill: maxBytes > 0 ? usedBytes / maxBytes : 0,
      readout: `transcodes ${formatBytes(usedBytes)} of ${formatBytes(maxBytes)} cap`,
    });
  }

  for (const root of roots.data?.roots ?? []) rows.push(folderRow(root));

  const missing = h?.missingTracks ?? 0;
  rows.push(
    !library.data
      ? { key: 'library', label: 'LIBRARY', verdict: 'wait', readout: 'Counting…' }
      : {
          key: 'library',
          label: 'LIBRARY',
          verdict: missing > 0 ? 'check' : 'ok',
          readout: `${library.data.tracks.toLocaleString()} tracks, ${formatTotalLength(library.data.seconds)}, ${formatBytes(library.data.bytes)}${
            missing > 0 ? `; ${missing.toLocaleString()} missing from disk` : ''
          }${library.data.hidden ? `; ${library.data.hidden.toLocaleString()} hidden` : ''}`,
          link: missing > 0 ? { to: '/?view=full', text: 'Library' } : undefined,
        },
  );

  rows.push(
    !c
      ? { key: 'files', label: 'FILES', verdict: 'wait', readout: 'Reading the last scan…' }
      : c.scanFailureCount > 0
        ? {
            key: 'files',
            label: 'FILES',
            verdict: 'check',
            readout: `${c.scanFailureCount.toLocaleString()} the last scan couldn't read`,
            link: { to: '/control-center/logs', text: 'Logs' },
          }
        : { key: 'files', label: 'FILES', verdict: 'ok', readout: 'every scanned file was readable' },
  );

  const lev = levelling.data;
  rows.push(
    !lev
      ? { key: 'level', label: 'LEVEL', verdict: 'wait', readout: 'Asking…' }
      : {
          key: 'level',
          label: 'LEVEL',
          verdict: lev.summary.failed > 0 ? 'check' : 'ok',
          fill: lev.summary.total > 0 ? lev.summary.levelled / lev.summary.total : 0,
          readout: `${lev.summary.levelled.toLocaleString()} of ${lev.summary.total.toLocaleString()} levelled${
            lev.summary.waiting > 0 ? `, ${lev.summary.waiting.toLocaleString()} waiting` : ''
          }${lev.summary.failed > 0 ? `, ${lev.summary.failed.toLocaleString()} failed` : ''}${
            lev.measuring ? `; measuring "${lev.measuring.title}"` : ''
          }`,
          link: lev.summary.failed > 0 ? { to: '/control-center/levelling', text: 'Levelling' } : undefined,
        },
  );

  rows.push(
    !h
      ? { key: 'streams', label: 'STREAMS', verdict: health.isError ? 'ng' : 'wait', readout: '--' }
      : {
          key: 'streams',
          label: 'STREAMS',
          // The server's own call: degraded means a stream error in the last 15 minutes.
          verdict: h.status === 'degraded' ? 'check' : 'ok',
          readout: `${h.activeStreams} live, ${h.activeTranscodes} transcoding${
            h.status === 'degraded' ? '; an error in the last 15\u00a0min' : ''
          }`,
          link: h.recentErrors.length > 0 ? { to: '/control-center/logs', text: 'Logs' } : undefined,
        },
  );

  // Measured from when the list arrived, which a render can't move.
  const recentFailures = (failures.data?.failures ?? []).filter(
    (f) => failures.dataUpdatedAt - parseServerTime(f.createdAt) < DAY_MS,
  );
  const newestFailure = recentFailures[0];
  rows.push(
    !failures.data
      ? { key: 'playback', label: 'PLAYBACK', verdict: 'wait', readout: 'Asking…' }
      : !newestFailure
        ? { key: 'playback', label: 'PLAYBACK', verdict: 'ok', readout: 'no failures in 24\u00a0h' }
        : {
            key: 'playback',
            label: 'PLAYBACK',
            verdict: 'check',
            readout: `${
              recentFailures.length === RECENT_FAILURES_FETCHED ? `${RECENT_FAILURES_FETCHED}+` : recentFailures.length
            } failed in 24\u00a0h; newest "${newestFailure.trackTitle ?? `#${newestFailure.trackId}`}" for ${newestFailure.username}`,
            link: { to: '/control-center/logs', text: 'Logs' },
          },
  );

  const roomList = rooms.data?.rooms ?? [];
  const members = roomList.reduce((n, r) => n + r.members.length, 0);
  const outOfStep = roomList.reduce((n, r) => n + r.members.filter((m) => memberState(m).outOfStep).length, 0);
  rows.push(
    !rooms.data
      ? {
          key: 'rooms',
          label: 'ROOMS',
          verdict: rooms.isError ? 'ng' : 'wait',
          readout: rooms.isError ? "Couldn't load the rooms. This retries every 5 seconds." : 'Asking…',
        }
      : {
          key: 'rooms',
          label: 'ROOMS',
          verdict: outOfStep > 0 ? 'check' : 'ok',
          readout:
            roomList.length === 0
              ? 'none open'
              : `${roomList.length} open, ${members} ${members === 1 ? 'member' : 'members'}${
                  outOfStep > 0 ? `, ${outOfStep} out of step` : ', all in step'
                }`,
        },
  );

  const accounts = users.data?.users ?? [];
  const pending = guestCodes.data?.requests.length ?? 0;
  rows.push(
    !users.data
      ? { key: 'accounts', label: 'ACCOUNTS', verdict: 'wait', readout: 'Asking…' }
      : {
          key: 'accounts',
          label: 'ACCOUNTS',
          verdict: pending > 0 ? 'check' : 'ok',
          readout: `${accounts.filter((u) => u.kind === 'account').length} accounts, ${
            accounts.filter((u) => u.kind === 'guest').length
          } guests${pending > 0 ? `; ${pending} waiting for a guest code` : ''}`,
          link: pending > 0 ? { to: '/control-center/users', text: 'Users' } : undefined,
        },
  );

  if (uploads.length > 0) {
    const active = uploads.filter((u) => u.status === 'queued' || u.status === 'uploading').length;
    const failed = uploads.filter((u) => u.status === 'error').length;
    rows.push({
      key: 'uploads',
      label: 'UPLOADS',
      verdict: failed > 0 ? 'check' : 'ok',
      readout: `${active} in progress, ${uploads.length - active - failed} done${failed > 0 ? `, ${failed} failed` : ''} (this tab)`,
    });
  }

  const listeners = c?.listeners ?? [];
  const checkedAt = health.dataUpdatedAt ? new Date(health.dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {/* A tab of the dashboard (`AdminDashboard`), which carries the page title. */}
          <h2 className="text-base font-semibold text-white">Overview</h2>
          <p className="mt-0.5 text-sm text-blue-300">
            {checkedAt ? `Checked ${checkedAt}, again every 10s.` : 'Checks every 10s.'}
          </p>
        </div>
        <button
          onClick={() => {
            for (const q of [health, center, rooms, failures, roots, library, levelling, users, guestCodes]) {
              void q.refetch();
            }
          }}
          disabled={health.isFetching}
          className="btn-secondary btn-sm"
        >
          {health.isFetching ? 'Checking…' : 'Check now'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <CheckBoard rows={rows} />

        <div className="space-y-4">
          <Bookkeeping plays={c?.plays} />

          <div className="card overflow-hidden">
            <h3 className="border-b border-blue-800 px-4 py-3 font-mono text-xs font-semibold tracking-[0.2em] text-blue-300">
              ON AIR ({listeners.length})
            </h3>
            {listeners.length > 0 ? (
              <ul className="divide-y divide-blue-800/60">
                {listeners.map((l) => (
                  <li key={`${l.userId}-${l.client}-${l.since}`} className="px-4 py-2 text-sm">
                    <p className="truncate text-white">{l.trackTitle}</p>
                    <p className="truncate text-xs text-blue-300">
                      {l.username} on {l.client}, since {new Date(l.since).toLocaleTimeString()}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-blue-300">
                {c ? 'Nobody is listening. A player shows here within 30 s of starting a song.' : 'Asking…'}
              </p>
            )}
          </div>
        </div>
      </div>

      {roomList.length > 0 && (
        <Section
          title={`Listen together (${roomList.length} ${roomList.length === 1 ? 'room' : 'rooms'})`}
          description={`Each person's distance from the room, from their last report (every 5 s). Under ${ROOM_DRIFT_LIMIT_MS} ms is in step; more is shown in red until their player corrects it.`}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {roomList.map((room) => (
              <RoomCard key={room.code} room={room} />
            ))}
          </div>
        </Section>
      )}

      {uploads.length > 0 && (
        <Section
          title="Uploads"
          description="Started in this tab. They keep going on other pages; closing or reloading the tab stops them."
        >
          {/* Scrolls inside its box: a big batch would otherwise push every other section off the screen. */}
          <UploadQueueList scrollable />
        </Section>
      )}
    </div>
  );
}
