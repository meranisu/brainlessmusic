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
  // Raw ADTS has no index, so byte seeks land mid-frame; it is remuxed to `.m4a` (REMUX_M4A_VARIANT).
  '.aac': 'audio/aac',
};

export function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Containers WebKit can't open at any bitrate; see `isWebKitOnlyClient`. */
export const WEBKIT_INCOMPATIBLE_EXTENSIONS = new Set(['.opus', '.ogg']);

/**
 * True for browsers that can't open Ogg or Opus: every iOS browser (Apple forces WebKit) and desktop Safari.
 * Sniffed from User-Agent, since `<audio src>` sends no codec hints.
 */
export function isWebKitOnlyClient(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  // Every iOS browser runs WebKit, whatever its UA token says (CriOS, FxiOS, EdgiOS, WebView).
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // Desktop Safari: Chromium browsers also say "Safari/", so rule them out first.
  return /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|Edg\/|OPR\//.test(userAgent);
}

export interface ByteRange {
  start: number;
  end: number;
}

/** Parses one `Range: bytes=...` header; multipart ranges aren't supported, and seeking doesn't need them. */
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

// Cache validation. A track's file never changes under its row (tag edits touch
// the database), so validators turn every replay into a 304 instead of a re-download.

/** A strong ETag from size and mtime, like nginx. Weak tags can't validate `If-Range`, which resumable seeking needs. */
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

/** RFC 9110 precedence: `If-None-Match` decides alone when present; `If-Modified-Since` only without it. */
export function isNotModified(
  headers: { ifNoneMatch?: string; ifModifiedSince?: string },
  etag: string,
  mtimeMs: number,
): boolean {
  const { ifNoneMatch, ifModifiedSince } = headers;

  if (ifNoneMatch !== undefined) {
    if (ifNoneMatch.trim() === '*') return true;
    // Weak comparison: `If-None-Match` only needs "equivalent".
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

/** Whether a `Range` stands under `If-Range`: if the file changed, resend it whole. No `If-Range` keeps the range. */
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

// Transcoding.

/** The data-saver target, in bits per second, and as ffmpeg spells it. */
export const LOW_QUALITY_BITRATE_BPS = 64_000;
const LOW_QUALITY_BITRATE = `${LOW_QUALITY_BITRATE_BPS / 1000}k`;

/** Transcodes in flight. The cap guards the box against runaway encodes; reaching it means something is wrong. */
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

// Encoding to a file: the cache path. A complete file on disk is what lets a
// transcode be served with byte ranges, an ETag and a 304, like an original.

/** One thing the cache can hold for a track: a re-encode, or a re-containering. */
export interface Variant {
  /** Part of the cache key; changing it invalidates every entry. */
  id: string;
  extension: string;
  mimeType: string;
  configure: (command: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand;
}

/** The data-saver copy. */
export const LOW_QUALITY_VARIANT: Variant = {
  // `c` = constrained VBR. The id changed with the recipe because it is the cache key; old entries age out via LRU.
  id: 'opus64c',
  extension: '.ogg',
  mimeType: 'audio/ogg',
  configure: (c) =>
    c
      .noVideo()
      .audioCodec('libopus')
      .audioBitrate(LOW_QUALITY_BITRATE)
      // libopus treats `-b:a` as a loose VBR target (64k gave 74.3 kbps); constrained VBR holds it (64.9 kbps).
      .outputOptions(['-vbr', 'constrained'])
      .format('ogg'),
};

/**
 * Raw ADTS copied, not re-encoded, into MP4, which carries a real duration (a 25 s ADTS file reports 37.9 s).
 * `+faststart` lets playback begin before the file arrives.
 */
export const REMUX_M4A_VARIANT: Variant = {
  id: 'm4a',
  extension: '.m4a',
  mimeType: 'audio/mp4',
  configure: (c) => c.noVideo().audioCodec('copy').outputOptions('-movflags', '+faststart').format('mp4'),
};

/** Bitrate for the WebKit copy, chosen to sound like the source; this variant fixes playback, not size. */
export const WEBKIT_COMPAT_BITRATE_BPS = 192_000;
const WEBKIT_COMPAT_BITRATE = `${WEBKIT_COMPAT_BITRATE_BPS / 1000}k`;

/** Opus/Ogg re-encoded to AAC in M4A for WebKit. Lossy on top of lossy, but the alternative is no playback. */
export const WEBKIT_COMPAT_VARIANT: Variant = {
  id: 'webkitcompat',
  extension: '.m4a',
  mimeType: 'audio/mp4',
  configure: (c) =>
    c
      .noVideo()
      .audioCodec('aac')
      .audioBitrate(WEBKIT_COMPAT_BITRATE)
      .outputOptions('-movflags', '+faststart')
      .format('mp4'),
};

/** Thrown when every transcode slot is busy, so callers can answer 503 rather than 500. */
export class NoTranscodeSlotError extends Error {
  constructor() {
    super('No transcode slot available');
    this.name = 'NoTranscodeSlotError';
  }
}

/** Encodes to `destPath`, holding a transcode slot throughout. On failure the partial file is deleted. */
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
