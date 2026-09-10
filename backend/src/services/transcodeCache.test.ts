import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, beforeEach, describe, it } from 'node:test';
import { config } from '../config.js';
import { makeTempDir } from '../testing/harness.js';
import { LOW_QUALITY_VARIANT, REMUX_M4A_VARIANT } from './streaming.js';
import {
  cacheEntryName,
  cacheSizeBytes,
  evictIfOversized,
  getOrCreate,
  resetTranscodeCacheState,
} from './transcodeCache.js';

const run = promisify(execFile);

/**
 * The converted-copy cache.
 *
 * What is worth testing here is not "does ffmpeg work" but the four things
 * that fail quietly: a key that does not notice the source changed, a partial
 * file left looking complete, two requests racing to write the same path, and
 * eviction deleting something it did not create.
 */

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

let workspace = '';
let cleanup: () => Promise<void> = async () => {};
let source = '';
let originalPath = '';
let originalCap = 0;

describe('the transcode cache', async () => {
  const ffmpegAvailable = await hasFfmpeg();

  before(async () => {
    const dir = await makeTempDir('transcode-cache');
    workspace = dir.path;
    cleanup = dir.cleanup;

    originalPath = config.transcodePath;
    originalCap = config.transcodeCacheMaxMb;
    // Only ever a directory this suite created — see .docs/CLAUDE.md.
    config.transcodePath = join(workspace, 'cache');

    if (!ffmpegAvailable) return;
    source = join(workspace, 'source.flac');
    await run('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-c:a', 'flac', source,
    ]);
  });

  after(async () => {
    config.transcodePath = originalPath;
    config.transcodeCacheMaxMb = originalCap;
    await cleanup();
  });

  beforeEach(() => {
    resetTranscodeCacheState();
    config.transcodeCacheMaxMb = originalCap;
  });

  describe('naming', () => {
    it('gives the same name for the same source and variant', () => {
      const s = { size: 1000, mtimeMs: 1_700_000_000_000 };
      assert.equal(cacheEntryName(LOW_QUALITY_VARIANT, s), cacheEntryName(LOW_QUALITY_VARIANT, s));
    });

    it('changes when the source changes', () => {
      // Size and mtime are the same pair the ETag trusts to mean "different
      // file", so a replaced source misses instead of serving a stale copy.
      const base = { size: 1000, mtimeMs: 1_700_000_000_000 };
      assert.notEqual(
        cacheEntryName(LOW_QUALITY_VARIANT, base),
        cacheEntryName(LOW_QUALITY_VARIANT, { ...base, size: 1001 }),
      );
      assert.notEqual(
        cacheEntryName(LOW_QUALITY_VARIANT, base),
        cacheEntryName(LOW_QUALITY_VARIANT, { ...base, mtimeMs: base.mtimeMs + 1000 }),
      );
    });

    it('changes when the conversion changes', () => {
      const s = { size: 1000, mtimeMs: 1_700_000_000_000 };
      assert.notEqual(cacheEntryName(LOW_QUALITY_VARIANT, s), cacheEntryName(REMUX_M4A_VARIANT, s));
    });
  });

  describe('producing an entry', () => {
    it('converts on a miss and reuses it on a hit', { skip: !ffmpegAvailable }, async () => {
      const stats = await stat(source);

      const first = await getOrCreate(source, stats, LOW_QUALITY_VARIANT);
      assert.equal(first.hit, false, 'a cold request has to produce the file');
      const produced = await stat(first.path);
      assert.ok(produced.size > 0);

      const second = await getOrCreate(source, stats, LOW_QUALITY_VARIANT);
      assert.equal(second.hit, true, 'the second request must not convert again');
      assert.equal(second.path, first.path);
    });

    it('produces a smaller file than the lossless source', { skip: !ffmpegAvailable }, async () => {
      // The entire justification for the feature. If this ever inverts, the
      // data-saver path is costing bytes instead of saving them.
      const stats = await stat(source);
      const { path } = await getOrCreate(source, stats, LOW_QUALITY_VARIANT);
      const converted = await stat(path);
      assert.ok(
        converted.size < stats.size,
        `converted ${converted.size} should be under source ${stats.size}`,
      );
    });

    it('runs one conversion when two requests race', { skip: !ffmpegAvailable }, async () => {
      // Two people pressing play on the same cold track must not both write
      // the same path.
      const stats = await stat(source);
      const [a, b] = await Promise.all([
        getOrCreate(source, stats, LOW_QUALITY_VARIANT),
        getOrCreate(source, stats, LOW_QUALITY_VARIANT),
      ]);

      assert.equal(a.path, b.path);
      const names = await readdir(config.transcodePath);
      assert.equal(names.length, 1, `expected one entry, found ${names.join(', ')}`);
    });

    it('leaves nothing behind when the conversion fails', { skip: !ffmpegAvailable }, async () => {
      // A partial file that looks complete is worse than no file: the next
      // reader cannot tell the difference.
      const broken = join(workspace, 'broken.flac');
      await writeFile(broken, 'definitely not a FLAC');
      const stats = await stat(broken);

      await assert.rejects(() => getOrCreate(broken, stats, LOW_QUALITY_VARIANT));

      const names = await readdir(config.transcodePath).catch(() => []);
      assert.deepEqual(
        names.filter((n) => n.includes('partial')),
        [],
        'the temporary file must be cleaned up',
      );
      assert.equal(
        names.some((n) => n === cacheEntryName(LOW_QUALITY_VARIANT, stats)),
        false,
        'a failed conversion must not be committed under its final name',
      );
    });
  });

  describe('eviction', () => {
    it('does nothing while under the cap', { skip: !ffmpegAvailable }, async () => {
      const stats = await stat(source);
      await getOrCreate(source, stats, LOW_QUALITY_VARIANT);
      assert.equal(await evictIfOversized(), 0);
      assert.equal((await readdir(config.transcodePath)).length, 1);
    });

    it('drops the least recently used entry first', { skip: !ffmpegAvailable }, async () => {
      const stats = await stat(source);
      const keep = await getOrCreate(source, stats, LOW_QUALITY_VARIANT);
      const drop = await getOrCreate(source, { size: 1, mtimeMs: 5 }, LOW_QUALITY_VARIANT);

      // Age the one that should go. Eviction reads mtime, which `getOrCreate`
      // touches on every hit, so it means "last used" rather than "created".
      const old = new Date(Date.now() - 60 * 60 * 1000);
      await utimes(drop.path, old, old);

      config.transcodeCacheMaxMb = 0.0001; // forces all but nothing out
      const removed = await evictIfOversized();

      assert.ok(removed >= 1);
      const left = await readdir(config.transcodePath);
      assert.equal(left.includes(drop.path.split('/').pop()!), false, 'the stale entry should go first');
      void keep;
    });

    it('never deletes a file it did not create', { skip: !ffmpegAvailable }, async () => {
      // Pointing TRANSCODE_PATH at a shared directory must not cost a stranger
      // their files — the rule the backup pruner already follows.
      const stats = await stat(source);
      await getOrCreate(source, stats, LOW_QUALITY_VARIANT);
      const bystander = join(config.transcodePath, 'someone-elses-notes.txt');
      await writeFile(bystander, 'not mine');

      config.transcodeCacheMaxMb = 0.0001;
      await evictIfOversized();

      assert.equal(await readFile(bystander, 'utf8'), 'not mine');
    });

    it('counts only its own files toward the total', { skip: !ffmpegAvailable }, async () => {
      const stats = await stat(source);
      const { path } = await getOrCreate(source, stats, LOW_QUALITY_VARIANT);
      const mine = (await stat(path)).size;
      await writeFile(join(config.transcodePath, 'stranger.bin'), Buffer.alloc(50_000));

      assert.equal(await cacheSizeBytes(), mine);
    });
  });
});
