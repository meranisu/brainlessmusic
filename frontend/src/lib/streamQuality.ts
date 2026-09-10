/**
 * The data-saver preference, and a way to find out what the server actually
 * sent back.
 *
 * The two are deliberately separate. Asking for the small copy is not the same
 * as getting one: the backend declines the downgrade when a source is already
 * at or below the target bitrate (a 42 kbps Opus file would only get bigger),
 * so "data saver is on" and "this track is being served small" are different
 * facts. Showing the request as though it were the result would be a readout
 * that lies on exactly the files the rule exists to protect.
 */

const DATA_SAVER_KEY = 'brainlessmusic.dataSaver';

/**
 * A per-device preference, not a per-account one: the phone on mobile data
 * wants it and the desktop on the LAN does not, and they share a login. That
 * makes it `localStorage` rather than anything the server stores.
 */
export function loadDataSaverPreference(): boolean {
  try {
    return localStorage.getItem(DATA_SAVER_KEY) === 'true';
  } catch {
    // Storage can be blocked outright. Defaulting to off keeps playback at
    // full quality, which is the safer thing to guess wrong about.
    return false;
  }
}

export function saveDataSaverPreference(enabled: boolean): void {
  try {
    localStorage.setItem(DATA_SAVER_KEY, String(enabled));
  } catch {
    // The preference still applies for this session; it just won't survive a
    // reload. Not worth interrupting the listener over.
  }
}

export interface ServedStream {
  /** Content-Type as sent, e.g. `audio/opus`. */
  mimeType: string;
  /** Total size of the served representation, from Content-Range. */
  bytes: number;
}

const FORMAT_LABELS: Record<string, string> = {
  'audio/opus': 'OPUS',
  'audio/ogg': 'OPUS',
  'audio/flac': 'FLAC',
  'audio/mpeg': 'MP3',
  'audio/mp4': 'M4A',
  'audio/aac': 'AAC',
  'audio/wav': 'WAV',
};

/**
 * Asks the stream endpoint for a single byte, purely to read the headers.
 *
 * A 206 carries both facts we want — `Content-Type` is the format that came
 * out of the variant decision, and `Content-Range` ends in the total size of
 * that representation. Neither is reachable from an `<audio>` element, which
 * exposes no headers at all, so this is a separate request or nothing.
 *
 * It is cheap even on a cache miss: the audio element is fetching the same
 * variant at the same moment, and the backend's in-flight map collapses the
 * two into one transcode.
 */
export async function probeServedStream(
  url: string,
  signal: AbortSignal,
): Promise<ServedStream | null> {
  const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal });
  if (!res.ok) return null;

  const mimeType = (res.headers.get('Content-Type') ?? '').split(';')[0].trim();
  // A 206 states the total after the slash of "bytes 0-0/3487232". A 200 does
  // not, and a 200 is a real answer here: the response can come from the
  // browser's own cache, which need not honour the range on a repeat request.
  // Reading only Content-Range meant a cache hit looked like a failure.
  const fromRange = Number(res.headers.get('Content-Range')?.split('/')[1]);
  const fromLength = Number(res.headers.get('Content-Length'));
  const total = Number.isFinite(fromRange) && fromRange > 0 ? fromRange : fromLength;
  if (!mimeType || !Number.isFinite(total) || total <= 0) return null;

  return { mimeType, bytes: total };
}

/**
 * A short readout like `OPUS · 64k`. The bitrate is measured from the bytes
 * actually on the wire rather than read off a tag, so it stays honest for the
 * remuxed and re-encoded copies where the source's own numbers no longer apply.
 */
export function describeServed(served: ServedStream, durationSeconds: number): string {
  const label = FORMAT_LABELS[served.mimeType] ?? served.mimeType.replace(/^audio\//, '').toUpperCase();
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return label;

  const kbps = Math.round((served.bytes * 8) / durationSeconds / 1000);
  return `${label} · ${kbps}k`;
}
