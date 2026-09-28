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

export function recordPlaybackFailure(input: PlaybackFailureInput): void {
  db.prepare(
    `INSERT INTO playback_failures
       (user_id, track_id, source, message, media_error_code, content_type, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.userId,
    input.trackId,
    input.source,
    input.message,
    input.mediaErrorCode ?? null,
    input.contentType ?? null,
    input.userAgent ?? null,
  );
}

const DEFAULT_LIMIT = 100;

/** Newest first — the ones worth looking at are always the most recent ones. */
export function listRecentPlaybackFailures(limit = DEFAULT_LIMIT): PlaybackFailureEntry[] {
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
       LIMIT ?`,
    )
    .all(limit) as PlaybackFailureEntry[];
}
