import ffmpeg from 'fluent-ffmpeg';
import { findTrackWaveform, setTrackWaveform } from '../db/waveform.js';
import { findTrackById } from '../db/library.js';

/** Buckets stored per track, more than any scrubber draws: downsampling is free, upsampling means decoding again. */
export const WAVEFORM_BUCKETS = 128;

/**
 * Fixed so buckets derive from the stored duration; 44.1 kHz because resampling lowpasses, and a 5 kHz tone reads
 * 0.9998 at 44.1 kHz but 0.059 at 1 kHz.
 */
const DECODE_RATE = 44100;

/** Refuse to bucket anything implausible; a bad duration shouldn't allocate. */
const MAX_DURATION_SECONDS = 6 * 60 * 60;

/** Peaks in flight by track, so a reload during the first request doesn't decode twice. */
const inFlight = new Map<number, Promise<number[] | null>>();

/** Decodes running at once. Each is a whole-file ffmpeg decode, and any guest can ask, so a loop over ids must queue. */
const MAX_ACTIVE_DECODES = 2;
/** Requests that may wait for a slot. Past this the caller is told the server is busy. */
const MAX_WAITING_DECODES = 16;
/** How long a failed decode is remembered, so asking again doesn't decode the same bad file again. */
const FAILURE_TTL_MS = 10 * 60 * 1000;

/** A decode running longer than this is killed, so a hung file can't hold a decode slot forever. */
const DECODE_TIMEOUT_SECONDS = 5 * 60;
/** Failed entries past their TTL are swept at most this often, so ids never asked for again don't pile up. */
const SWEEP_EVERY_MS = 60 * 1000;
let lastSweep = 0;

let activeDecodes = 0;
const waitingForSlot: Array<() => void> = [];
const failedAt = new Map<number, number>();

/** Drops expired failures. Exported for tests. */
export function pruneFailures(now = Date.now()): void {
  for (const [id, at] of failedAt) {
    if (now - at >= FAILURE_TTL_MS) failedAt.delete(id);
  }
  lastSweep = now;
}

/** Number of remembered failures, for tests. */
export function failureCount(): number {
  return failedAt.size;
}

/** Records a failure, sweeping expired ones now and then. Exported for tests. */
export function rememberFailure(trackId: number, now = Date.now()): void {
  if (now - lastSweep >= SWEEP_EVERY_MS) pruneFailures(now);
  failedAt.set(trackId, now);
}

async function withDecodeSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeDecodes < MAX_ACTIVE_DECODES) {
    activeDecodes += 1;
  } else {
    // A released slot is handed straight to the next waiter, so `activeDecodes` stays put.
    await new Promise<void>((resolve) => waitingForSlot.push(resolve));
  }

  try {
    return await work();
  } finally {
    const next = waitingForSlot.shift();
    if (next) next();
    else activeDecodes -= 1;
  }
}

function encodePeaks(peaks: number[]): string {
  return Buffer.from(Uint8Array.from(peaks)).toString('base64');
}

export function decodePeaks(encoded: string): number[] {
  return Array.from(Buffer.from(encoded, 'base64'));
}

/**
 * Decodes to mono PCM and reduces to `WAVEFORM_BUCKETS` peaks (0-255), sized from the stored duration to keep memory
 * flat. Samples past the last bucket fold into it, so a short duration gives a hot last bar, not a cut waveform.
 */
export function computePeaks(path: string, durationSeconds: number): Promise<number[]> {
  const totalSamples = Math.max(1, Math.floor(durationSeconds * DECODE_RATE));
  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / WAVEFORM_BUCKETS));

  return new Promise((resolve, reject) => {
    const peaks = new Array<number>(WAVEFORM_BUCKETS).fill(0);
    let bucket = 0;
    let sampleInBucket = 0;
    let bucketPeak = 0;
    // A 16-bit sample can straddle two chunks; hold the odd byte for the next.
    let carry: number | null = null;

    const command = ffmpeg(path, { timeout: DECODE_TIMEOUT_SECONDS })
      .noVideo()
      .audioChannels(1)
      .audioFrequency(DECODE_RATE)
      .format('s16le')
      .on('error', reject);

    const stream = command.pipe();

    function pushSample(value: number) {
      const amplitude = Math.abs(value);
      if (amplitude > bucketPeak) bucketPeak = amplitude;

      if (++sampleInBucket >= samplesPerBucket && bucket < WAVEFORM_BUCKETS - 1) {
        // 32768 is the magnitude of a full-scale 16-bit sample.
        peaks[bucket] = Math.min(255, Math.round((bucketPeak / 32768) * 255));
        bucket += 1;
        sampleInBucket = 0;
        bucketPeak = 0;
      }
    }

    stream.on('data', (chunk: Buffer) => {
      let offset = 0;

      if (carry !== null && chunk.length > 0) {
        pushSample(Buffer.from([carry, chunk[0]]).readInt16LE(0));
        carry = null;
        offset = 1;
      }

      for (; offset + 1 < chunk.length; offset += 2) {
        pushSample(chunk.readInt16LE(offset));
      }

      carry = offset < chunk.length ? chunk[offset] : null;
    });

    stream.on('end', () => {
      peaks[bucket] = Math.min(255, Math.round((bucketPeak / 32768) * 255));
      resolve(peaks);
    });

    stream.on('error', reject);
  });
}

/**
 * Peaks from the cache or the file; null when none can be drawn, 'busy' when too many decodes are already queued.
 * A failure is remembered for `FAILURE_TTL_MS`, not stored (usually a moving file).
 */
export async function peaksForTrack(trackId: number): Promise<number[] | null | 'busy'> {
  const cached = findTrackWaveform(trackId);
  if (cached) return decodePeaks(cached);

  const pending = inFlight.get(trackId);
  if (pending) return pending;

  const failed = failedAt.get(trackId);
  if (failed !== undefined) {
    if (Date.now() - failed < FAILURE_TTL_MS) return null;
    failedAt.delete(trackId);
  }

  if (activeDecodes >= MAX_ACTIVE_DECODES && waitingForSlot.length >= MAX_WAITING_DECODES) return 'busy';

  const work = (async () => {
    const track = findTrackById(trackId);
    if (!track) return null;
    const duration = track.duration;
    if (!duration || duration <= 0 || duration > MAX_DURATION_SECONDS) return null;

    try {
      const peaks = await withDecodeSlot(() => computePeaks(track.path, duration));
      setTrackWaveform(trackId, encodePeaks(peaks));
      failedAt.delete(trackId);
      return peaks;
    } catch {
      // Decoding is a nicety. A track that won't analyse still plays, and the
      // client falls back to a placeholder shape.
      rememberFailure(trackId);
      return null;
    }
  })().finally(() => {
    inFlight.delete(trackId);
  });

  inFlight.set(trackId, work);
  return work;
}
