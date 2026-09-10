import { extname } from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { config } from '../config.js';

const MIME_TYPES: Record<string, string> = {
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  // Raw ADTS. It plays, but it carries no index, so byte-offset seeks land
  // mid-frame — roadmap box 24 remuxes these to `.m4a` through the transcode
  // cache, which is where scrubbing them becomes reliable.
  '.aac': 'audio/aac',
};

export function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parses a single `Range: bytes=...` header against a known file size.
 * Only single-range requests are supported (no multipart ranges) — sufficient
 * for seeking/scrubbing, which is the only real client use case here.
 */
export function parseRange(
  rangeHeader: string | undefined,
  fileSize: number,
): ByteRange | 'none' | 'invalid' {
  if (!rangeHeader) return 'none';

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return 'invalid';

  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return 'invalid';

  let start: number;
  let end: number;

  if (startStr === '') {
    const suffixLength = Number(endStr);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return 'invalid';
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? fileSize - 1 : Number(endStr);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end) {
    return 'invalid';
  }
  if (start >= fileSize) return 'invalid';

  return { start, end: Math.min(end, fileSize - 1) };
}

// ---------------------------------------------------------------------------
// Cache validation
//
// Audio bytes are the largest thing this server sends and the least likely to
// change: a track row keeps its path for life, and editing tags rewrites the
// database, not the file. Without validators every replay of a song was a full
// re-download — the single biggest avoidable cost on a metered connection.
// ---------------------------------------------------------------------------

/**
 * A **strong** entity tag for a file, from its size and mtime — the same pair
 * nginx uses. Strong on purpose: a weak tag is not allowed to validate an
 * `If-Range`, so a weak one would silently disable resumable seeking, which is
 * the exact case this endpoint exists to serve.
 */
