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

const startedAt = Date.now();
let activeStreams = 0;
const recentErrors: StreamErrorEntry[] = [];

export function streamStarted(): void {
  activeStreams++;
}

export function streamEnded(): void {
  activeStreams = Math.max(0, activeStreams - 1);
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
    activeStreams,
    activeTranscodes: getActiveTranscodes(),
    recentErrors: recentErrors.slice(0, RECENT_ERRORS_RETURNED),
  };
}

/** Test seam — the counters and the error ring are module state. */
export function resetStreamMonitor(): void {
  activeStreams = 0;
  recentErrors.length = 0;
}
