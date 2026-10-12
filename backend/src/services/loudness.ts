import ffmpeg from 'fluent-ffmpeg';
import { findUnmeasuredTrackIds, setTrackLoudness } from '../db/loudness.js';
import { findTrackById } from '../db/library.js';

export interface LoudnessMeasurement {
  /** Integrated loudness, EBU R128. */
  lufs: number;
  /** True peak in dBTP; null for a silent file (ffmpeg prints `-inf`). */
  peak: number | null;
}

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

/** Tracks fetched per pass; the loop asks again until none are left. */
const BATCH_SIZE = 50;
/** Streamed but not measured, measured before the rest. Bounded, since any guest can stream. */
const MAX_PRIORITY = 100;
/** A progress line every this many, since a first pass over a large library runs for a day or more. */
const PROGRESS_EVERY = 500;

/** Ids that failed to measure, skipped until the server restarts so a broken file isn't decoded every pass. */
const failed = new Set<number>();
const priority = new Set<number>();
/** The track ffmpeg is reading now, for the Control Center. */
let current: number | null = null;
let log: Logger | null = null;
let running = false;
let rerun = false;

/** Reads the integrated loudness and true peak from the `Summary:` block `ebur128` prints when it finishes. */
export function parseEbur128Summary(stderr: string): LoudnessMeasurement | null {
  const at = stderr.lastIndexOf('Summary:');
  if (at < 0) return null;
  const summary = stderr.slice(at);

  const integrated = /I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/.exec(summary);
  if (!integrated) return null;

  const peak = /Peak:\s+(-?\d+(?:\.\d+)?|-inf)\s+dBFS/.exec(summary);
  const peakValue = peak && peak[1] !== '-inf' ? Number(peak[1]) : null;

  return { lufs: Number(integrated[1]), peak: peakValue };
}

/** Decodes the whole file through `ebur128` at low CPU priority. About 1-9 s for a few minutes of Opus. */
export function measureLoudness(path: string): Promise<LoudnessMeasurement> {
  return new Promise((resolve, reject) => {
    ffmpeg(path)
      .renice(10)
      .noVideo()
      .audioFilters('ebur128=peak=true')
      .format('null')
      .output('-')
      .on('error', reject)
      .on('end', (_stdout: string | null, stderr: string | null) => {
        const measurement = parseEbur128Summary(stderr ?? '');
        if (measurement) resolve(measurement);
        else reject(new Error('ffmpeg printed no ebur128 summary'));
      })
      .run();
  });
}

/** The next track to measure: one someone just streamed, else the batch's next. */
function takePriority(): number | undefined {
  const [id] = priority;
  if (id !== undefined) priority.delete(id);
  return id;
}

async function measurePending(): Promise<number> {
  let measured = 0;

  for (;;) {
    const ids = findUnmeasuredTrackIds(BATCH_SIZE, failed);
    if (ids.length === 0 && priority.size === 0) return measured;

    for (let next = takePriority() ?? ids.shift(); next !== undefined; next = takePriority() ?? ids.shift()) {
      const id = next;
      const track = findTrackById(id);
      // A priority id may already be measured by the batch, or have been measured when it was asked for.
      if (!track || track.loudness_lufs !== null || failed.has(id)) continue;
      current = id;
      try {
        const { lufs, peak } = await measureLoudness(track.path);
        setTrackLoudness(id, lufs, peak);
        measured += 1;
        if (measured % PROGRESS_EVERY === 0) log?.info(`Loudness: measured ${measured} tracks so far.`);
      } catch (err) {
        // The track still plays, just unlevelled.
        failed.add(id);
        log?.warn(`Loudness: could not measure track ${id}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        current = null;
      }
    }
  }
}

/** Measures every unmeasured track, one at a time. A call while a pass runs queues one more pass after it. */
export function requestLoudnessBackfill(): void {
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
        const measured = await measurePending();
        if (measured > 0) log?.info(`Loudness: measured ${measured} track${measured === 1 ? '' : 's'}.`);
      } while (rerun);
    } finally {
      running = false;
    }
  })();
}

/** What the background measuring is doing, for the Control Center. */
export function getLoudnessWork(): { running: boolean; currentTrackId: number | null; failedIds: ReadonlySet<number> } {
  return { running, currentTrackId: current, failedIds: failed };
}

/**
 * Moves a streamed track that has no measurement to the front, so a song being listened to is levelled from its next
 * play rather than whenever the pass reaches it. This play stays unlevelled: the client already has its null gain.
 */
export function prioritizeLoudness(trackId: number, measured: boolean): void {
  if (!log || measured || failed.has(trackId)) return;
  if (!priority.has(trackId) && priority.size >= MAX_PRIORITY) return;
  priority.add(trackId);
  requestLoudnessBackfill();
}

/**
 * Turns the background measuring on and starts a pass. Only the server calls this, so tests and CLI scripts never
 * spawn ffmpeg from a scan.
 */
export function startLoudnessBackfill(logger: Logger): void {
  log = logger;
  requestLoudnessBackfill();
}
