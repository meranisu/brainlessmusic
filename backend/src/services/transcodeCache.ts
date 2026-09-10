import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, stat, unlink, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import type { Stats } from 'node:fs';
import { config } from '../config.js';
import { encodeToFile, type Variant } from './streaming.js';

/**
 * Converted copies of tracks, kept on disk.
 *
 * The whole point is that a converted track becomes **an ordinary file**. Once
 * it exists, the stream route serves it exactly as it serves an original —
 * `Content-Length`, `Accept-Ranges: bytes`, an `ETag`, a `304` on revalidation,
 * and a scrubber that works. The live-transcode path cannot offer any of that,
 * because a stream being encoded has no length until it ends.
 *
 * Measured on this hardware 2026-09-10: a 7:12 FLAC converts to 64k Opus in
 * 4.52 s, about 96x faster than playing it. That is what makes the simple
 * design viable — convert first, then serve the finished file, rather than
 * trying to serve and convert at once. One ffmpeg run, and no way to leave a
 * partial file looking complete.
 *
 * Everything here is disposable. Deleting the directory costs one re-encode
 * per track, the same bargain as the artwork cache.
 */

/** `opus64-<32 hex>.ogg`. Only files matching this are ever deleted. */
const ENTRY_PATTERN = /^[a-z0-9]+-[0-9a-f]{32}\.[a-z0-9]+$/;

/**
 * Names an entry from what would change its contents: the source bytes and the
 * conversion applied to them.
 *
 * Size plus mtime is the same pair the stream route's `ETag` already trusts to
 * mean "this file changed", so a replaced source invalidates its entries for
 * free — the new key simply misses, and the stale entry ages out through
 * eviction. There is no invalidation step to forget to call.
 */
export function cacheEntryName(variant: Variant, source: Pick<Stats, 'size' | 'mtimeMs'>): string {
  const digest = createHash('sha256')
    .update(`${variant.id}:${source.size}:${Math.floor(source.mtimeMs)}`)
    .digest('hex')
    .slice(0, 32);
  return `${variant.id}-${digest}${variant.extension}`;
}

/**
 * Conversions currently running, keyed by entry name.
 *
 * Two people pressing play on the same cold track must produce one encode, not
 * two racing to write the same path. `waveform.ts` solves the identical problem
 * the identical way.
 */
const inFlight = new Map<string, Promise<string>>();

export interface CacheResult {
  path: string;
  /** False when the file had to be produced for this request. */
  hit: boolean;
}

/**
 * Returns the path to a converted copy, producing it if it does not exist yet.
 *
 * Throws `NoTranscodeSlotError` when every slot is busy, so the caller can say
 * 503 rather than fail obscurely.
 */
export async function getOrCreate(
  sourcePath: string,
  sourceStats: Pick<Stats, 'size' | 'mtimeMs'>,
  variant: Variant,
): Promise<CacheResult> {
  const name = cacheEntryName(variant, sourceStats);
  const path = join(config.transcodePath, name);

  try {
    await stat(path);
    // Touch on read: eviction is least-recently-*used*, and relatime means the
    // filesystem's own atime cannot be relied on to say when that was.
    const now = new Date();
    await utimes(path, now, now).catch(() => {});
    return { path, hit: true };
  } catch {
    // Not cached. Fall through and make it.
  }

  const existing = inFlight.get(name);
  if (existing) return { path: await existing, hit: false };

  const work = produce(sourcePath, path, name, variant).finally(() => inFlight.delete(name));
  inFlight.set(name, work);
  return { path: await work, hit: false };
}

async function produce(
  sourcePath: string,
  finalPath: string,
  name: string,
  variant: Variant,
): Promise<string> {
  await mkdir(config.transcodePath, { recursive: true });

  // Encode to a temporary name and rename only on success. A rename within a
  // directory is atomic, so a reader either finds a complete file or no file —
  // never a truncated one that looks finished. This matters more here than
  // usual: transcodes are SIGKILLed when a client disconnects, by design.
  const tempPath = `${finalPath}.${process.pid}.partial`;

  try {
    await encodeToFile(sourcePath, tempPath, variant);
    await rename(tempPath, finalPath);
  } catch (err) {
    await unlink(tempPath).catch(() => {});
    throw err;
  }

  // After the write, not on a timer: the cache only grows here, so this is the
  // only moment it can exceed its cap.
  await evictIfOversized().catch(() => {});
  return finalPath;
}

interface Entry {
  name: string;
  size: number;
  usedAt: number;
}

async function listEntries(): Promise<Entry[]> {
  let names: string[];
  try {
    names = await readdir(config.transcodePath);
  } catch {
    return [];
  }

  const entries: Entry[] = [];
  for (const name of names) {
    // Anything this module did not create is left alone, so pointing
    // TRANSCODE_PATH somewhere shared cannot delete a stranger's files — the
    // same rule the backup pruner follows.
    if (!ENTRY_PATTERN.test(name)) continue;
    try {
      const s = await stat(join(config.transcodePath, name));
      entries.push({ name, size: s.size, usedAt: s.mtimeMs });
    } catch {
      // Vanished under us; nothing to account for.
    }
  }
  return entries;
}

/** Total bytes currently held, counting only this module's own files. */
export async function cacheSizeBytes(): Promise<number> {
  return (await listEntries()).reduce((total, e) => total + e.size, 0);
}

/**
 * Deletes least-recently-used entries until the cache is back under its cap.
 *
 * Deleting a file another request is currently streaming is safe: the reader
 * already holds it open, and on Linux the data survives until that handle
 * closes. The name disappears; the bytes in flight do not.
 */
export async function evictIfOversized(): Promise<number> {
  const capBytes = config.transcodeCacheMaxMb * 1024 * 1024;
  if (capBytes <= 0) return 0;

  const entries = await listEntries();
  let total = entries.reduce((sum, e) => sum + e.size, 0);
  if (total <= capBytes) return 0;

  entries.sort((a, b) => a.usedAt - b.usedAt); // oldest use first

  let removed = 0;
  for (const entry of entries) {
    if (total <= capBytes) break;
    try {
      await unlink(join(config.transcodePath, entry.name));
      total -= entry.size;
      removed++;
    } catch {
      // Already gone, or not ours to remove.
    }
  }
  return removed;
}

/** Test seam — the in-flight map is module state. */
export function resetTranscodeCacheState(): void {
  inFlight.clear();
}
