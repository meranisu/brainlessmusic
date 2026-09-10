import { db } from './connection.js';
import type { TrackSummary } from './browse.js';

/** The most tracks a saved queue may hold. */
export const MAX_QUEUE_LENGTH = 5000;

export interface PlaybackStateInput {
  /** Track ids in play order. */
  queue: number[];
  queueIndex: number;
  positionSeconds: number;
}

export interface PlaybackState {
  /** Hydrated and filtered — unplayable tracks are already gone from this. */
  queue: TrackSummary[];
  queueIndex: number;
  positionSeconds: number;
  updatedAt: string;
  /** True when tracks were dropped during hydration, so the client can say so. */
  queueRepaired: boolean;
}

interface StateRow {
  queue: string;
  queue_index: number;
  position_seconds: number;
  updated_at: string;
}

/**
 * Replaces the user's state outright.
 *
 * An upsert rather than an insert because the row is the user: `user_id` is the
 * primary key, so there is exactly one, and whichever device wrote last is the
 * one that is right.
 */
export function savePlaybackState(userId: number, state: PlaybackStateInput): void {
  db.prepare(
    `INSERT INTO playback_state (user_id, queue, queue_index, position_seconds, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       queue = excluded.queue,
       queue_index = excluded.queue_index,
       position_seconds = excluded.position_seconds,
       updated_at = excluded.updated_at`,
  ).run(userId, JSON.stringify(state.queue), state.queueIndex, state.positionSeconds);
}

export function clearPlaybackState(userId: number): void {
  db.prepare('DELETE FROM playback_state WHERE user_id = ?').run(userId);
}

/**
 * The saved state, with the queue hydrated into real rows.
 *
 * Two things can have happened to a queue between saving and loading, and
 * neither may be allowed to restore something unplayable: a track can have been
 * deleted outright, and a track can have gone missing from disk (the browse
 * endpoints already hide those, and resuming into one would hand the listener a
 * player that cannot play). Both are dropped here, which means the stored index
 * has to be re-derived rather than reused.
 *
 * Returns `null` when there is nothing left worth restoring.
 */
export function loadPlaybackState(userId: number): PlaybackState | null {
  const row = db
    .prepare(
      `SELECT queue, queue_index, position_seconds, updated_at
       FROM playback_state WHERE user_id = ?`,
    )
    .get(userId) as StateRow | undefined;
  if (!row) return null;

  const savedIds = parseQueue(row.queue);
  if (savedIds.length === 0) return null;

  const playable = fetchPlayable(savedIds);
  const queue = savedIds.map((id) => playable.get(id)).filter((t): t is TrackSummary => t != null);
  if (queue.length === 0) return null;

  const savedIndex = clampIndex(row.queue_index, savedIds.length);
  const currentId = savedIds[savedIndex];

  let queueIndex: number;
  let positionSeconds: number;

  if (playable.has(currentId)) {
    // The track being played is still here; only its neighbours may have moved.
    queueIndex = queue.findIndex((t) => t.id === currentId);
    positionSeconds = Math.max(0, row.position_seconds);
  } else {
    // The track itself is gone. Resume at the next survivor rather than the
    // first one — the listener was partway through a queue, and dropping them
    // back at its start is a worse guess than moving them forward by one.
    // Its position means nothing now, so it does not carry over.
    const nextId = savedIds.slice(savedIndex + 1).find((id) => playable.has(id));
    queueIndex = nextId == null ? 0 : queue.findIndex((t) => t.id === nextId);
    positionSeconds = 0;
  }

  return {
    queue,
    queueIndex,
    positionSeconds,
    updatedAt: row.updated_at,
    queueRepaired: queue.length !== savedIds.length,
  };
}

/** Tolerates anything the column might hold — a bad row loses the queue, not the request. */
function parseQueue(raw: string): number[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => Number.isInteger(id));
  } catch {
    return [];
  }
}

function clampIndex(index: number, length: number): number {
  if (!Number.isInteger(index) || index < 0) return 0;
  return Math.min(index, length - 1);
}

/**
 * The playable subset of the given ids, keyed by id.
 *
 * One query rather than one per track: a saved queue can be the whole library.
 * `missing_since IS NULL` is the same rule the browse queries apply, so a track
 * hidden from the library table cannot come back through a resumed queue.
 */
function fetchPlayable(ids: number[]): Map<number, TrackSummary> {
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT
         t.id as id,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.duration as duration,
         t.format as format,
         t.hidden as hidden,
         t.not_recommended as notRecommended,
         t.play_count as playCount
       FROM tracks t
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE t.id IN (${placeholders}) AND t.missing_since IS NULL`,
    )
    .all(...ids) as (Omit<TrackSummary, 'hidden' | 'notRecommended' | 'missing'> & {
    hidden: number;
    notRecommended: number;
  })[];

  return new Map(
    rows.map((r) => [
      r.id,
      { ...r, hidden: Boolean(r.hidden), notRecommended: Boolean(r.notRecommended), missing: false },
    ]),
  );
}
