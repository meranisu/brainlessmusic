import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import ffmpeg from 'fluent-ffmpeg';

/**
 * Profile pictures (profile page plan). An upload is cropped to a centred square and scaled to [AVATAR_SIZE] px JPEG
 * with ffmpeg, as cover thumbnails are, then stored under the root by the hash of the result. Every function takes the
 * root as a parameter (hard rule): callers pass `config.avatarPath`, tests a temp directory.
 */

export const AVATAR_SIZE = 512;
/** Largest upload accepted, before cropping. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
/** Largest picture decoded, in pixels (about 200 MB as RGBA). A small PNG can declare a huge size. */
const MAX_AVATAR_PIXELS = 50_000_000;
/** An upload that takes longer than this is killed rather than left holding the request. */
const CROP_TIMEOUT_SECONDS = 20;
/** Pictures cropped at once (S7). Each can hold a 50 MP frame, about 200 MB, so ten at once could take 2 GB. */
export const MAX_CONCURRENT_AVATAR_CROPS = 2;
let activeCrops = 0;

/** Claims a crop slot; false when all are taken, for a 503. Pair every true with [releaseAvatarSlot]. */
export function takeAvatarSlot(): boolean {
  if (activeCrops >= MAX_CONCURRENT_AVATAR_CROPS) return false;
  activeCrops += 1;
  return true;
}

export function releaseAvatarSlot(): void {
  activeCrops = Math.max(0, activeCrops - 1);
}

/**
 * The ffmpeg demuxer for [image], from its first bytes; undefined for anything else. Pinning it stops ffmpeg probing
 * the upload as whatever it claims to be, such as a playlist that makes it fetch URLs.
 */
export function imageDemuxer(image: Buffer): 'png_pipe' | 'jpeg_pipe' | 'webp_pipe' | 'gif' | undefined {
  if (image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png_pipe';
  if (image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return 'jpeg_pipe';
  if (image.toString('latin1', 0, 4) === 'RIFF' && image.toString('latin1', 8, 12) === 'WEBP') return 'webp_pipe';
  if (/^GIF8[79]a$/.test(image.toString('latin1', 0, 6))) return 'gif';
  return undefined;
}

/**
 * A JPEG's EXIF orientation (1 to 8), or 1 when it has none. Phones store photos as the sensor saw them and set this
 * instead of turning the pixels; ffmpeg 5 (the server's) ignores it, so the crop applies it itself.
 */
export function jpegOrientation(image: Buffer): number {
  let at = 2;
  while (at + 4 <= image.length && image[at] === 0xff) {
    const marker = image[at + 1]!;
    const length = image.readUInt16BE(at + 2);
    // Start of scan: the headers are over.
    if (marker === 0xda) break;
    if (marker === 0xe1 && image.toString('latin1', at + 4, at + 10) === 'Exif\0\0') {
      const tiff = at + 10;
      if (tiff + 8 > image.length) return 1;
      const little = image.toString('latin1', tiff, tiff + 2) === 'II';
      const u16 = (offset: number) => (little ? image.readUInt16LE(offset) : image.readUInt16BE(offset));
      const u32 = (offset: number) => (little ? image.readUInt32LE(offset) : image.readUInt32BE(offset));
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > image.length) return 1;
      const entries = u16(ifd);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > image.length) return 1;
        if (u16(entry) === 0x0112) {
          const value = u16(entry + 8);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    at += 2 + length;
  }
  return 1;
}

/** The filter that turns a picture with EXIF [orientation] upright, before the crop. */
const UPRIGHT: Record<number, string | undefined> = {
  2: 'hflip',
  3: 'hflip,vflip',
  4: 'vflip',
  5: 'transpose=0',
  6: 'transpose=1',
  7: 'transpose=3',
  8: 'transpose=2',
};

const AVATAR_ID_PATTERN = /^[a-f0-9]{64}$/;

export function isValidAvatarId(id: string): boolean {
  return AVATAR_ID_PATTERN.test(id);
}

export function avatarFile(root: string, id: string): string {
  if (!isValidAvatarId(id)) throw new Error('Not an avatar id');
  return join(root, `${id}.jpg`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Crops and stores [image]; returns its id. Throws for anything but a PNG, JPEG, WebP or GIF, and when ffmpeg can't read it,
 * which is also how a file that only claims to be one is refused.
 */
export async function saveAvatar(root: string, image: Buffer): Promise<string> {
  const demuxer = imageDemuxer(image);
  if (!demuxer) throw new Error('Not a PNG, JPEG, WebP or GIF picture');
  const upright = demuxer === 'jpeg_pipe' ? UPRIGHT[jpegOrientation(image)] : undefined;
  const crop = `crop='min(iw,ih)':'min(iw,ih)',scale=${AVATAR_SIZE}:${AVATAR_SIZE}`;
  await mkdir(root, { recursive: true });
  const tag = randomUUID();
  const input = join(root, `.upload-${tag}`);
  const output = join(root, `.crop-${tag}.jpg`);
  await writeFile(input, image);
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(input, { timeout: CROP_TIMEOUT_SECONDS })
        // Only the file itself, read as the format its bytes say, at a size that fits in memory. `-noautorotate`
        // keeps a newer ffmpeg from turning it a second time.
        .inputOptions([
          '-f',
          demuxer,
          '-protocol_whitelist',
          'file',
          '-max_pixels',
          String(MAX_AVATAR_PIXELS),
          '-noautorotate',
        ])
        .outputOptions([
          '-vf',
          upright ? `${upright},${crop}` : crop,
          '-frames:v',
          '1',
          '-q:v',
          '3',
        ])
        .output(output)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
    const id = createHash('sha256').update(await readFile(output)).digest('hex');
    const target = avatarFile(root, id);
    if (await exists(target)) await rm(output, { force: true });
    else await rename(output, target);
    return id;
  } finally {
    await rm(input, { force: true });
    await rm(output, { force: true });
  }
}

/** Deletes a picture nobody uses any more. A missing file is fine. */
export async function removeAvatar(root: string, id: string): Promise<void> {
  if (!isValidAvatarId(id)) return;
  await rm(avatarFile(root, id), { force: true });
}

/** Serves a picture. The id is a content hash, so it doubles as the ETag. */
export async function sendAvatar(
  request: FastifyRequest,
  reply: FastifyReply,
  root: string,
  id: string | null,
): Promise<FastifyReply> {
  if (!id || !isValidAvatarId(id)) return reply.code(404).send({ error: 'No profile picture' });
  const etag = `"${id}"`;
  reply.header('Cache-Control', 'private, max-age=86400');
  reply.header('ETag', etag);
  if (request.headers['if-none-match'] === etag) return reply.code(304).send();
  const path = avatarFile(root, id);
  if (!(await exists(path))) return reply.code(404).send({ error: 'No profile picture' });
  reply.header('Content-Type', 'image/jpeg');
  return reply.send(createReadStream(path));
}
