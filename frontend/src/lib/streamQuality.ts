/** The data-saver preference, and what the server actually sent, which differs when it declines a pointless downgrade. */
import { getItem, setItem } from './safeStorage';

const DATA_SAVER_KEY = 'brainlessmusic.dataSaver';

/** Per device, in `localStorage`: the phone on mobile data and the desktop on the LAN share a login. */
export function loadDataSaverPreference(): boolean {
  // Storage can be blocked outright. Defaulting to off keeps playback at full quality, which is the safer thing to guess wrong about.
  return getItem(DATA_SAVER_KEY) === 'true';
}

export function saveDataSaverPreference(enabled: boolean): void {
  setItem(DATA_SAVER_KEY, String(enabled));
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
 * Requests one byte to read `Content-Type` and the total size, which `<audio>` doesn't expose. Cheap: the backend's
 * in-flight map shares the transcode with the element's own fetch.
 */
export async function probeServedStream(
  url: string,
  signal: AbortSignal,
): Promise<ServedStream | null> {
  const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal });
  if (!res.ok) return null;

  const mimeType = (res.headers.get('Content-Type') ?? '').split(';')[0].trim();
  // A 206 gives the total after the slash; a 200 from the browser cache doesn't, and is still a valid answer.
  const fromRange = Number(res.headers.get('Content-Range')?.split('/')[1]);
  const fromLength = Number(res.headers.get('Content-Length'));
  const total = Number.isFinite(fromRange) && fromRange > 0 ? fromRange : fromLength;
  if (!mimeType || !Number.isFinite(total) || total <= 0) return null;

  return { mimeType, bytes: total };
}

/** A readout like `OPUS · 64k`, measured from the bytes on the wire, so it is right for converted copies. */
export function describeServed(served: ServedStream, durationSeconds: number): string {
  const label = FORMAT_LABELS[served.mimeType] ?? served.mimeType.replace(/^audio\//, '').toUpperCase();
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return label;

  const kbps = Math.round((served.bytes * 8) / durationSeconds / 1000);
  return `${label} · ${kbps}k`;
}

/** Network drop or decode failure, from a `MediaError`; the toast text alone can't tell them apart. */
export function describeMediaError(error: MediaError | null | undefined): string | null {
  if (!error) return null;
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'aborted';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'network error';
    case MediaError.MEDIA_ERR_DECODE:
      return 'decode error';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'format not supported';
    default:
      return `error ${error.code}`;
  }
}
