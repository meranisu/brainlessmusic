import ffmpeg from 'fluent-ffmpeg';
import { findTrackWaveform, setTrackWaveform } from '../db/waveform.js';
import { findTrackById } from '../db/library.js';

/**
 * Buckets stored per track. More than any scrubber draws, on purpose — the
 * client downsamples to whatever width it has, and re-deriving 44 bars from
 * 128 stored ones is free, while going the other way means decoding the file
 * again.
 */
export const WAVEFORM_BUCKETS = 128;

/**
 * Decode rate.
 *
 * Fixed rather than native, so bucket sizes can be derived from the stored
 * duration alone. High rather than cheap, because resampling lowpasses on the
 * way down and the peak of a lowpassed signal is not the peak of the signal:
 * measured here, a full-scale 5 kHz tone reads 0.9998 decoded at 44.1 kHz and
 * 0.059 at 1 kHz. Decoding cheaply would have drawn anything bright — cymbals,
 * strings, most mixes — as near-silent. 44.1 kHz puts the filter above hearing,
 * where it costs the picture nothing.
 */
const DECODE_RATE = 44100;

/** Refuse to bucket anything implausible; a bad duration shouldn't allocate. */
const MAX_DURATION_SECONDS = 6 * 60 * 60;

/**
 * Peaks in flight, keyed by track id.
 *
 * Opening the player fires one request, and a reload fires another before the
 * first has finished. Without this, both would decode the same file and race
 * to write the same row.
 */
const inFlight = new Map<number, Promise<number[] | null>>();

function encodePeaks(peaks: number[]): string {
  return Buffer.from(Uint8Array.from(peaks)).toString('base64');
}

export function decodePeaks(encoded: string): number[] {
  return Array.from(Buffer.from(encoded, 'base64'));
}

/**
 * Decodes `path` to mono 16-bit PCM and reduces it to `WAVEFORM_BUCKETS` peak
 * amplitudes, each 0-255.
 *
 * Buckets are sized from the duration the scanner recorded, so memory stays
 * flat no matter how long the track is — the alternative, buffering the whole
 * decode to count samples first, costs tens of megabytes on a long mix.
 *
 * That does mean trusting a stored duration. Samples arriving past the last
 * bucket are folded into it rather than dropped, so a duration that reads
 * short produces a slightly hot final bar instead of a truncated waveform.
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

/**
 * Peaks for a track, from the cache when they're there and from the file when
 * they aren't. Null means no waveform can be drawn — the track is gone, has no
 * usable duration, or ffmpeg couldn't read it.
 *
 * A failure is never cached. The usual cause is a file that has moved or is
 * still being copied, and both fix themselves.
 */
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
