import { setAlbumArtworkIfMissing, setTrackArtwork } from '../db/artwork.js';
import { storeArtwork, type EmbeddedPicture } from './artwork.js';

/**
 * Stores a track's embedded cover and points both the track and (if it has
 * none yet) its album at it. Shared by the scanner and the upload route so
 * both ingest paths behave identically.
 *
 * Kept out of `artwork.ts` on purpose: that module is pure filesystem and
 * validation logic, so its unit tests can import it without `db/connection.ts`
 * — which opens the configured SQLite file as an import side effect — coming
 * along and touching the real database.
 *
 * Artwork failures are swallowed deliberately: a cover that won't write is not
 * a reason to fail the import of a perfectly good audio file.
 */
export async function persistArtwork(
  trackId: number,
  albumId: number | null,
  picture: EmbeddedPicture | null,
): Promise<string | null> {
  if (!picture) return null;

  try {
    const artworkId = await storeArtwork(picture);
    if (!artworkId) return null;

    setTrackArtwork(trackId, artworkId);
    if (albumId !== null) setAlbumArtworkIfMissing(albumId, artworkId);

    return artworkId;
  } catch (err) {
    console.error(`Failed to store artwork for track ${trackId}:`, err);
    return null;
  }
}
