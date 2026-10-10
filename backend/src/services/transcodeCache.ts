import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, stat, unlink, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import type { Stats } from 'node:fs';
import { config } from '../config.js';
import { encodeToFile, getActiveTranscodes, NoTranscodeSlotError, type Variant } from './streaming.js';

/**
 * Converted tracks on disk. A finished file gets ranges, an ETag, 304s and a working scrubber, which a live encode
 * can't. Converting first is viable because a 7:12 FLAC encodes in 4.5 s. Disposable: deleting costs one re-encode each.
 */

/** `opus64c-<32 hex>.ogg`. Only files matching this are ever deleted. */
const ENTRY_PATTERN = /^[a-z0-9]+-[0-9a-f]{32}\.[a-z0-9]+$/;

/** Keyed by source size, mtime and variant, so a replaced source just misses and the stale entry ages out. */
export function cacheEntryName(variant: Variant, source: Pick<Stats, 'size' | 'mtimeMs'>): string {
  const digest = createHash('sha256')
    .update(`${variant.id}:${source.size}:${Math.floor(source.mtimeMs)}`)
    .digest('hex')
    .slice(0, 32);
  return `${variant.id}-${digest}${variant.extension}`;
}

/** Running conversions by entry, so two plays of a cold track share one encode (as in `waveform.ts`). */
const inFlight = new Map<string, Promise<string>>();

export interface CacheResult {
  path: string;
  /** False when the file had to be produced for this request. */
  hit: boolean;
}

/** Path to a converted copy, encoding it if needed. Throws `NoTranscodeSlotError` when slots are full, for a 503. */
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

/**
 * Starts converting a track about to play, without waiting. Never takes the last free slot, so a guess can't cause a
 * 503 for a real play. A cached entry is just touched, keeping it from eviction.
 */
export function warm(
  sourcePath: string,
  sourceStats: Pick<Stats, 'size' | 'mtimeMs'>,
  variant: Variant,
  onError: (err: unknown) => void,
): 'started' | 'busy' {
  const name = cacheEntryName(variant, sourceStats);
  if (!inFlight.has(name) && getActiveTranscodes() >= config.maxConcurrentTranscodes - 1) return 'busy';

  getOrCreate(sourcePath, sourceStats, variant).catch((err: unknown) => {
    // Losing the race for a slot to a real play is the cap doing its job.
    if (!(err instanceof NoTranscodeSlotError)) onError(err);
  });
  return 'started';
}

async function produce(
  sourcePath: string,
  finalPath: string,
  name: string,
  variant: Variant,
): Promise<string> {
  await mkdir(config.transcodePath, { recursive: true });

  // Encode to a temp name, then rename (atomic), so a SIGKILLed encode never leaves a file that looks finished.
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
    // Only this module's files, so a shared TRANSCODE_PATH is safe.
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

/** Evicts least-recently-used entries to the cap. Safe mid-stream: on Linux an open file outlives its name. */
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

/** Test seam: the in-flight map is module state. */
export function resetTranscodeCacheState(): void {
  inFlight.clear();
}
