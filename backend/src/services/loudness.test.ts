import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getTrackSummaryById } from '../db/browse.js';
import { db } from '../db/connection.js';
import { findTrackById, upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import {
  findUnmeasuredTrackIds,
  listTrackLoudness,
  setTrackLoudness,
  summarizeLoudness,
} from '../db/loudness.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';
import { measureLoudness, parseEbur128Summary } from './loudness.js';

const run = promisify(execFile);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/** The tail of a real `ebur128=peak=true` run, frame lines included, since the parser must skip their `I:` values. */
const SUMMARY = `[Parsed_ebur128_0 @ 0x1] t: 2.9  TARGET:-23 LUFS    M: -21.0 S: -22.0     I: -30.1 LUFS       LRA:   0.0 LU  FTPK: -4.0 dBFS  TPK: -4.0 dBFS
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -22.9 LUFS
    Threshold: -33.4 LUFS

  Loudness range:
    LRA:         9.1 LU
    Threshold: -43.2 LUFS
    LRA low:   -28.6 LUFS
    LRA high:  -19.5 LUFS

  True peak:
    Peak:       -6.4 dBFS
`;

describe('loudness', async () => {
  const ffmpegAvailable = await hasFfmpeg();
  let rootId = 0;

  beforeEach(() => {
    resetDatabase();
    rootId = insertLibraryRoot('/loud-root', null).id;
  });

  function addTrack(n: number, fileSize = 1) {
    return upsertTrack({
      path: `/loud-root/${n}.opus`,
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

  it('reads integrated loudness and true peak from the summary, not the frame lines', () => {
    assert.deepEqual(parseEbur128Summary(SUMMARY), { lufs: -22.9, peak: -6.4 });
  });

  it('reads a silent file as having no peak', () => {
    const silent = SUMMARY.replace('-22.9 LUFS', '-70.0 LUFS').replace('-6.4 dBFS', '-inf dBFS');
    assert.deepEqual(parseEbur128Summary(silent), { lufs: -70, peak: null });
  });

  it('returns null when ffmpeg printed no summary', () => {
    assert.equal(parseEbur128Summary('Invalid data found when processing input'), null);
  });

  it('ships no gain until a track is measured', () => {
    const track = addTrack(1);
    assert.equal(getTrackSummaryById(track.id)?.gainDb, null);
  });

  it('aims at -18 LUFS, but never raises a peak past -1 dBTP or by more than 12 dB', () => {
    const loud = addTrack(1);
    const quiet = addTrack(2);
    const peaky = addTrack(3);
    const nearSilent = addTrack(4);
    const silent = addTrack(5);
    setTrackLoudness(loud.id, -9, -0.2);
    setTrackLoudness(quiet.id, -22.9, -6.4);
    setTrackLoudness(peaky.id, -23.7, -4.2);
    setTrackLoudness(nearSilent.id, -50, -30);
    setTrackLoudness(silent.id, -70, null);

    assert.equal(getTrackSummaryById(loud.id)?.gainDb, -9);
    assert.equal(getTrackSummaryById(quiet.id)?.gainDb, 4.9);
    assert.equal(getTrackSummaryById(peaky.id)?.gainDb, 3.2);
    assert.equal(getTrackSummaryById(nearSilent.id)?.gainDb, 12);
    assert.equal(getTrackSummaryById(silent.id)?.gainDb, null);
  });

  it('keeps a measurement across a rescan of the same file, and drops it when the file changes', () => {
    const track = addTrack(1, 1000);
    setTrackLoudness(track.id, -20, -3);

    addTrack(1, 1000);
    assert.equal(findTrackById(track.id)?.loudness_lufs, -20);

    addTrack(1, 2000);
    assert.equal(findTrackById(track.id)?.loudness_lufs, null);
    assert.equal(findTrackById(track.id)?.loudness_peak, null);
  });

  it('lists unmeasured tracks, skipping ones that failed', () => {
    const first = addTrack(1);
    const second = addTrack(2);
    const third = addTrack(3);
    setTrackLoudness(second.id, -20, -3);

    assert.deepEqual(findUnmeasuredTrackIds(10, new Set()), [first.id, third.id]);
    assert.deepEqual(findUnmeasuredTrackIds(10, new Set([first.id])), [third.id]);
    assert.deepEqual(findUnmeasuredTrackIds(1, new Set([first.id])), [third.id]);
  });

  it('lists recently played tracks first, then never-played ones by id', () => {
    const first = addTrack(1);
    const second = addTrack(2);
    const third = addTrack(3);
    db.prepare("UPDATE tracks SET last_played_at = '2026-10-01 10:00:00' WHERE id = ?").run(third.id);
    db.prepare("UPDATE tracks SET last_played_at = '2026-10-12 10:00:00' WHERE id = ?").run(second.id);

    assert.deepEqual(findUnmeasuredTrackIds(10, new Set()), [second.id, third.id, first.id]);
  });

  it('counts levelled, waiting and failed tracks, leaving out missing files', () => {
    const levelled = addTrack(1);
    const failedTrack = addTrack(2);
    addTrack(3);
    const gone = addTrack(4);
    setTrackLoudness(levelled.id, -20, -3);
    db.prepare("UPDATE tracks SET missing_since = '2026-10-12' WHERE id = ?").run(gone.id);

    assert.deepEqual(summarizeLoudness(new Set([failedTrack.id, gone.id])), {
      total: 3,
      levelled: 1,
      waiting: 1,
      failed: 1,
    });
  });

  it('lists a page of tracks by state, with gain for the levelled ones', () => {
    const levelled = addTrack(1);
    const failedTrack = addTrack(2);
    const waiting = addTrack(3);
    setTrackLoudness(levelled.id, -22.9, -6.4);
    const failedIds = new Set([failedTrack.id]);
    const page = (status?: 'levelled' | 'waiting' | 'failed') =>
      listTrackLoudness({ status, limit: 10, offset: 0, failedIds });

    const all = page();
    assert.equal(all.total, 3);
    assert.deepEqual(
      all.tracks.map((t) => [t.id, t.status, t.gainDb]),
      [
        [levelled.id, 'levelled', 4.9],
        [failedTrack.id, 'failed', null],
        [waiting.id, 'waiting', null],
      ],
    );
    assert.deepEqual(page('levelled').tracks.map((t) => t.id), [levelled.id]);
    assert.deepEqual(page('failed').tracks.map((t) => t.id), [failedTrack.id]);
    assert.deepEqual(page('waiting').tracks.map((t) => t.id), [waiting.id]);
    assert.equal(listTrackLoudness({ limit: 1, offset: 2, failedIds }).tracks[0]?.id, waiting.id);
  });

  it('searches by title, short queries included', () => {
    addTrack(1);
    const wanted = upsertTrack({
      path: '/loud-root/x.opus',
      title: 'Winter fireworks',
      artistName: null,
      albumTitle: null,
      albumYear: null,
      trackNumber: null,
      duration: 100,
      format: 'OPUS',
      fileSize: 1,
      rootId,
    });

    for (const search of ['fireworks', 'Wi']) {
      const result = listTrackLoudness({ search, limit: 10, offset: 0, failedIds: new Set() });
      assert.deepEqual(result.tracks.map((t) => t.id), [wanted.id], search);
    }
  });

  describe('measuring a real file', { skip: !ffmpegAvailable && 'ffmpeg not installed' }, () => {
    let dir = '';
    let cleanup: () => Promise<void> = async () => {};

    before(async () => {
      ({ path: dir, cleanup } = await makeTempDir('loudness'));
    });

    after(async () => {
      await cleanup();
    });

    it('measures a quieter tone as quieter', async () => {
      const louder = join(dir, 'louder.wav');
      const quieter = join(dir, 'quieter.wav');
      const tone = 'sine=frequency=1000:duration=3';
      await run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', tone, '-af', 'volume=4', louder]);
      await run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', tone, louder.replace('louder', 'quieter')]);

      const a = await measureLoudness(louder);
      const b = await measureLoudness(quieter);
      // volume=4 is +12 dB.
      assert.ok(Math.abs(a.lufs - b.lufs - 12) < 0.5, `expected ~12 dB apart, got ${a.lufs} and ${b.lufs}`);
      assert.ok(a.peak !== null && a.peak < 0);
    });

    it('rejects a file that is not audio', async () => {
      const bogus = join(dir, 'bogus.opus');
      await run('sh', ['-c', `printf 'not audio' > "${bogus}"`]);
      await assert.rejects(measureLoudness(bogus));
    });
  });
});
