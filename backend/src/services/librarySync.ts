import { stat } from 'node:fs/promises';
import { config } from '../config.js';
import { ensureDefaultLibraryRoot, listLibraryRoots, recordLibraryRootScan } from '../db/libraryRoots.js';
import { replaceScanFailures } from '../db/scanFailures.js';
import { reconcileMissingTracks, scanLibrary, type ReconcileSummary, type ScanSummary } from './scanner.js';
import { requestLoudnessBackfill } from './loudness.js';

/**
 * Keeps database and disk in agreement. Reconciliation (one stat per track) runs at boot and before each scan; the
 * full tag-reading scan finds new music and runs only on the interval, since dev restarts on every save.
 */

export interface LibrarySyncResult {
  scan?: ScanSummary;
  reconcile: ReconcileSummary;
}

/** Roots mid-sync. A second caller is turned away, not queued; per root, so separate drives don't block each other. */
const running = new Set<number>();

export function isLibrarySyncRunning(rootId: number): boolean {
  return running.has(rootId);
}

/** Whether any root is mid-sync. */
export function isAnyLibrarySyncRunning(): boolean {
  return running.size > 0;
}

export interface ScanProgress {
  processed: number;
  total: number;
}

/** Live scan progress per root. Absent means not scanning or still in the initial walk; cleared with `running`. */
const scanProgress = new Map<number, ScanProgress>();

export function getScanProgress(rootId: number): ScanProgress | null {
  return scanProgress.get(rootId) ?? null;
}

/** Reconciles one root, scanning first if asked. `null` if it is already syncing. */
export async function syncLibrary(
  libraryRoot: string,
  rootId: number,
  options: { scan?: boolean } = {},
): Promise<LibrarySyncResult | null> {
  if (running.has(rootId)) return null;
  running.add(rootId);

  try {
    // `scanLibrary` throws ENOENT on a vanished root (an unplugged drive), so check before scanning.
    const rootIsReadable = await stat(libraryRoot).then(
      () => true,
      () => false,
    );
    const scan =
      options.scan && rootIsReadable
        ? await scanLibrary(libraryRoot, rootId, (processed, total) => {
            scanProgress.set(rootId, { processed, total });
          })
        : undefined;
    // Only after a scan that actually ran: a reconcile-only pass has no
    // failure list, and replacing with nothing would wipe the last real one.
    if (scan) replaceScanFailures(rootId, scan.failures);
    const reconcile = await reconcileMissingTracks(libraryRoot, rootId, {
      abortRatio: config.libraryMissingAbortRatio,
    });
    recordLibraryRootScan(rootId, reconcile.aborted ?? null);
    if (scan) requestLoudnessBackfill();
    return { scan, reconcile };
  } finally {
    running.delete(rootId);
    scanProgress.delete(rootId);
  }
}

type Logger = { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

function describe(label: string, result: LibrarySyncResult): string {
  const { scan, reconcile } = result;
  const parts: string[] = [];

  if (scan) {
    parts.push(
      `scanned ${scan.filesFound} file${scan.filesFound === 1 ? '' : 's'} ` +
        `(${scan.filesAdded} added, ${scan.filesUpdated} updated, ${scan.filesFailed} failed)`,
    );
  }

  parts.push(`checked ${reconcile.checked} track${reconcile.checked === 1 ? '' : 's'} against disk`);
  if (reconcile.newlyMissing > 0) parts.push(`${reconcile.newlyMissing} newly missing`);
  if (reconcile.recovered > 0) parts.push(`${reconcile.recovered} recovered`);
  if (reconcile.unreadable > 0) parts.push(`${reconcile.unreadable} unreadable`);

  return `Library sync (${label}): ${parts.join(', ')}.`;
}

/**
 * Reconciles at boot, then scans every root in turn each `libraryScanIntervalHours`. Roots are re-read per run, so new
 * ones are picked up without a restart. One root failing doesn't stop the rest. `unref`'d.
 */
export function startLibrarySyncSchedule(log: Logger): NodeJS.Timeout | null {
  const runRoot = async (rootId: number, rootPath: string, label: string, withScan: boolean) => {
    try {
      const result = await syncLibrary(rootPath, rootId, { scan: withScan });

      if (!result) {
        log.info(`Library sync skipped for "${label}": one is already running.`);
        return;
      }

      log.info(describe(label, result));

      // Loud, because both of these mean the database is now describing music
      // that is not there, and neither fixes itself.
      if (result.reconcile.aborted) {
        log.warn(`Library sync guard tripped for "${label}": ${result.reconcile.aborted}`);
      } else if (result.reconcile.missingTotal > 0) {
        const stranded = result.reconcile.strandedOutsideRoot;
        log.warn(
          `${result.reconcile.missingTotal} track${result.reconcile.missingTotal === 1 ? '' : 's'} ` +
            `in "${label}" have no file on disk` +
            (stranded > 0 ? `, ${stranded} of them outside ${rootPath}` : '') +
            '. They are flagged, not deleted (see GET /api/library/missing).',
        );
      }
    } catch (err) {
      log.error(`Library sync failed for "${label}": ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const run = async (withScan: boolean) => {
    for (const root of listLibraryRoots()) {
      await runRoot(root.id, root.path, root.label ?? root.path, withScan);
    }
  };

  // Always runs: `/library/roots` needs a root even with scheduled scans off.
  ensureDefaultLibraryRoot(config.libraryPath);

  if (!config.libraryScanEnabled) {
    log.info('Scheduled library scans are disabled (LIBRARY_SCAN_ENABLED=false).');
    return null;
  }

  // Boot: reconcile only. Cheap, and it is the half that catches drift.
  void run(false);

  const timer = setInterval(() => void run(true), config.libraryScanIntervalHours * 60 * 60 * 1000);
  timer.unref();
  return timer;
}
