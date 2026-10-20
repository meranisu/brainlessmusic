import { stat } from 'node:fs/promises';
import { config } from '../config.js';
import {
  ensureDefaultLibraryRoot,
  listLibraryRoots,
  recordLibraryRootFullScan,
  recordLibraryRootScan,
} from '../db/libraryRoots.js';
import { replaceScanFailures } from '../db/scanFailures.js';
import { reconcileMissingTracks, scanLibrary, type ReconcileSummary, type ScanSummary } from './scanner.js';
import { requestLoudnessBackfill } from './loudness.js';

/**
 * Keeps database and disk in agreement. Reconciliation (one stat per track) runs at boot and before each scan; the
 * full tag-reading scan finds new music and runs when a root's last one is older than the interval, checked at boot
 * and hourly. Not on every boot: dev restarts on every save, and smol on every deploy.
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

/** Reconciles one root, scanning first if asked; `full` rereads unchanged files too. `null` if it is already syncing. */
export async function syncLibrary(
  libraryRoot: string,
  rootId: number,
  artworkRoot: string,
  options: { scan?: boolean; full?: boolean } = {},
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
        ? await scanLibrary(libraryRoot, rootId, artworkRoot, (processed, total) => {
            scanProgress.set(rootId, { processed, total });
          }, undefined, { full: options.full })
        : undefined;
    // Only after a scan that actually ran: a reconcile-only pass has no
    // failure list, and replacing with nothing would wipe the last real one.
    if (scan) {
      replaceScanFailures(rootId, scan.failures);
      recordLibraryRootFullScan(rootId);
    }
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
        `(${scan.filesAdded} added, ${scan.filesUpdated} updated, ${scan.filesUnchanged} unchanged, ` +
        `${scan.filesFailed} failed)`,
    );
  }

  parts.push(`checked ${reconcile.checked} track${reconcile.checked === 1 ? '' : 's'} against disk`);
  if (reconcile.newlyMissing > 0) parts.push(`${reconcile.newlyMissing} newly missing`);
  if (reconcile.recovered > 0) parts.push(`${reconcile.recovered} recovered`);
  if (reconcile.unreadable > 0) parts.push(`${reconcile.unreadable} unreadable`);

  return `Library sync (${label}): ${parts.join(', ')}.`;
}

/** How often the schedule looks for a root that is due a scan. */
const DUE_CHECK_MS = 5 * 60 * 1000;

/**
 * Whether a root is due a full scan: never scanned, or the last one is at least `intervalHours` old. `lastFullScanAt`
 * is SQLite's `datetime('now')`, UTC without a zone.
 */
export function isScanDue(lastFullScanAt: string | null, now: Date, intervalHours: number): boolean {
  if (!lastFullScanAt) return true;
  const last = Date.parse(`${lastFullScanAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= intervalHours * 60 * 60 * 1000;
}

/**
 * At boot, reconciles every root and scans those due; then every 5 minutes, scans whichever are due. The clock is the
 * database's `last_full_scan_at`, so a restart (each auto-deploy, A120) no longer starts the interval over. A manual
 * scan stamps it too. Roots are re-read per run, so new ones are picked up without a restart. One root failing doesn't
 * stop the rest. `unref`'d.
 */
export function startLibrarySyncSchedule(log: Logger): NodeJS.Timeout | null {
  const runRoot = async (rootId: number, rootPath: string, label: string, withScan: boolean) => {
    try {
      const result = await syncLibrary(rootPath, rootId, config.artworkPath, { scan: withScan });

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

  /** Every root at boot (reconciling the rest); only due ones on the hourly check. */
  const run = async (reconcileTheRest: boolean) => {
    const now = new Date();
    for (const root of listLibraryRoots()) {
      const due = isScanDue(root.last_full_scan_at, now, config.libraryScanIntervalHours);
      if (due || reconcileTheRest) await runRoot(root.id, root.path, root.label ?? root.path, due);
    }
  };

  // Always runs: `/library/roots` needs a root even with scheduled scans off.
  ensureDefaultLibraryRoot(config.libraryPath);

  if (!config.libraryScanEnabled) {
    log.info('Scheduled library scans are disabled (LIBRARY_SCAN_ENABLED=false).');
    return null;
  }

  // Boot: reconcile every root (cheap, and the half that catches drift), scanning any that are due.
  void run(true);

  const timer = setInterval(() => void run(false), DUE_CHECK_MS);
  timer.unref();
  return timer;
}
