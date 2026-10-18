import { db } from './connection.js';
import { getTrackSummariesByIds, type TrackSummary } from './browse.js';
import { clearSmartSummaries } from './smartPlaylists.js';

export interface FavoriteTrack extends TrackSummary {
  favoritedAt: string;
}

/** Idempotent. */
export function starTrack(userId: number, trackId: number): void {
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, track_id) VALUES (?, ?)').run(
    userId,
    trackId,
  );
  clearSmartSummaries(userId);
}

/** Idempotent. */
export function unstarTrack(userId: number, trackId: number): void {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND track_id = ?').run(userId, trackId);
  clearSmartSummaries(userId);
}

/** Favorite ids only: the client keeps them as one set for every view, instead of each browse query joining favorites. */
export function listFavoriteTrackIdsForUser(userId: number): number[] {
  return db
    .prepare('SELECT track_id FROM favorites WHERE user_id = ? ORDER BY track_id')
    .all(userId)
    .map((row) => (row as { track_id: number }).track_id);
}

/** Leaves out hidden songs when [includeHidden] is false: someone else's profile, unless an admin is looking (A34). */
function hiddenJoin(includeHidden: boolean): string {
  return includeHidden ? '' : 'JOIN tracks t ON t.id = f.track_id AND t.hidden = 0';
}

export function countFavoritesForUser(userId: number, includeHidden = true): number {
  return (
    db.prepare(`SELECT COUNT(*) as count FROM favorites f ${hiddenJoin(includeHidden)} WHERE f.user_id = ?`).get(userId) as {
      count: number;
    }
  ).count;
}

export function listFavoritesForUser(
  userId: number,
  limit: number,
  offset: number,
  includeHidden = true,
): FavoriteTrack[] {
  const page = db
    .prepare(
      `SELECT f.track_id as id, f.created_at as favoritedAt
       FROM favorites f ${hiddenJoin(includeHidden)}
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC, f.track_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset) as { id: number; favoritedAt: string }[];
  // Full summaries, as `FavoriteTrack` promises: Android reads each as a `TrackSummaryDto`, and the players need
  // `albumId` and `trackNumber` (A72).
  const byId = new Map(getTrackSummariesByIds(page.map((row) => row.id)).map((track) => [track.id, track]));
  return page.flatMap((row) => {
    const track = byId.get(row.id);
    return track ? [{ ...track, favoritedAt: row.favoritedAt }] : [];
  });
}
