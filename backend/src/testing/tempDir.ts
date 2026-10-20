import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Kept apart from `harness.ts` so a script can make its scratch directory before anything imports `config.ts`, which
 * reads the data paths from the environment once, on import.
 */

/** A scratch directory outside the repository, removed by the returned cleanup. */
export async function makeTempDir(prefix: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), `brainlessmusic-${prefix}-`));
  return { path, cleanup: () => rm(path, { recursive: true, force: true }) };
}
