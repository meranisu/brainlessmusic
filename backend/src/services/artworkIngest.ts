import { setAlbumArtworkIfMissing, setTrackArtwork } from '../db/artwork.js';
import { storeArtwork, type EmbeddedPicture } from './artwork.js';

/**
 * Stores a track's cover and points the track (and its album, if coverless) at it, for scanner and upload alike.
 * Kept out of `artwork.ts` so that module's tests don't pull in the database. Failures never fail the import.
 */
export async function persistArtwork(
  artworkRoot: string,
  trackId: number,
  albumId: number | null,
  picture: EmbeddedPicture | null,
): Promise<string | null> {
  if (!picture) return null;

  try {
    const artworkId = await storeArtwork(artworkRoot, picture);
    if (!artworkId) return null;

    setTrackArtwork(trackId, artworkId);
    if (albumId !== null) setAlbumArtworkIfMissing(albumId, artworkId);

    return artworkId;
  } catch (err) {
    console.error(`Failed to store artwork for track ${trackId}:`, err);
    return null;
  }
}
