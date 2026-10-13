import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { after, before, describe, it } from 'node:test';
import { makeTempDir } from '../testing/harness.js';
import { avatarFile, imageDemuxer, jpegOrientation, saveAvatar } from './avatars.js';

let root = '';
let cleanup: () => Promise<void> = async () => {};

before(async () => {
  ({ path: root, cleanup } = await makeTempDir('avatars-test'));
});
after(() => cleanup());

/** A 40x20 JPEG, red on top and blue underneath, from ffmpeg itself. */
function redOverBlue(): Buffer {
  return execFileSync('ffmpeg', [
    '-v', 'error',
    '-f', 'lavfi', '-i', 'color=red:s=40x10',
    '-f', 'lavfi', '-i', 'color=blue:s=40x10',
    '-filter_complex', 'vstack',
    '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1',
  ]);
}

/** [jpeg] with an EXIF block carrying [orientation], as a phone writes it, right after the start marker. */
function withOrientation(jpeg: Buffer, orientation: number, little = false): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write(little ? 'II' : 'MM', 0, 'latin1');
  const u16 = (value: number, at: number) => (little ? tiff.writeUInt16LE(value, at) : tiff.writeUInt16BE(value, at));
  const u32 = (value: number, at: number) => (little ? tiff.writeUInt32LE(value, at) : tiff.writeUInt32BE(value, at));
  u16(42, 2);
  u32(8, 4);
  u16(1, 8); // one entry
  u16(0x0112, 10); // Orientation
  u16(3, 12); // SHORT
  u32(1, 14);
  u16(orientation, 18);
  u32(0, 22); // no next IFD
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, body, jpeg.subarray(2)]);
}

/**
 * The stored avatar's corners as RGB: [top-left, top-right, bottom-left, bottom-right]. Sampled at 4x4 nearest
 * neighbour; a smooth 2x2 shrink blends the two halves into purple.
 */
function corners(file: string): [number, number, number][] {
  const raw = execFileSync('ffmpeg', [
    '-v', 'error', '-i', file, '-vf', 'scale=4:4:flags=neighbor', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ]);
  return [0, 3, 12, 15].map((i) => [raw[i * 3]!, raw[i * 3 + 1]!, raw[i * 3 + 2]!]);
}

const isRed = ([r, , b]: [number, number, number]) => r > 150 && b < 100;
const isBlue = ([r, , b]: [number, number, number]) => b > 150 && r < 100;

describe('imageDemuxer', () => {
  it('names the format from the first bytes, and refuses anything else', () => {
    assert.equal(imageDemuxer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'png_pipe');
    assert.equal(imageDemuxer(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg_pipe');
    assert.equal(imageDemuxer(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'webp_pipe');
    assert.equal(imageDemuxer(Buffer.from('GIF89a', 'latin1')), 'gif');
    assert.equal(imageDemuxer(Buffer.from('#EXTM3U\n#EXTINF:1,\nhttp://169.254.169.254/\n')), undefined);
    assert.equal(imageDemuxer(Buffer.alloc(0)), undefined);
  });
});

describe('jpegOrientation', () => {
  it('reads the EXIF orientation in either byte order, and is 1 without one', () => {
    const jpeg = redOverBlue();
    assert.equal(jpegOrientation(jpeg), 1);
    assert.equal(jpegOrientation(withOrientation(jpeg, 6)), 6);
    assert.equal(jpegOrientation(withOrientation(jpeg, 8, true)), 8);
  });

  it('is 1 for a cut-off file instead of throwing', () => {
    assert.equal(jpegOrientation(withOrientation(redOverBlue(), 6).subarray(0, 20)), 1);
  });
});

describe('saveAvatar', () => {
  it('turns a phone photo upright before cropping', async () => {
    // Orientation 6: shown turned a quarter clockwise, so red (stored on top) ends up on the right.
    const id = await saveAvatar(root, withOrientation(redOverBlue(), 6));
    const [topLeft, topRight, bottomLeft, bottomRight] = corners(avatarFile(root, id));
    assert.ok(isBlue(topLeft!) && isBlue(bottomLeft!), `left should be blue: ${topLeft} ${bottomLeft}`);
    assert.ok(isRed(topRight!) && isRed(bottomRight!), `right should be red: ${topRight} ${bottomRight}`);
  });

  it('crops a picture with no orientation as it is', async () => {
    // 40x20 cropped to the centre 20x20 is still red over blue.
    const id = await saveAvatar(root, redOverBlue());
    const [topLeft, topRight, bottomLeft, bottomRight] = corners(avatarFile(root, id));
    assert.ok(isRed(topLeft!) && isRed(topRight!), `top should be red: ${topLeft} ${topRight}`);
    assert.ok(isBlue(bottomLeft!) && isBlue(bottomRight!), `bottom should be blue: ${bottomLeft} ${bottomRight}`);
  });

  it('refuses a playlist dressed up as a picture, and leaves nothing behind', async () => {
    const before = await readdir(root);
    await assert.rejects(saveAvatar(root, Buffer.from('#EXTM3U\n#EXTINF:1,\nfile:///etc/passwd\n')));
    assert.deepEqual(await readdir(root), before);
  });

  it('refuses a PNG header that claims to be a picture but is not', async () => {
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('#EXTM3U\n')]);
    await assert.rejects(saveAvatar(root, fake));
  });

  it('refuses a small PNG that declares a huge size, before decoding it', async () => {
    // 20000 x 20000 is 400 million pixels; the file is a few hundred bytes.
    const chunk = (type: string, data: Buffer) => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])));
      return Buffer.concat([length, Buffer.from(type, 'latin1'), data, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(20_000, 0);
    ihdr.writeUInt32BE(20_000, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(Buffer.alloc(1000))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    await assert.rejects(saveAvatar(root, png));
  });

  it('stores the same picture once', async () => {
    const a = await saveAvatar(root, redOverBlue());
    const b = await saveAvatar(root, redOverBlue());
    assert.equal(a, b);
    assert.ok((await readFile(join(root, `${a}.jpg`))).length > 0);
  });
});
