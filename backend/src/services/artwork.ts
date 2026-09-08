import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import ffmpeg from 'fluent-ffmpeg';
import { config } from '../config.js';

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

/**
 * An artwork id is `<sha256>.<ext>` and nothing else. Ids reach this module
 * from the database, but they end up in a filesystem path, so the shape is
 * enforced rather than assumed — a stray `../` must never resolve outside the
 * artwork directory.
 */
const ARTWORK_ID_PATTERN = /^[a-f0-9]{64}\.(jpg|png|webp|gif)$/;

export function isValidArtworkId(id: string): boolean {
  return ARTWORK_ID_PATTERN.test(id);
}

export function mimeTypeForArtwork(id: string): string {
  const ext = id.slice(id.lastIndexOf('.') + 1);
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
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
 * Writes a picture into the artwork cache and returns its id. Content-addressed,
 * so the same cover embedded across an album's tracks is stored once and a
 * re-scan is a no-op rather than a rewrite.
 *
 * Returns null for image types we don't serve, rather than storing something
 * a browser can't render.
 */
export async function storeArtwork(picture: EmbeddedPicture): Promise<string | null> {
  const ext = EXTENSION_BY_MIME[picture.format.toLowerCase()];
  if (!ext) return null;

  const hash = createHash('sha256').update(picture.data).digest('hex');
  const id = `${hash}.${ext}`;
  const finalPath = join(config.artworkPath, id);

  if (await exists(finalPath)) return id;

  await mkdir(config.artworkPath, { recursive: true });
  // Write-then-rename so a concurrent reader never sees a half-written file.
  const tempPath = `${finalPath}.${process.pid}.tmp`;
  await writeFile(tempPath, picture.data);
  await rename(tempPath, finalPath);

  return id;
}

export function artworkPathFor(id: string): string | null {
  if (!isValidArtworkId(id)) return null;
  return join(config.artworkPath, id);
}

/**
 * Path to a downscaled copy, generated on first request and cached beside the
 * original. Done with ffmpeg — already a hard dependency for transcoding — to
 * avoid pulling in an image library for one resize.
 *
 * Falls back to the full-size image if ffmpeg fails, so a thumbnail problem
 * degrades to a bigger download rather than a broken image.
 */
export async function thumbnailPathFor(id: string): Promise<string | null> {
  const source = artworkPathFor(id);
  if (!source) return null;

  const thumbPath = join(config.artworkPath, `${id}.thumb.jpg`);
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

/**
 * Serves a cover for the `/tracks/:id/cover` and `/albums/:id/cover` routes.
 *
 * The artwork id is a content hash, which makes a perfect ETag: if the bytes
 * change the id changes, so a conditional request can be answered with a 304
 * without touching the disk. `?size=thumb` returns a ~256px copy — a track
 * list asking for fifty full-size covers is the difference between a snappy
 * page and megabytes of transfer.
 */
export async function sendCover(
  request: FastifyRequest,
  reply: FastifyReply,
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

  const path = wantsThumb ? await thumbnailPathFor(artworkId) : artworkPathFor(artworkId);
  if (!path || !(await exists(path))) {
    return reply.code(404).send({ error: 'No cover art' });
  }

  // A thumbnail is always re-encoded to JPEG; a full-size image keeps its
  // original type. `thumbnailPathFor` can fall back to the original on an
  // ffmpeg failure, so derive the type from the path actually being served.
  reply.header('Content-Type', path.endsWith('.thumb.jpg') ? 'image/jpeg' : mimeTypeForArtwork(artworkId));
  return reply.send(createReadStream(path));
}
