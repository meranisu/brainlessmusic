import { db } from './connection.js';
import type { TrackSummary } from './browse.js';

export interface FavoriteTrack extends TrackSummary {
  favoritedAt: string;
}

/** Idempotent. */
export function starTrack(userId: number, trackId: number): void {
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, track_id) VALUES (?, ?)').run(
    userId,
    trackId,
  );
}

/** Idempotent. */
export function unstarTrack(userId: number, trackId: number): void {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND track_id = ?').run(userId, trackId);
}

/** Favorite ids only: the client keeps them as one set for every view, instead of each browse query joining favorites. */
export function listFavoriteTrackIdsForUser(userId: number): number[] {
  return db
    .prepare('SELECT track_id FROM favorites WHERE user_id = ? ORDER BY track_id')
    .all(userId)
    .map((row) => (row as { track_id: number }).track_id);
}

export function countFavoritesForUser(userId: number): number {
  return (
    db.prepare('SELECT COUNT(*) as count FROM favorites WHERE user_id = ?').get(userId) as {
      count: number;
    }
  ).count;
}

export function listFavoritesForUser(
  userId: number,
  limit: number,
  offset: number,
): FavoriteTrack[] {
  return db
    .prepare(
      `SELECT
         t.id as id,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.duration as duration,
         t.format as format,
         f.created_at as favoritedAt
       FROM favorites f
       JOIN tracks t ON t.id = f.track_id
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC, f.track_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset) as FavoriteTrack[];
}
