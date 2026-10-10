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

/** How recent an error must be to mean "degraded". Older errors stay listed as history; only the verdict expires. */
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

/**
 * A player that checked in through `PUT /me/playback-state`. Open streams alone can't answer "who is listening":
 * both clients fetch a whole file in seconds and close the connection, so a stream lasts far shorter than the song.
 */
export interface Listener {
  userId: number;
  username: string;
  client: string;
  trackId: number;
  trackTitle: string;
  positionSeconds: number;
  /** When this device started the current track, as far as the server saw. */
  since: string;
}

/** Players check in every 10 s while playing; three missed check-ins means gone. */
export const LISTENER_TTL_MS = 30 * 1000;

// Keyed by user and User-Agent, so one account on a phone and a browser shows twice.
const listeners = new Map<string, Listener & { lastSeenAt: number }>();

export function clientLabel(userAgent: string | undefined): string {
  return userAgent && /okhttp/i.test(userAgent) ? 'Android app' : 'Web';
}

/** `playing: false` removes the player at once; an older client that never sends it counts as playing. */
export function playerCheckedIn(
  info: Omit<Listener, 'client' | 'since'> & { userAgent: string | undefined; playing: boolean },
  now: number = Date.now(),
): void {
  const key = `${info.userId}\n${info.userAgent ?? ''}`;
  if (!info.playing) {
    listeners.delete(key);
    return;
  }
  const previous = listeners.get(key);
  const since =
    previous && previous.trackId === info.trackId && now - previous.lastSeenAt < LISTENER_TTL_MS
      ? previous.since
      : new Date(now).toISOString();
  listeners.set(key, {
    userId: info.userId,
    username: info.username,
    client: clientLabel(info.userAgent),
    trackId: info.trackId,
    trackTitle: info.trackTitle,
    positionSeconds: info.positionSeconds,
    since,
    lastSeenAt: now,
  });
}

/** Closing the player on any device drops that device. */
export function playerClosed(userId: number, userAgent: string | undefined): void {
  listeners.delete(`${userId}\n${userAgent ?? ''}`);
}

/** Players heard from within the TTL, oldest listen first. */
export function listListeners(now: number = Date.now()): Listener[] {
  const live: Listener[] = [];
  for (const [key, { lastSeenAt, ...listener }] of listeners) {
    if (now - lastSeenAt >= LISTENER_TTL_MS) listeners.delete(key);
    else live.push(listener);
  }
  return live.sort((a, b) => a.since.localeCompare(b.since));
}

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

/** Test seam: the counters and the error ring are module state. */
export function resetStreamMonitor(): void {
  activeSessions.clear();
  listeners.clear();
  recentErrors.length = 0;
}
