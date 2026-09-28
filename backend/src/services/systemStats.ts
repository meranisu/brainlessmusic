import { statfs } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { cacheSizeBytes } from './transcodeCache.js';

export interface DiskUsage {
  label: string;
  path: string;
  totalBytes: number;
  freeBytes: number;
}

export interface SystemStats {
  /** Resident set size of this server process. */
  memoryBytes: number;
  heapUsedBytes: number;
  /**
   * This process only, as a share of one core (so it can pass 100 on a busy
   * multi-core box). ffmpeg runs as a child process and is NOT included — a
   * transcode is the biggest CPU cost the server has, and it will not show
   * here; `activeTranscodes` on the health snapshot is the signal for that.
   */
  cpuPercent: number;
  disks: DiskUsage[];
  transcodeCache: { usedBytes: number; maxBytes: number };
}

// A poll shorter than this would measure a slice too thin to mean anything,
// and two admins refreshing at once would each steal the other's window.
const MIN_CPU_SAMPLE_MS = 1000;

let lastCpu = process.cpuUsage();
let lastAt = performance.now();
let lastPercent = 0;

/**
 * CPU time is cumulative, so a percentage needs two readings. Each call
 * measures the stretch since the previous one; until there is a stretch worth
 * measuring it repeats the last answer instead of inventing one.
 */
function sampleCpuPercent(): number {
  const now = performance.now();
  const elapsedMs = now - lastAt;
  if (elapsedMs < MIN_CPU_SAMPLE_MS) return lastPercent;

  const usage = process.cpuUsage(lastCpu);
  lastPercent = ((usage.user + usage.system) / 1000 / elapsedMs) * 100;
  lastCpu = process.cpuUsage();
  lastAt = now;
  return lastPercent;
}

async function diskUsage(label: string, path: string): Promise<DiskUsage | null> {
  try {
    const s = await statfs(path);
    return { label, path, totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
  } catch {
    // A root that is unmounted right now is exactly when this page is being
    // looked at; a missing row says more than failing the whole response.
    return null;
  }
}

export async function getSystemStats(): Promise<SystemStats> {
  const memory = process.memoryUsage();
  const [data, library, cacheBytes] = await Promise.all([
    diskUsage('Data', dirname(config.dbPath)),
    diskUsage('Library', config.libraryPath),
    cacheSizeBytes(),
  ]);

  return {
    memoryBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    cpuPercent: Math.round(sampleCpuPercent() * 10) / 10,
    disks: [data, library].filter((d): d is DiskUsage => d !== null),
    transcodeCache: { usedBytes: cacheBytes, maxBytes: config.transcodeCacheMaxMb * 1024 * 1024 },
  };
}
