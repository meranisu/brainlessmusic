import { access, copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { config } from '../config.js';
import type { TrackTags } from './trackTags.js';

// Characters invalid in filenames on Linux and/or Windows, plus control chars.
const INVALID_PATH_CHARS = /[/\\:*?"<>|\x00-\x1f]/g;

export function sanitizePathSegment(name: string, fallback: string): string {
  const cleaned = name
    .replace(INVALID_PATH_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, ''); // trailing dots are dropped/rejected on Windows

  return cleaned.length > 0 ? cleaned : fallback;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function uniqueDestination(dir: string, baseName: string, ext: string): Promise<string> {
  let candidate = join(dir, `${baseName}${ext}`);
  for (let n = 2; await pathExists(candidate); n++) {
    candidate = join(dir, `${baseName} (${n})${ext}`);
  }
  return candidate;
}

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err) {
    // Staging and library dirs may live on different filesystems/mounts.
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyFile(src, dest);
      await unlink(src);
    } else {
      throw err;
    }
  }
}

/**
 * Moves a staged upload into LIBRARY_PATH/<Artist>/<Album>/<filename>,
 * sanitizing the artist/album folder names. Prefers the client's original
 * filename (sanitized) so the library tree reads naturally; falls back to
 * the tagged title when that name is empty/unusable. Never overwrites an
 * existing file — collisions get a " (2)", " (3)", ... suffix.
 */
export async function fileIntoLibrary(
  stagedPath: string,
  originalFileName: string,
  tags: TrackTags,
): Promise<string> {
  const ext = extname(originalFileName).toLowerCase();
  const artistDir = sanitizePathSegment(tags.artistName, 'Unknown Artist');
  const albumDir = sanitizePathSegment(tags.albumTitle ?? '', 'Unknown Album');
  const destDir = join(config.libraryPath, artistDir, albumDir);

  const originalBase = sanitizePathSegment(basename(originalFileName, extname(originalFileName)), '');
  const baseName = originalBase || sanitizePathSegment(tags.title, 'Untitled');

  await mkdir(destDir, { recursive: true });
  const destPath = await uniqueDestination(destDir, baseName, ext);
  await moveFile(stagedPath, destPath);
  return destPath;
}
