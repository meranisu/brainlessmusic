import { constants } from 'node:fs';
import { copyFile, link, mkdir, unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
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

const errorCode = (err: unknown) => (err as NodeJS.ErrnoException).code;

/** Filesystems a hard link can't cross or doesn't exist on; an exclusive copy does the same job there. */
const NO_HARD_LINK = new Set(['EXDEV', 'EPERM', 'ENOTSUP', 'ENOSYS']);

/**
 * Puts [src] at [dest] only if nothing is there yet, then removes [src]. Claiming the name and filling it are one step,
 * so it fails with EEXIST rather than replacing a file (`rename` replaces silently).
 */
async function moveIfFree(src: string, dest: string): Promise<void> {
  try {
    await link(src, dest);
  } catch (err) {
    if (!NO_HARD_LINK.has(errorCode(err) ?? '')) throw err;
    await copyFile(src, dest, constants.COPYFILE_EXCL);
  }
  await unlink(src);
}

/**
 * Moves [src] to `<base><ext>` in [dir], or the first free `<base> (n)<ext>`. Checking for a free name and then
 * moving let two uploads of the same name at once pick the same one, and the second replaced the first (C23).
 */
async function moveToFreeName(src: string, dir: string, baseName: string, ext: string): Promise<string> {
  for (let n = 1; ; n++) {
    const dest = join(dir, n === 1 ? `${baseName}${ext}` : `${baseName} (${n})${ext}`);
    try {
      await moveIfFree(src, dest);
      return dest;
    } catch (err) {
      if (errorCode(err) !== 'EEXIST') throw err;
    }
  }
}

/**
 * Moves an upload into <libraryRoot>/<Artist>/<Album>/<filename>, preferring the client's sanitized filename, else the
 * title. Never overwrites: collisions get " (2)". The root is a parameter so the write target is visible at the call.
 */
export async function fileIntoLibrary(
  libraryRoot: string,
  stagedPath: string,
  originalFileName: string,
  tags: TrackTags,
): Promise<string> {
  const ext = extname(originalFileName).toLowerCase();
  const artistDir = sanitizePathSegment(tags.artistName, 'Unknown Artist');
  const albumDir = sanitizePathSegment(tags.albumTitle ?? '', 'Unknown Album');
  const destDir = join(libraryRoot, artistDir, albumDir);

  const originalBase = sanitizePathSegment(basename(originalFileName, extname(originalFileName)), '');
  const baseName = originalBase || sanitizePathSegment(tags.title, 'Untitled');

  await mkdir(destDir, { recursive: true });
  return moveToFreeName(stagedPath, destDir, baseName, ext);
}
