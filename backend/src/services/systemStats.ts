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
  /** This process only, per core (can pass 100). Excludes ffmpeg; `activeTranscodes` shows that. */
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

/** CPU % needs two readings; until a long enough stretch has passed, the last answer is repeated. */
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
    cacheSizeBytes(config.transcodePath),
  ]);

  return {
    memoryBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    cpuPercent: Math.round(sampleCpuPercent() * 10) / 10,
    disks: [data, library].filter((d): d is DiskUsage => d !== null),
    transcodeCache: { usedBytes: cacheBytes, maxBytes: config.transcodeCacheMaxMb * 1024 * 1024 },
  };
}
