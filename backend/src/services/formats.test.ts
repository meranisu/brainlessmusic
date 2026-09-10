import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';
import { makeTempDir } from '../testing/harness.js';
import { mimeTypeFor } from './streaming.js';
import { AUDIO_EXTENSIONS, extractTrackTags } from './trackTags.js';
import { computePeaks } from './waveform.js';

const run = promisify(execFile);

/**
 * Every format the library accepts, read with the real decoders rather than
 * asserted against a list.
 *
 * The point is the two things that silently differ per format and that nothing
 * else would catch: whether `music-metadata` can find a **duration** — the
 * waveform buckets are sized from it, so a null there draws nothing — and
 * whether the tag fallbacks hold for containers that carry no tags at all.
 */

interface Fixture {
  ext: string;
  /** ffmpeg args after the input, to produce this container/codec. */
  args: string[];
  /** Raw ADTS and Opus-in-Ogg here carry no tag block ffmpeg will write. */
  tagged: boolean;
}

const FIXTURES: Fixture[] = [
  { ext: '.flac', args: ['-c:a', 'flac'], tagged: true },
  { ext: '.mp3', args: ['-c:a', 'libmp3lame'], tagged: true },
  { ext: '.m4a', args: ['-c:a', 'aac'], tagged: true },
  { ext: '.ogg', args: ['-c:a', 'libvorbis'], tagged: true },
  { ext: '.wav', args: ['-c:a', 'pcm_s16le'], tagged: true },
  { ext: '.opus', args: ['-c:a', 'libopus'], tagged: true },
  // Raw ADTS: no container, so no tags and no cover — it leans entirely on the
  // filename fallback, which is exactly what makes it worth a test.
  { ext: '.aac', args: ['-c:a', 'aac', '-f', 'adts'], tagged: false },
];

const DURATION_SECONDS = 3;

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

let library = '';
let cleanup: () => Promise<void> = async () => {};

describe('every accepted format', async () => {
  const ffmpegAvailable = await hasFfmpeg();

  before(async () => {
    const dir = await makeTempDir('formats');
    library = dir.path;
    cleanup = dir.cleanup;
    if (!ffmpegAvailable) return;

    for (const { ext, args, tagged } of FIXTURES) {
      const meta = tagged
        ? ['-metadata', 'title=Real Title', '-metadata', 'artist=Real Artist', '-metadata', 'album=Real Album']
        : [];
      await run('ffmpeg', [
        '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `sine=frequency=440:duration=${DURATION_SECONDS}`,
        ...meta, ...args,
        join(library, `fixture${ext}`),
      ]);
    }
  });

  after(async () => {
    await cleanup();
  });

  it('accepts each one by extension', () => {
    for (const { ext } of FIXTURES) {
      assert.ok(AUDIO_EXTENSIONS.has(ext), `${ext} should be an accepted extension`);
    }
  });

  it('has a real MIME type for each, never the download fallback', () => {
    for (const { ext } of FIXTURES) {
      assert.notEqual(mimeTypeFor(`/music/x${ext}`), 'application/octet-stream', ext);
    }
  });

  for (const { ext, tagged } of FIXTURES) {
    it(`reads a usable duration from ${ext}`, { skip: !ffmpegAvailable }, async () => {
      // Not cosmetic: waveform buckets are sized from this number, so a format
      // that parses but reports null duration draws an empty scrubber.
      const tags = await extractTrackTags(join(library, `fixture${ext}`));
      assert.notEqual(tags.duration, null, `${ext} must report a duration`);
      assert.ok(
        Math.abs(tags.duration! - DURATION_SECONDS) < 0.5,
        `${ext} duration ${tags.duration} should be about ${DURATION_SECONDS}s`,
      );
    });

    it(`tags ${ext} ${tagged ? 'from the file' : 'by falling back to the filename'}`, {
      skip: !ffmpegAvailable,
    }, async () => {
      const tags = await extractTrackTags(join(library, `fixture${ext}`));
      if (tagged) {
        assert.equal(tags.title, 'Real Title', ext);
        assert.equal(tags.artistName, 'Real Artist', ext);
      } else {
        assert.equal(tags.title, 'fixture', `${ext} has no tag block, so the filename is the title`);
        assert.equal(tags.artistName, 'Unknown Artist', ext);
      }
      assert.ok(tags.format, `${ext} should report a codec or container name`);
    });

    it(`decodes ${ext} to waveform peaks`, { skip: !ffmpegAvailable }, async () => {
      // ffmpeg, not music-metadata — a separate decoder that can fail
      // independently for a container the tag reader handled fine.
      const peaks = await computePeaks(join(library, `fixture${ext}`), DURATION_SECONDS);
      assert.ok(peaks.length > 0, `${ext} should produce peaks`);
      assert.ok(
        peaks.some((p) => p > 0),
        `${ext} decoded to silence — the decode produced no signal`,
      );
    });
  }
});
