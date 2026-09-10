import { basename, extname } from 'node:path';
import { parseFile } from 'music-metadata';
import type { EmbeddedPicture } from './artwork.js';

/**
 * What the library accepts. Every one of these is decoded by `music-metadata`
 * for tags and by ffmpeg for waveforms, and plays natively in Chrome on
 * desktop and Android — the only targets (iOS/Safari is out of scope, decided
 * 2026-09-10).
 *
 * `.wav` and `.aac` joined on 2026-09-10. Two things about them are worth
 * knowing at the call sites: WAV runs about 10 MB per minute, and raw ADTS
 * `.aac` usually carries no tags and no cover at all, so it leans entirely on
 * the filename fallback below.
 */
export const AUDIO_EXTENSIONS = new Set(['.flac', '.opus', '.mp3', '.m4a', '.ogg', '.wav', '.aac']);

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
  /** First embedded cover, if the file has one. Returned here rather than from
   *  a separate call so a scan parses each file exactly once. */
  picture: EmbeddedPicture | null;
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
    picture: common.picture?.[0]
      ? { data: common.picture[0].data, format: common.picture[0].format }
      : null,
  };
}
