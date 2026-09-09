import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';
import { makeTempDir } from '../testing/harness.js';
import { WAVEFORM_BUCKETS, computePeaks, decodePeaks } from './waveform.js';

const run = promisify(execFile);

/**
 * A full-scale test tone.
 *
 * `volume=8` is not decoration: ffmpeg's `sine` source generates at 1/8 of full
 * scale, so without it every fixture peaks at 0.125 and the amplitude
 * assertions below pass or fail for the wrong reason.
 */
const LOUD_TONE = (seconds: number): string[] => [
  '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
  '-af', 'volume=8',
];

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

describe('waveform', async () => {
  let dir = '';
  let cleanup: () => Promise<void> = async () => {};

  // Peaks come out of a real decode; without ffmpeg there is nothing to read.
  const ffmpegAvailable = await hasFfmpeg();

  before(async () => {
    ({ path: dir, cleanup } = await makeTempDir('waveform'));
  });

  after(async () => {
    await cleanup();
  });

  it('round-trips peaks through the stored encoding', () => {
    const peaks = [0, 1, 127, 254, 255];
    const encoded = Buffer.from(Uint8Array.from(peaks)).toString('base64');
    assert.deepEqual(decodePeaks(encoded), peaks);
  });

  it('returns one byte-ranged peak per bucket', { skip: !ffmpegAvailable }, async () => {
    const path = join(dir, 'tone.flac');
    await run('ffmpeg', LOUD_TONE(4).concat(path));

    const peaks = await computePeaks(path, 4);

    assert.equal(peaks.length, WAVEFORM_BUCKETS);
    assert.ok(
      peaks.every((p) => Number.isInteger(p) && p >= 0 && p <= 255),
      'every peak is a byte',
    );
    // A steady full-scale tone should read loud the whole way through; this is
    // what catches a bucketing bug that leaves most of the array at zero.
    assert.ok(
      peaks.filter((p) => p > 128).length > WAVEFORM_BUCKETS * 0.9,
      `expected a loud, even waveform, got ${peaks.join(',')}`,
    );
  });

  it('tracks amplitude over time', { skip: !ffmpegAvailable }, async () => {
    const path = join(dir, 'fade.flac');
    // Silence, then a tone: the shape has to show up in the right half.
    await run('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1,volume=8',
      path,
    ]);

    const peaks = await computePeaks(path, 4);
    const firstHalf = peaks.slice(0, WAVEFORM_BUCKETS / 2);
    const secondHalf = peaks.slice(WAVEFORM_BUCKETS / 2);
    const loudest = (xs: number[]) => Math.max(...xs);

    assert.ok(loudest(firstHalf) < 20, `silence should read quiet, got ${loudest(firstHalf)}`);
    assert.ok(loudest(secondHalf) > 128, `tone should read loud, got ${loudest(secondHalf)}`);
  });

  it('fills every bucket even when the duration reads long', { skip: !ffmpegAvailable }, async () => {
    const path = join(dir, 'short.flac');
    await run('ffmpeg', LOUD_TONE(2).concat(path));

    // Claim twice the real length: buckets are sized from the stored duration,
    // so the decode ends early and the tail must not be garbage.
    const peaks = await computePeaks(path, 4);
    assert.equal(peaks.length, WAVEFORM_BUCKETS);
    assert.ok(peaks.every((p) => p >= 0 && p <= 255));
  });
});
