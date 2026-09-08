import { db } from './connection.js';

/**
 * Resolves which image to serve for a track: its own embedded art if it has
 * any, otherwise its album's. The fallback is what makes a compilation look
 * right — tracks without their own art still show the album cover.
 */
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

/**
 * First cover found among an album's tracks wins. Deliberately does not
 * overwrite: re-scanning shouldn't make an album's cover flip depending on
 * which file the walker reached last.
 */
export function setAlbumArtworkIfMissing(albumId: number, artworkId: string): void {
  db.prepare('UPDATE albums SET artwork_id = ? WHERE id = ? AND artwork_id IS NULL').run(
    artworkId,
    albumId,
  );
}
