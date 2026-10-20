import ffmpeg from 'fluent-ffmpeg';
import { findUnanalyzedTrackIds, setTrackFeatures, type AudioFeatures } from '../db/audioFeatures.js';
import { findTrackById } from '../db/library.js';
import { ANALYSIS_RATE, HOP, analyzeSamples } from '../utils/audioAnalysis.js';

/** Bump when the measurement changes; every track is then measured again in the background. */
export const FEATURES_VERSION = 1;

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

/** Seconds decoded per track. Enough for tempo; a whole-file decode would cost minutes per album. */
const SLICE_SECONDS = 60;
/** Where the slice starts, as a share of the track, past most intros. */
const SLICE_START = 0.3;

const BATCH_SIZE = 50;
const PROGRESS_EVERY = 500;
const ANALYZE_TIMEOUT_SECONDS = 2 * 60;

const failed = new Set<number>();
let log: Logger | null = null;
let running = false;
let rerun = false;
let current: number | null = null;

/** Decodes a 60 s mono slice at low CPU priority and measures it. */
export function measureFeatures(path: string, durationSeconds: number | null): Promise<AudioFeatures> {
  const start = durationSeconds && durationSeconds > SLICE_SECONDS ? durationSeconds * SLICE_START : 0;
  const maxSamples = SLICE_SECONDS * ANALYSIS_RATE;

  return new Promise((resolve, reject) => {
    const samples = new Float32Array(maxSamples);
    let count = 0;
    // A 16-bit sample can straddle two chunks; hold the odd byte for the next.
    let carry: number | null = null;

    const command = ffmpeg(path, { timeout: ANALYZE_TIMEOUT_SECONDS })
      .renice(10)
      .seekInput(start)
      .duration(SLICE_SECONDS)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(ANALYSIS_RATE)
      .format('s16le')
      .on('error', reject);

    const stream = command.pipe();
    const push = (value: number) => {
      if (count < maxSamples) samples[count++] = value / 32768;
    };

    stream.on('data', (chunk: Buffer) => {
      let offset = 0;
      if (carry !== null && chunk.length > 0) {
        push(Buffer.from([carry, chunk[0]]).readInt16LE(0));
        carry = null;
        offset = 1;
      }
      for (; offset + 1 < chunk.length; offset += 2) push(chunk.readInt16LE(offset));
      carry = offset < chunk.length ? chunk[offset] : null;
    });
    stream.on('end', () => {
      if (count < HOP * 8) reject(new Error('ffmpeg decoded too little audio to analyze'));
      else resolve(analyzeSamples(samples.subarray(0, count), ANALYSIS_RATE));
    });
    stream.on('error', reject);
  });
}

async function analyzePending(): Promise<number> {
  let analyzed = 0;

  for (;;) {
    const ids = findUnanalyzedTrackIds(FEATURES_VERSION, BATCH_SIZE, failed);
    if (ids.length === 0) return analyzed;

    for (const id of ids) {
      const track = findTrackById(id);
      if (!track) continue;
      current = id;
      try {
        setTrackFeatures(id, FEATURES_VERSION, track.file_size, await measureFeatures(track.path, track.duration));
        analyzed += 1;
        if (analyzed % PROGRESS_EVERY === 0) log?.info(`Audio features: analyzed ${analyzed} tracks so far.`);
      } catch (err) {
        // The track still plays and still mixes, on tags and history alone.
        failed.add(id);
        log?.warn(`Audio features: could not analyze track ${id}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        current = null;
      }
    }
  }
}

/** Analyzes every track without current features, one at a time. A call during a pass queues one more pass. */
export function requestFeaturesBackfill(): void {
  if (!log) return;
  if (running) {
    rerun = true;
    return;
  }

  running = true;
  void (async () => {
    try {
      do {
        rerun = false;
        const analyzed = await analyzePending();
        if (analyzed > 0) log?.info(`Audio features: analyzed ${analyzed} track${analyzed === 1 ? '' : 's'}.`);
      } while (rerun);
    } finally {
      running = false;
    }
  })();
}

/** What the background analysis is doing, for the Control Center. */
export function getFeaturesWork(): { running: boolean; currentTrackId: number | null; failed: number } {
  return { running, currentTrackId: current, failed: failed.size };
}

/** Turns the background analysis on. Only the server calls this, so tests and CLI scripts never spawn ffmpeg. */
export function startFeaturesBackfill(logger: Logger): void {
  log = logger;
  requestFeaturesBackfill();
}
