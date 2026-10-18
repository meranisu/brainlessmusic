import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import ffmpeg from 'fluent-ffmpeg';
import { exists } from '../utils/fs.js';

export interface EmbeddedPicture {
  data: Uint8Array;
  format: string;
}

/** Longest edge of a generated thumbnail, in pixels. */
const THUMB_WIDTH = 256;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** Artwork ids are `<sha256>.<ext>` only; they become file paths, so a stray `../` must never match. */
const ARTWORK_ID_PATTERN = /^[a-f0-9]{64}\.(jpg|png|webp|gif)$/;

export function isValidArtworkId(id: string): boolean {
  return ARTWORK_ID_PATTERN.test(id);
}

export function mimeTypeForArtwork(id: string): string {
  const ext = id.slice(id.lastIndexOf('.') + 1);
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

/** Stores a picture content-addressed and returns its id; null for image types browsers can't render. */
export async function storeArtwork(root: string, picture: EmbeddedPicture): Promise<string | null> {
  const ext = EXTENSION_BY_MIME[picture.format.toLowerCase()];
  if (!ext) return null;

  const hash = createHash('sha256').update(picture.data).digest('hex');
  const id = `${hash}.${ext}`;
  const finalPath = join(root, id);

  if (await exists(finalPath)) return id;

  await mkdir(root, { recursive: true });
  // Write-then-rename so a concurrent reader never sees a half-written file.
  const tempPath = `${finalPath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, picture.data);
  await rename(tempPath, finalPath);

  return id;
}

export function artworkPathFor(root: string, id: string): string | null {
  if (!isValidArtworkId(id)) return null;
  return join(root, id);
}

/** A downscaled copy made with ffmpeg on first request and cached. Falls back to the full image if ffmpeg fails. */
export async function thumbnailPathFor(root: string, id: string): Promise<string | null> {
  const source = artworkPathFor(root, id);
  if (!source) return null;

  const thumbPath = join(root, `${id}.thumb.jpg`);
  if (await exists(thumbPath)) return thumbPath;
  if (!(await exists(source))) return null;

  const tempPath = `${thumbPath}.${process.pid}.tmp.jpg`;

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(source)
        // `min(w,iw)` avoids upscaling art that is already small; -2 keeps the
        // aspect ratio while staying even-numbered, which JPEG encoding wants.
        .outputOptions(['-vf', `scale='min(${THUMB_WIDTH},iw)':-2`, '-frames:v', '1'])
        .output(tempPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    await rename(tempPath, thumbPath);
    return thumbPath;
  } catch {
    return source;
  }
}

/** Serves a cover. The id is a content hash, so it doubles as the ETag; `?size=thumb` gives ~256px. */
export async function sendCover(
  request: FastifyRequest,
  reply: FastifyReply,
  root: string,
  artworkId: string | undefined,
  size: string | undefined,
): Promise<FastifyReply> {
  if (!artworkId || !isValidArtworkId(artworkId)) {
    return reply.code(404).send({ error: 'No cover art' });
  }

  const wantsThumb = size === 'thumb';
  const etag = `"${artworkId}${wantsThumb ? '-thumb' : ''}"`;

  reply.header('Cache-Control', 'private, max-age=3600');
  reply.header('ETag', etag);

  if (request.headers['if-none-match'] === etag) {
    return reply.code(304).send();
  }

  const path = wantsThumb ? await thumbnailPathFor(root, artworkId) : artworkPathFor(root, artworkId);
  if (!path || !(await exists(path))) {
    return reply.code(404).send({ error: 'No cover art' });
  }

  // Thumbnails are JPEG; the fallback may serve the original, so the type follows the served path.
  reply.header('Content-Type', path.endsWith('.thumb.jpg') ? 'image/jpeg' : mimeTypeForArtwork(artworkId));
  return reply.send(createReadStream(path));
}
