import { db } from './connection.js';
import { trackGainSql } from './loudness.js';

export interface PlayHistoryEntry {
  id: number;
  trackId: number;
  title: string;
  artist: string | null;
  album: string | null;
  albumId: number | null;
  trackNumber: number | null;
  duration: number | null;
  gainDb: number | null;
  format: string | null;
  playedAt: string;
  msPlayed: number | null;
  /** The file is gone from disk: shown, but it can't be played (the You tab's Recently played skips it). */
  missing: boolean;
  /** Cut short before the scrobble threshold (A113). */
  skipped: boolean;
}

export interface TrackPlayHistoryEntry {
  id: number;
  userId: number;
  username: string;
  playedAt: string;
  msPlayed: number | null;
}

export interface TopTrack {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  gainDb: number | null;
  format: string | null;
  playCount: number;
  lastPlayedAt: string | null;
}

/**
 * Records a play and updates play_count/last_played_at in one transaction. Built on first call, since
 * `db.transaction()` opens the connection.
 */
let scrobbleTransaction:
  | ((
      userId: number,
      trackId: number,
      msPlayed: number | null,
      playedAt: string | null,
      clientPlayId: string | null,
      skipped: boolean,
    ) => number)
  | null = null;

/**
 * Returns the new play's id, which the app uses to report the final listening time (A62). [playedAt] is when a play
 * made offline happened (A87), in SQLite's `datetime('now')` shape; null means now. A late play never moves the track's
 * `last_played_at` back. The same play sent twice (the phone resends one whose answer it never got) is counted once:
 * the second send returns the first one's id. [clientPlayId], the app's own id for the play, is how that is matched
 * (C10); without one, an offline play is matched on `played_at`, which a skewed phone clock defeats. A [skipped] play
 * (A113) is sent once, at its end, with its final length, and leaves the track's counters alone.
 */
export function recordScrobble(
  userId: number,
  trackId: number,
  msPlayed: number | null,
  playedAt: string | null = null,
  clientPlayId: string | null = null,
  skipped = false,
): number {
  scrobbleTransaction ??= buildScrobbleTransaction();
  return scrobbleTransaction(userId, trackId, msPlayed, playedAt, clientPlayId, skipped);
}

function buildScrobbleTransaction() {
  return db.transaction(
    (
      userId: number,
      trackId: number,
      msPlayed: number | null,
      playedAt: string | null,
      clientPlayId: string | null,
      skipped: boolean,
    ): number => {
      if (clientPlayId) {
        const sent = db
          .prepare('SELECT id FROM play_history WHERE user_id = ? AND client_play_id = ?')
          .get(userId, clientPlayId) as { id: number } | undefined;
        if (sent) return sent.id;
      } else if (playedAt) {
        const sent = db
          .prepare('SELECT id FROM play_history WHERE user_id = ? AND track_id = ? AND played_at = ?')
          .get(userId, trackId, playedAt) as { id: number } | undefined;
        if (sent) return sent.id;
      }

      const playId = Number(
        db
          .prepare(
            `INSERT INTO play_history (user_id, track_id, ms_played, played_at, client_play_id, skipped, ms_final)
             VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?)`,
          )
          .run(userId, trackId, msPlayed, playedAt, clientPlayId, skipped ? 1 : 0, skipped ? 1 : 0).lastInsertRowid,
      );

      // A skip's length is already final (it's sent at its end), so it needs no `finishPlay`.
      if (skipped) return playId;
      db.prepare(
        `UPDATE tracks
         SET play_count = play_count + 1,
             last_played_at = MAX(COALESCE(last_played_at, ''), COALESCE(?, datetime('now')))
         WHERE id = ?`,
      ).run(playedAt, trackId);
      return playId;
    },
  );
}

export function countHistoryForUser(userId: number): number {
  return (
    db.prepare('SELECT COUNT(*) as count FROM play_history WHERE user_id = ?').get(userId) as {
      count: number;
    }
  ).count;
}

export function listHistoryForUser(
  userId: number,
  limit: number,
  offset: number,
): PlayHistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT
         ph.id as id,
         ph.track_id as trackId,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.album_id as albumId,
         t.track_number as trackNumber,
         t.duration as duration,
         ${trackGainSql()} as gainDb,
         t.format as format,
         ph.played_at as playedAt,
         ph.ms_played as msPlayed,
         t.missing_since IS NOT NULL as missing,
         ph.skipped as skipped
       FROM play_history ph
       JOIN tracks t ON t.id = ph.track_id
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE ph.user_id = ?
       ORDER BY ph.played_at DESC, ph.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset) as (Omit<PlayHistoryEntry, 'missing' | 'skipped'> & { missing: number; skipped: number })[];
  return rows.map((row) => ({ ...row, missing: row.missing === 1, skipped: row.skipped === 1 }));
}

export function countHistoryForTrack(trackId: number): number {
  return (
    db.prepare('SELECT COUNT(*) as count FROM play_history WHERE track_id = ? AND skipped = 0').get(trackId) as {
      count: number;
    }
  ).count;
}

/** One track's plays across all users, skips left out (A113): a shared log suits a server for a few friends. */
export function listHistoryForTrack(
  trackId: number,
  limit: number,
  offset: number,
): TrackPlayHistoryEntry[] {
  return db
    .prepare(
      `SELECT
         ph.id as id,
         ph.user_id as userId,
         u.username as username,
         ph.played_at as playedAt,
         ph.ms_played as msPlayed
       FROM play_history ph
       JOIN users u ON u.id = ph.user_id
       WHERE ph.track_id = ? AND ph.skipped = 0
       ORDER BY ph.played_at DESC, ph.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(trackId, limit, offset) as TrackPlayHistoryEntry[];
}

export function listTopTracks(limit: number, offset: number): TopTrack[] {
  return db
    .prepare(
      `SELECT
         t.id as id,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.duration as duration,
         ${trackGainSql()} as gainDb,
         t.format as format,
         t.play_count as playCount,
         t.last_played_at as lastPlayedAt
       FROM tracks t
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE t.play_count > 0 AND t.missing_since IS NULL AND t.hidden = 0
       ORDER BY t.play_count DESC, t.last_played_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as TopTrack[];
}

export function countTopTracks(): number {
  return (
    db
      .prepare('SELECT COUNT(*) as count FROM tracks WHERE play_count > 0 AND missing_since IS NULL AND hidden = 0')
      .get() as {
      count: number;
    }
  ).count;
}
