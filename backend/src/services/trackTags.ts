import { basename, extname } from 'node:path';
import { parseFile } from 'music-metadata';

export const AUDIO_EXTENSIONS = new Set(['.flac', '.opus', '.mp3', '.m4a', '.ogg']);

export interface TrackTags {
  title: string;
  artistName: string;
  albumTitle: string | null;
  albumYear: number | null;
  trackNumber: number | null;
  duration: number | null;
  format: string | null;
  bitrate: number | null;
  sampleRate: number | null;
}

/**
 * Reads tags via music-metadata, applying the same fallbacks everywhere a file
 * gets tagged (scan or upload): missing title -> filename, missing artist ->
 * "Unknown Artist".
 *
 * `fileNamePath` supplies the name used for the missing-title fallback — it
 * defaults to `filePath` (meaningful for library/scanned files) but callers
 * reading a staged upload (named by a random id, not the user's filename)
 * should pass the original client-supplied filename instead.
 */
export async function extractTrackTags(
  filePath: string,
  fileNamePath: string = filePath,
): Promise<TrackTags> {
  const { common, format } = await parseFile(filePath, { duration: true });

  const fileNameWithoutExt = basename(fileNamePath, extname(fileNamePath));
  const title = common.title?.trim() || fileNameWithoutExt;
  const artistName = common.artist?.trim() || common.albumartist?.trim() || 'Unknown Artist';
  const albumTitle = common.album?.trim() || null;

  return {
    title,
    artistName,
    albumTitle,
    albumYear: common.year ?? null,
    trackNumber: common.track?.no ?? null,
    duration: format.duration ?? null,
    format: format.codec ?? format.container ?? extname(filePath).slice(1).toUpperCase(),
    bitrate: format.bitrate ? Math.round(format.bitrate) : null,
    sampleRate: format.sampleRate ?? null,
  };
}
