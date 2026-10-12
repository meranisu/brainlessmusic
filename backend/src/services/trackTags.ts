import { basename, extname } from 'node:path';
import { parseFile } from 'music-metadata';
import type { EmbeddedPicture } from './artwork.js';

/**
 * Accepted formats: tags via `music-metadata`, waveforms via ffmpeg. WAV is about 10 MB a minute, and raw ADTS `.aac`
 * usually has no tags or cover, so it relies on the filename fallback.
 */
export const AUDIO_EXTENSIONS = new Set(['.flac', '.opus', '.mp3', '.m4a', '.ogg', '.wav', '.aac']);

export interface TrackTags {
  title: string;
  artistName: string;
  /** The albumartist tag; null when the file has none, and the album's artist is then worked out from its tracks. */
  albumArtistName: string | null;
  /** The compilation flag (TCMP / cpil / COMPILATION). Files the album under Various Artists. */
  compilation: boolean;
  albumTitle: string | null;
  albumYear: number | null;
  trackNumber: number | null;
  duration: number | null;
  format: string | null;
  bitrate: number | null;
  sampleRate: number | null;
  /** First embedded cover, if the file has one. Returned here rather than from
   *  a separate call so a scan parses each file exactly once. */
  picture: EmbeddedPicture | null;
}

/**
 * Reads tags with the shared fallbacks (title → filename, artist → "Unknown Artist"). Staged uploads have random names,
 * so pass the client's filename as `fileNamePath`.
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
    albumArtistName: common.albumartist?.trim() || null,
    compilation: common.compilation === true,
    albumTitle,
    albumYear: common.year ?? null,
    trackNumber: common.track?.no ?? null,
    duration: format.duration ?? null,
    format: format.codec ?? format.container ?? extname(filePath).slice(1).toUpperCase(),
    bitrate: format.bitrate ? Math.round(format.bitrate) : null,
    sampleRate: format.sampleRate ?? null,
    picture: common.picture?.[0]
      ? { data: common.picture[0].data, format: common.picture[0].format }
      : null,
  };
}
