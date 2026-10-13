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
 * Crops and stores [image]; returns its id. Throws when ffmpeg can't read it as an image, which is also how a file that
 * only claims to be one is refused.
 */
export async function saveAvatar(root: string, image: Buffer): Promise<string> {
  await mkdir(root, { recursive: true });
  const tag = randomUUID();
  const input = join(root, `.upload-${tag}`);
  const output = join(root, `.crop-${tag}.jpg`);
  await writeFile(input, image);
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(input)
        .outputOptions([
          '-vf',
          `crop='min(iw,ih)':'min(iw,ih)',scale=${AVATAR_SIZE}:${AVATAR_SIZE}`,
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