export function buildETag(fileSize: number, mtimeMs: number): string {
  return `"${fileSize.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

/** HTTP dates carry whole seconds, so mtime has to be compared at that resolution. */
function mtimeSeconds(mtimeMs: number): number {
  return Math.floor(mtimeMs / 1000);
}

function stripWeakPrefix(tag: string): string {
  return tag.startsWith('W/') ? tag.slice(2) : tag;
}

/** Splits an `If-None-Match` / `If-Range` list into its individual tags. */
function parseETagList(header: string): string[] {
  return header
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Whether the client already holds this exact representation, per RFC 9110's
 * precedence: `If-None-Match` decides on its own when present, and
 * `If-Modified-Since` is only consulted in its absence.
 */
export function isNotModified(
  headers: { ifNoneMatch?: string; ifModifiedSince?: string },
  etag: string,
  mtimeMs: number,
): boolean {
  const { ifNoneMatch, ifModifiedSince } = headers;

  if (ifNoneMatch !== undefined) {
    if (ifNoneMatch.trim() === '*') return true;
    // Weak comparison here — an `If-None-Match` match only has to mean
    // "equivalent enough to reuse", not "byte-identical".
    const wanted = stripWeakPrefix(etag);
    return parseETagList(ifNoneMatch).some((tag) => stripWeakPrefix(tag) === wanted);
  }

  if (ifModifiedSince !== undefined) {
    const since = Date.parse(ifModifiedSince);
    if (Number.isNaN(since)) return false;
    return mtimeSeconds(mtimeMs) <= mtimeSeconds(since);
  }

  return false;
}

/**
 * Whether a `Range` may be honoured given `If-Range`.
 *
 * A player that reconnects mid-track sends the range it left off at plus the
 * validator it had. If the file changed underneath, splicing new bytes into
 * the old ones hands the decoder a corrupt stream; the correct answer is to
 * ignore the range and resend the whole thing. No `If-Range` means the client
 * made no such claim, so the range stands.
 */
export function ifRangeAllowsRange(
  ifRange: string | undefined,
  etag: string,
  mtimeMs: number,
): boolean {
  if (ifRange === undefined) return true;

  const value = ifRange.trim();

  if (value.startsWith('"') || value.startsWith('W/')) {
    // Strong comparison is required for If-Range, so a weak tag never matches.
    return value === etag;
  }

  const asDate = Date.parse(value);
  if (Number.isNaN(asDate)) return false;
  return mtimeSeconds(mtimeMs) === mtimeSeconds(asDate);
}

// ---------------------------------------------------------------------------
// Transcoding
// ---------------------------------------------------------------------------

/** The data-saver target, in bits per second, and as ffmpeg spells it. */
export const LOW_QUALITY_BITRATE_BPS = 64_000;
const LOW_QUALITY_BITRATE = `${LOW_QUALITY_BITRATE_BPS / 1000}k`;

/**
 * Transcodes in flight.
 *
 * Every data-saver request starts a full-rate decode, so this is the one
 * endpoint where a handful of clients can saturate the box the rest of the app
 * runs on. The cap is a guard against runaway, not a routine path — with the
 * number of people this server has, reaching it means something is wrong.
 */
let activeTranscodes = 0;

function acquireTranscodeSlot(): boolean {
  if (activeTranscodes >= config.maxConcurrentTranscodes) return false;
  activeTranscodes++;
  return true;
}

function releaseTranscodeSlot(): void {
  activeTranscodes = Math.max(0, activeTranscodes - 1);
}

export function getActiveTranscodes(): number {
  return activeTranscodes;
}

// ---------------------------------------------------------------------------
// Encoding to a file
//
// The cache path, as opposed to the live-stream path above. Everything here
// produces a complete file on disk, which is what lets the stream route serve
// a transcode with byte ranges, an ETag and a 304 — exactly as it serves an
// original.
// ---------------------------------------------------------------------------

/** One thing the cache can hold for a track: a re-encode, or a re-containering. */
export interface Variant {
  /** Stable, and part of the cache key — changing it invalidates every entry. */
  id: string;
  extension: string;
  mimeType: string;
  configure: (command: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand;
}

/** The data-saver copy. */
export const LOW_QUALITY_VARIANT: Variant = {
  // The trailing `c` is for constrained VBR, and the id had to change with the
  // recipe: it is the cache key, so entries encoded the old way would otherwise
  // keep being served with nothing to tell them apart. Old `opus64-*` files are
  // simply never requested again and age out through the usual LRU eviction.
  id: 'opus64c',
  extension: '.ogg',
  mimeType: 'audio/ogg',
  configure: (c) =>
    c
      .noVideo()
      .audioCodec('libopus')
      .audioBitrate(LOW_QUALITY_BITRATE)
      // libopus reads `-b:a` as a VBR *target* and runs well over it: measured
      // 2026-09-10, asking for 64k produced 74.3 kbps. Constrained VBR holds
      // the number — 64.9 kbps on the same source. Worth 13% off the wire, and
      // worth more than that for making the configured target mean what it
      // says: `TRANSCODE_MIN_SOURCE_BITRATE_RATIO` is reasoned about in terms
      // of 64k, and until this it was reasoning about a figure that never
      // appeared.
      .outputOptions(['-vbr', 'constrained'])
      .format('ogg'),
};

/**
 * Raw ADTS, put into a real container.
 *
 * `copy` rather than a re-encode: the AAC frames are kept byte for byte, so
 * this costs no quality and runs at I/O speed. It exists because raw ADTS
 * carries no duration — measured 2026-09-10, a 25.0s file reports 37.9s to
 * both ffprobe and Chrome, which scales the seek bar by 50% and makes valid
 * `?t=` offsets look out of range. An MP4 container carries the real one.
 * `+faststart` moves the index to the front so playback can begin before the
 * whole file has arrived.
 */
export const REMUX_M4A_VARIANT: Variant = {
  id: 'm4a',
  extension: '.m4a',
  mimeType: 'audio/mp4',
  configure: (c) => c.noVideo().audioCodec('copy').outputOptions('-movflags', '+faststart').format('mp4'),
};

/** Thrown when every transcode slot is busy, so callers can answer 503 rather than 500. */
export class NoTranscodeSlotError extends Error {
  constructor() {
    super('No transcode slot available');
    this.name = 'NoTranscodeSlotError';
  }
}

/**
 * Encodes `sourcePath` to `destPath` and resolves when the file is complete.
 *
 * Holds a transcode slot for the whole encode, so the same ceiling that bounds
 * live transcodes bounds cache fills. A failure deletes whatever ffmpeg left
 * behind: a half-written file that nobody cleans up is worse than no file,
 * because the next reader cannot tell the difference.
 */
export async function encodeToFile(
  sourcePath: string,
  destPath: string,
  variant: Variant,
): Promise<void> {
  if (!acquireTranscodeSlot()) throw new NoTranscodeSlotError();

  try {
    await new Promise<void>((resolve, reject) => {
      variant
        .configure(ffmpeg(sourcePath))
        .on('error', (err: Error) => reject(err))
        .on('end', () => resolve())
        .save(destPath);
    });
  } finally {
    releaseTranscodeSlot();
  }
}
