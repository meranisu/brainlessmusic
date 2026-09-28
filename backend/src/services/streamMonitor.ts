import { getActiveTranscodes } from './streaming.js';

export interface StreamErrorEntry {
  timestamp: string;
  trackId: number;
  message: string;
}

export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  activeStreams: number;
  activeTranscodes: number;
  recentErrors: StreamErrorEntry[];
}

const MAX_RECENT_ERRORS = 20;
const RECENT_ERRORS_RETURNED = 10;

/**
 * How recent an error has to be to still mean "degraded".
 *
 * Health was previously degraded if the list held anything at all, and the
 * list is only ever trimmed by length — so one missing file at boot left the
 * server reporting degraded forever, which is the same as reporting nothing.
 * The errors themselves stay listed past this window; they are useful history.
 * It is only the verdict that expires.
 */
const DEGRADED_WINDOW_MS = 15 * 60 * 1000;

/** One open stream, with enough identity to answer "who is listening to what". */
export interface ActiveSession {
  id: number;
  userId: number;
  username: string;
  trackId: number;
  trackTitle: string;
  startedAt: string;
}

const startedAt = Date.now();
let nextSessionId = 1;
// A Map rather than a counter so the count can never drift from the list: the
// number on `/admin/health` is `size`, and the identified list is the values.
const activeSessions = new Map<number, ActiveSession>();
const recentErrors: StreamErrorEntry[] = [];

/** Returns the handle to pass to `streamEnded` when the connection closes. */
export function streamStarted(info: Omit<ActiveSession, 'id' | 'startedAt'>): number {
  const id = nextSessionId++;
  activeSessions.set(id, { id, ...info, startedAt: new Date().toISOString() });
  return id;
}

export function streamEnded(id: number): void {
  activeSessions.delete(id);
}

/** Oldest first, so a long-running listen stays put instead of jumping around. */
export function listActiveSessions(): ActiveSession[] {
  return [...activeSessions.values()];
}

export function recordStreamError(trackId: number, message: string): void {
  recentErrors.unshift({ timestamp: new Date().toISOString(), trackId, message });
  recentErrors.length = Math.min(recentErrors.length, MAX_RECENT_ERRORS);
}

export function getHealthSnapshot(now: number = Date.now()): HealthSnapshot {
  const degradedSince = now - DEGRADED_WINDOW_MS;
  const stillDegraded = recentErrors.some((e) => Date.parse(e.timestamp) >= degradedSince);

  return {
    status: stillDegraded ? 'degraded' : 'ok',
    uptimeSeconds: Math.floor((now - startedAt) / 1000),
    activeStreams: activeSessions.size,
    activeTranscodes: getActiveTranscodes(),
    recentErrors: recentErrors.slice(0, RECENT_ERRORS_RETURNED),
  };
}

/** Test seam — the counters and the error ring are module state. */
export function resetStreamMonitor(): void {
  activeSessions.clear();
  recentErrors.length = 0;
}
