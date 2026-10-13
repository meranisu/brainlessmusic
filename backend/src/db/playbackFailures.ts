import { db } from './connection.js';

export type PlaybackFailureSource = 'client' | 'server';

export interface PlaybackFailureInput {
  userId: number;
  trackId: number;
  source: PlaybackFailureSource;
  message: string;
  mediaErrorCode?: number;
  contentType?: string;
  userAgent?: string;
}

export interface PlaybackFailureEntry {
  id: number;
  trackId: number;
  trackTitle: string | null;
  userId: number;
  username: string;
  source: PlaybackFailureSource;
  message: string;
  mediaErrorCode: number | null;
  contentType: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Rows kept. Any signed-in user can report a failure, so the table must not grow with them (C4). */
export const PLAYBACK_FAILURES_KEPT = 1000;

/** Longest stored text per field. A real decode error is a sentence; anything longer is cut, not refused. */
const MAX_MESSAGE_LENGTH = 500;
const MAX_SHORT_FIELD_LENGTH = 200;

function clip(value: string | undefined, max: number): string | null {
  return value === undefined ? null : value.slice(0, max);
}

/** Records one failure and drops the oldest rows past `PLAYBACK_FAILURES_KEPT`. */
export function recordPlaybackFailure(input: PlaybackFailureInput): void {
  db.prepare(
    `INSERT INTO playback_failures
       (user_id, track_id, source, message, media_error_code, content_type, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.userId,
    input.trackId,
    input.source,
    clip(input.message, MAX_MESSAGE_LENGTH),
    input.mediaErrorCode ?? null,
    clip(input.contentType, MAX_SHORT_FIELD_LENGTH),
    clip(input.userAgent, MAX_SHORT_FIELD_LENGTH),
  );

  db.prepare(
    `DELETE FROM playback_failures
     WHERE id NOT IN (SELECT id FROM playback_failures ORDER BY id DESC LIMIT ?)`,
  ).run(PLAYBACK_FAILURES_KEPT);
}

const DEFAULT_LIMIT = 100;

/** Rows stored, for paging (at most `PLAYBACK_FAILURES_KEPT`). */
export function countPlaybackFailures(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM playback_failures').get() as { n: number }).n;
}

/** Newest first; `offset` skips that many of the newest. */
export function listRecentPlaybackFailures(limit = DEFAULT_LIMIT, offset = 0): PlaybackFailureEntry[] {
  return db
    .prepare(
      `SELECT
         pf.id AS id,
         pf.track_id AS trackId,
         t.title AS trackTitle,
         pf.user_id AS userId,
         u.username AS username,
         pf.source AS source,
         pf.message AS message,
         pf.media_error_code AS mediaErrorCode,
         pf.content_type AS contentType,
         pf.user_agent AS userAgent,
         pf.created_at AS createdAt
       FROM playback_failures pf
       JOIN users u ON u.id = pf.user_id
       LEFT JOIN tracks t ON t.id = pf.track_id
       ORDER BY pf.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as PlaybackFailureEntry[];
}
