import { extname } from 'node:path';
import ffmpeg from 'fluent-ffmpeg';

const MIME_TYPES: Record<string, string> = {
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
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

const LOW_QUALITY_BITRATE = '64k';

/**
 * Transcodes the source file to a lower-bitrate Opus/Ogg stream on the fly
 * for the data-saver path. Output length is unknown ahead of time, so callers
 * must not attempt byte-range serving against this stream.
 */
export function transcodeToLowQuality(
  filePath: string,
  onError?: (err: Error) => void,
): NodeJS.ReadableStream {
  const command = ffmpeg(filePath)
    .noVideo()
    .audioCodec('libopus')
    .audioBitrate(LOW_QUALITY_BITRATE)
    .format('ogg')
    .on('error', (err: Error) => {
      console.error(`Transcode failed for ${filePath}: ${err.message}`);
      onError?.(err);
    });

  return command.pipe() as unknown as NodeJS.ReadableStream;
}
