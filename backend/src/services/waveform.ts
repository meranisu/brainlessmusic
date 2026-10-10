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

    const command = ffmpeg(path)
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

/** Peaks from the cache or the file; null when none can be drawn. Failures aren't cached (usually a moving file). */
export async function peaksForTrack(trackId: number): Promise<number[] | null> {
  const cached = findTrackWaveform(trackId);
  if (cached) return decodePeaks(cached);

  const pending = inFlight.get(trackId);
  if (pending) return pending;

  const work = (async () => {
    const track = findTrackById(trackId);
    if (!track) return null;
    if (!track.duration || track.duration <= 0 || track.duration > MAX_DURATION_SECONDS) return null;

    try {
      const peaks = await computePeaks(track.path, track.duration);
      setTrackWaveform(trackId, encodePeaks(peaks));
      return peaks;
    } catch {
      // Decoding is a nicety. A track that won't analyse still plays, and the
      // client falls back to a placeholder shape.
      return null;
    }
  })().finally(() => {
    inFlight.delete(trackId);
  });

  inFlight.set(trackId, work);
  return work;
}
