import { db } from './connection.js';

export interface PlayHistoryEntry {
  id: number;
  trackId: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  format: string | null;
  playedAt: string;
  msPlayed: number | null;
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
  format: string | null;
  playCount: number;
  lastPlayedAt: string | null;
}

/**
 * Records a play and updates the track's denormalized play_count/last_played_at
 * in one transaction, so the two never drift out of sync.
 */
export const recordScrobble = db.transaction(
  (userId: number, trackId: number, msPlayed: number | null): void => {
    db.prepare(
      'INSERT INTO play_history (user_id, track_id, ms_played) VALUES (?, ?, ?)',
    ).run(userId, trackId, msPlayed);

    db.prepare(
      `UPDATE tracks
       SET play_count = play_count + 1, last_played_at = datetime('now')
       WHERE id = ?`,
    ).run(trackId);
  },
);

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
  return db
    .prepare(
      `SELECT
         ph.id as id,
         ph.track_id as trackId,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.duration as duration,
         t.format as format,
         ph.played_at as playedAt,
         ph.ms_played as msPlayed
       FROM play_history ph
       JOIN tracks t ON t.id = ph.track_id
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE ph.user_id = ?
       ORDER BY ph.played_at DESC, ph.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset) as PlayHistoryEntry[];
}

export function countHistoryForTrack(trackId: number): number {
  return (
    db.prepare('SELECT COUNT(*) as count FROM play_history WHERE track_id = ?').get(trackId) as {
      count: number;
    }
  ).count;
}

/**
 * Play history for one track, across all users — this project is just the
 * owner + a couple of friends, so a shared listening log reads more useful
 * than per-user isolation here (unlike playlists, which stay private).
 */
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
       WHERE ph.track_id = ?
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
         t.format as format,
         t.play_count as playCount,
         t.last_played_at as lastPlayedAt
       FROM tracks t
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE t.play_count > 0
       ORDER BY t.play_count DESC, t.last_played_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as TopTrack[];
}

export function countTopTracks(): number {
  return (
    db.prepare('SELECT COUNT(*) as count FROM tracks WHERE play_count > 0').get() as {
      count: number;
    }
  ).count;
}
