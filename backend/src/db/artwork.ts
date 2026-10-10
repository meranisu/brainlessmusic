import { db } from './connection.js';

/** The track's own embedded art, else its album's. */
export function findTrackArtworkId(trackId: number): string | undefined {
  const row = db
    .prepare(
      `SELECT COALESCE(t.artwork_id, a.artwork_id) AS artwork_id
         FROM tracks t
         LEFT JOIN albums a ON a.id = t.album_id
        WHERE t.id = ?`,
    )
    .get(trackId) as { artwork_id: string | null } | undefined;

  return row?.artwork_id ?? undefined;
}

export function findAlbumArtworkId(albumId: number): string | undefined {
  const row = db.prepare('SELECT artwork_id FROM albums WHERE id = ?').get(albumId) as
    | { artwork_id: string | null }
    | undefined;

  return row?.artwork_id ?? undefined;
}

export function setTrackArtwork(trackId: number, artworkId: string): void {
  db.prepare('UPDATE tracks SET artwork_id = ? WHERE id = ?').run(artworkId, trackId);
}

/** First cover found wins, so a re-scan never flips an album's cover. */
export function setAlbumArtworkIfMissing(albumId: number, artworkId: string): void {
  db.prepare('UPDATE albums SET artwork_id = ? WHERE id = ? AND artwork_id IS NULL').run(
    artworkId,
    albumId,
  );
}
