import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, beforeEach, describe, it } from 'node:test';
import { db } from '../db/connection.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import {
  findUnanalyzedTrackIds,
  getFeatureStats,
  getTrackFeatures,
  setTrackFeatures,
  summarizeFeatures,
} from '../db/audioFeatures.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';
import { ANALYSIS_RATE, analyzeSamples, estimateTempo } from '../utils/audioAnalysis.js';
import { measureFeatures } from './audioFeatures.js';

const run = promisify(execFile);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

function sine(hz: number, seconds: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(seconds * ANALYSIS_RATE);
  for (let i = 0; i < out.length; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / ANALYSIS_RATE);
  return out;
}

/** Short noise bursts on every beat, silence between, the way a drum machine reads to an onset detector. */
function clicks(bpm: number, seconds: number): Float32Array {
  const out = new Float32Array(seconds * ANALYSIS_RATE);
  const period = Math.round((60 / bpm) * ANALYSIS_RATE);
  let seed = 1;
  for (let start = 0; start < out.length; start += period) {
    for (let i = start; i < Math.min(out.length, start + 400); i += 1) {
      seed = (seed * 16807) % 2147483647;
      out[i] = (seed / 2147483647 - 0.5) * 1.6;
    }
  }
  return out;
}

const VERSION = 1;
const FEATURES = { tempo: 120, energy: 0.2, dynamics: 6, brightness: 0.05 };

describe('audio features', async () => {
  const ffmpegAvailable = await hasFfmpeg();
  let rootId = 0;
  const cleanups: Array<() => Promise<void>> = [];

  after(async () => {
    for (const cleanup of cleanups) await cleanup();
  });

  beforeEach(() => {
    resetDatabase();
    rootId = insertLibraryRoot('/feat-root', null).id;
  });

  function addTrack(n: number, fileSize = 1) {
    return upsertTrack({
      path: `/feat-root/${n}.opus`,
      title: `Song ${n}`,
      artistName: null,
      albumTitle: null,
      albumYear: null,
      trackNumber: null,
      duration: 100,
      format: 'OPUS',
      fileSize,
      rootId,
    });
  }

  it('finds the tempo of a click track', () => {
    for (const bpm of [90, 120, 150]) {
      const { tempo } = analyzeSamples(clicks(bpm, 30), ANALYSIS_RATE);
      assert.ok(tempo !== null && Math.abs(tempo - bpm) <= bpm * 0.04, `${bpm} BPM read as ${tempo}`);
    }
  });

  it('gives a steady tone no tempo', () => {
    assert.equal(analyzeSamples(sine(440, 20), ANALYSIS_RATE).tempo, null);
    assert.equal(estimateTempo(new Array(500).fill(0), 0.023), null);
  });

  it('reads a higher tone as brighter, a louder one as more energetic', () => {
    const low = analyzeSamples(sine(200, 10), ANALYSIS_RATE);
    const high = analyzeSamples(sine(2000, 10), ANALYSIS_RATE);
    const quiet = analyzeSamples(sine(200, 10, 0.1), ANALYSIS_RATE);
    assert.ok(high.brightness > low.brightness * 5);
    assert.ok(low.energy > quiet.energy * 3);
    assert.ok(low.dynamics < 1, 'a steady tone has no loudness spread');
  });

  it('reads beats over a quiet bed as dynamic', () => {
    const beats = clicks(120, 20);
    const bed = sine(300, 20, 0.01);
    for (let i = 0; i < beats.length; i += 1) beats[i] += bed[i];
    assert.ok(analyzeSamples(beats, ANALYSIS_RATE).dynamics > 20);
  });

  it('measures a track again when its version or file size changes', () => {
    const a = addTrack(1, 100);
    const b = addTrack(2, 100);
    assert.deepEqual(new Set(findUnanalyzedTrackIds(VERSION, 10, new Set())), new Set([a.id, b.id]));

    setTrackFeatures(a.id, VERSION, 100, FEATURES);
    setTrackFeatures(b.id, VERSION, 100, FEATURES);
    assert.deepEqual(findUnanalyzedTrackIds(VERSION, 10, new Set()), []);
    assert.deepEqual(summarizeFeatures(VERSION), { total: 2, analyzed: 2 });

    addTrack(2, 999);
    assert.deepEqual(findUnanalyzedTrackIds(VERSION, 10, new Set()), [b.id]);
    assert.deepEqual([...getTrackFeatures([a.id, b.id], VERSION).keys()], [a.id]);
    assert.deepEqual(new Set(findUnanalyzedTrackIds(VERSION + 1, 10, new Set())), new Set([a.id, b.id]));
    assert.deepEqual(findUnanalyzedTrackIds(VERSION, 10, new Set([b.id])), []);
  });

  it('drops features with their track', () => {
    const a = addTrack(1);
    setTrackFeatures(a.id, VERSION, 1, FEATURES);
    db.prepare('DELETE FROM tracks WHERE id = ?').run(a.id);
    assert.equal((db.prepare('SELECT COUNT(*) as n FROM track_features').get() as { n: number }).n, 0);
  });

  it('works out library mean and spread', () => {
    setTrackFeatures(addTrack(1).id, VERSION, 1, { ...FEATURES, energy: 0.1 });
    setTrackFeatures(addTrack(2).id, VERSION, 1, { ...FEATURES, energy: 0.3 });
    const stats = getFeatureStats(VERSION);
    assert.ok(stats);
    assert.ok(Math.abs(stats.mean.energy - 0.2) < 1e-9);
    assert.ok(Math.abs(stats.sd.energy - 0.1) < 1e-6);
    assert.equal(stats.sd.tempo, 1, 'no spread falls back to 1, not 0');
  });

  it('measures a real file through ffmpeg', { skip: !ffmpegAvailable && 'ffmpeg not installed' }, async () => {
    const { path: dir, cleanup } = await makeTempDir('features');
    cleanups.push(cleanup);
    const path = join(dir, 'tone.wav');
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=5', path]);
    const features = await measureFeatures(path, 5);
    assert.ok(features.energy > 0.05);
    assert.ok(features.brightness > 0.1, `1 kHz at 11025 Hz crosses zero about 0.18 per sample, got ${features.brightness}`);
  });
});
