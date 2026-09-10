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

const LOW_QUALITY_BITRATE = '64k';

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

/**
 * Where to start a transcode, parsed from `?t=`.
 *
 * The transcoded stream has no length and no byte ranges, so a client cannot
 * seek it the way it seeks a file — the only way back into the middle of a
 * track is to ask for a new stream that begins there. `'invalid'` is a bad
 * request rather than a clamp: silently starting somewhere the caller didn't
 * ask for is how a scrubber ends up lying about where playback is.
 */
export function parseStreamOffset(
  raw: string | undefined,
  durationSeconds: number | null,
): number | 'invalid' {
  if (raw === undefined || raw === '') return 0;

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return 'invalid';
  // A duration we don't have is not a reason to reject; the scanner leaves it
  // null on files it could not measure, and ffmpeg will simply produce nothing.
  if (durationSeconds !== null && seconds >= durationSeconds) return 'invalid';

  return seconds;
}

export interface TranscodeOptions {
  /**
   * Start this many seconds in. Passed as an *input* seek, before `-i`, so
   * ffmpeg jumps to the nearest packet instead of decoding and discarding
   * everything before it — the difference between instant and minutes on a
   * long track.
   */
  offsetSeconds?: number;
  onError?: (err: Error) => void;
}

/** A running transcode, and the handle needed to stop it. */
export interface TranscodeSession {
  stream: NodeJS.ReadableStream;
  /**
   * Kills ffmpeg and releases its concurrency slot. Idempotent, so it is safe
   * to call from both the error path and the response-closed path.
   */
  stop: () => void;
}

/**
 * Transcodes to a lower-bitrate Opus/Ogg stream for the data-saver path.
 * Output length is unknown ahead of time, so callers must not attempt
 * byte-range serving against this stream.
 *
 * Returns `null` when every transcode slot is busy. The caller decides what
 * that means — this module will not quietly serve something other than what
 * was asked for, least of all the full-size original to someone who asked for
 * the small one.
 *
 * The returned `stop` must be called when the response ends. ffmpeg writes to
 * a pipe, so an abandoned transcode does not die on its own: once the consumer
 * goes away the pipe fills, ffmpeg blocks in `write`, and the process sits
 * there holding a decoder open until the server restarts. Skipping a track
 * mid-transcode is the ordinary way to reach that, not an edge case.
 */
export function transcodeToLowQuality(
  filePath: string,
  options: TranscodeOptions = {},
): TranscodeSession | null {
  if (!acquireTranscodeSlot()) return null;

  const { offsetSeconds = 0, onError } = options;

  let stopped = false;

  // SIGKILL rather than SIGTERM: ffmpeg blocked writing to a full pipe is the
  // case this exists to clean up, and it does not reliably act on a catchable
  // signal in that state.
  function kill(): void {
    try {
      command.kill('SIGKILL');
    } catch {
      // Already exited. Nothing to kill, and the slot is released either way.
    }
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    releaseTranscodeSlot();
    kill();
  }

  const command = ffmpeg(filePath)
    .seekInput(offsetSeconds)
    .noVideo()
    .audioCodec('libopus')
    .audioBitrate(LOW_QUALITY_BITRATE)
    .format('ogg')
    // ffmpeg is spawned asynchronously, so a `stop()` that lands before it
    // exists has nothing to signal and the process goes on to spawn anyway —
    // orphaned, unkillable by us, alive for the life of the server. Skipping
    // straight through a few tracks is exactly how a client reaches this, so
    // the kill is re-issued once there is something to kill. Verified against
    // real ffmpeg: without this, an immediate stop leaks the process.
    .on('start', () => {
      if (stopped) kill();
    })
    .on('error', (err: Error) => {
      // A kill we asked for surfaces here as an error too. It isn't one.
      if (stopped) return;
      console.error(`Transcode failed for ${filePath}: ${err.message}`);
      stop();
      onError?.(err);
    })
    .on('end', stop);

  return { stream: command.pipe() as unknown as NodeJS.ReadableStream, stop };
}
