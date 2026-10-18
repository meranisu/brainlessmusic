import { db } from './connection.js';
import { trackGainSql } from './loudness.js';
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
  /** Unplayable tracks are already removed. */
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

/** Replaces the user's state: one row per user, last write wins. */
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

/** The saved state with deleted and missing tracks dropped and the index re-derived. `null` if nothing playable is left. */
export function loadPlaybackState(userId: number, includeHidden = false): PlaybackState | null {
  const row = db
    .prepare(
      `SELECT queue, queue_index, position_seconds, updated_at
       FROM playback_state WHERE user_id = ?`,
    )
    .get(userId) as StateRow | undefined;
  if (!row) return null;

  const savedIds = parseQueue(row.queue);
  if (savedIds.length === 0) return null;

  const playable = fetchPlayable(savedIds, includeHidden);
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
    // The current track is gone: move to the next survivor, at position 0.
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

/** A bad row loses the queue, not the request. */
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

/** The playable subset, in one query. Missing tracks are dropped, and hidden ones unless the caller is an admin (A34), as in browse. */
function fetchPlayable(ids: number[], includeHidden: boolean): Map<number, TrackSummary> {
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT
         t.id as id,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.album_id as albumId,
         t.track_number as trackNumber,
         t.duration as duration,
         ${trackGainSql()} as gainDb,
         t.format as format,
         t.hidden as hidden,
         t.not_recommended as notRecommended,
         t.play_count as playCount
       FROM tracks t
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE t.id IN (${placeholders}) AND t.missing_since IS NULL${includeHidden ? '' : ' AND t.hidden = 0'}`,
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
