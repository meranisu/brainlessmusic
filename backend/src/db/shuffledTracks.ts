import { db } from './connection.js';

/** Every track on disk and not hidden (the song list's set), by id so a seed always shuffles the same sequence. */
export function listPlayableTrackIds(): number[] {
  return (
    db.prepare('SELECT id FROM tracks WHERE missing_since IS NULL AND hidden = 0 ORDER BY id').all() as { id: number }[]
  ).map((row) => row.id);
}

export interface AlbumPlace {
  id: number;
  albumId: number | null;
  trackNumber: number | null;
}

/** Where each playable track sits in its album, by id, for album shuffle. */
export function listPlayableAlbumPlaces(): AlbumPlace[] {
  return db
    .prepare(
      `SELECT id, album_id AS albumId, track_number AS trackNumber FROM tracks
       WHERE missing_since IS NULL AND hidden = 0 ORDER BY id`,
    )
    .all() as AlbumPlace[];
}

/** When [userId] last played each track, counting only plays (not skips, A113) at or before [asOf] (`YYYY-MM-DD HH:MM:SS`, UTC). */
export function lastPlayedByUser(userId: number, asOf: string): Map<number, string> {
  const rows = db
    .prepare(
      `SELECT track_id AS trackId, MAX(played_at) AS playedAt FROM play_history
       WHERE user_id = ? AND played_at <= ? AND skipped = 0 GROUP BY track_id`,
    )
    .all(userId, asOf) as { trackId: number; playedAt: string }[];
  return new Map(rows.map((row) => [row.trackId, row.playedAt]));
}
