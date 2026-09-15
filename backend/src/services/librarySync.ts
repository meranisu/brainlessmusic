import { stat } from 'node:fs/promises';
import { config } from '../config.js';
import { ensureDefaultLibraryRoot, listLibraryRoots, recordLibraryRootScan } from '../db/libraryRoots.js';
import { reconcileMissingTracks, scanLibrary, type ReconcileSummary, type ScanSummary } from './scanner.js';

/**
 * Keeping the database and the disk in agreement, on a timer.
 *
 * Two different jobs, deliberately on different schedules:
 *
 *  - **Reconciliation** stats the paths already in the database and flags the
 *    ones that have gone. It is cheap — one `stat` per track — and it is what
 *    catches rows quietly rotting into `500`s on the stream endpoint. It runs
 *    at boot and before every scheduled scan.
 *  - **A full scan** walks the library off disk and re-reads tags on every
 *    file. It is the expensive half and the only one that finds *new* music,
 *    so it runs on the interval and never at boot: in development the server
 *    restarts on every file save, and a full library walk per keystroke is not
 *    a thing anyone wants.
 */

export interface LibrarySyncResult {
  scan?: ScanSummary;
  reconcile: ReconcileSummary;
}

/**
 * True while a sync is running, per root.
 *
 * A scan writes a row per file, so a scheduled run landing on top of an
 * admin's manual one would have both walking the same library and upserting
 * the same paths. The second caller is turned away rather than queued —
 * whatever it wanted to know, the run already in flight is about to find out.
 *
 * Keyed by root id rather than one shared flag: independent roots (separate
 * drives) have nothing to contend over, and a lock that treated them as one
 * would block every other root's scan for as long as the slowest drive's
 * scan happened to take.
 */
const running = new Set<number>();

export function isLibrarySyncRunning(rootId: number): boolean {
  return running.has(rootId);
}

/** Whether any root is mid-sync — what a whole-server health check actually wants to know. */
export function isAnyLibrarySyncRunning(): boolean {
  return running.size > 0;
}

/**
 * Reconciles, and optionally scans first, one root. Returns `null` if that
 * root already has a sync in progress.
 */
export async function syncLibrary(
  libraryRoot: string,
  rootId: number,
  options: { scan?: boolean } = {},
): Promise<LibrarySyncResult | null> {
  if (running.has(rootId)) return null;
  running.add(rootId);

  try {
    // `scanLibrary` walks the directory outright and throws if it's gone
    // (ENOENT from `readdir`) — unlike `reconcileMissingTracks` below, which
    // already treats a vanished root as "nothing to mark", not a crash. A
    // root that was fine when it was added can still disappear by the next
    // scan (the drive it's on, unplugged), so this has to be checked here
    // too rather than trusted from options.scan alone.
    const rootIsReadable = await stat(libraryRoot).then(
      () => true,
      () => false,
    );
    const scan = options.scan && rootIsReadable ? await scanLibrary(libraryRoot, rootId) : undefined;
    const reconcile = await reconcileMissingTracks(libraryRoot, rootId, {
      abortRatio: config.libraryMissingAbortRatio,
    });
    recordLibraryRootScan(rootId, reconcile.aborted ?? null);
    return { scan, reconcile };
  } finally {
    running.delete(rootId);
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
 * Reconciles at boot, then scans and reconciles every
 * `libraryScanIntervalHours` — once per registered root, in sequence. Roots
 * are read fresh on every run rather than captured once at startup, so a
 * root added from the UI after boot is picked up by the very next tick
 * without a restart.
 *
 * A failure in one root is logged and the schedule continues to the next —
 * for the same reason backups work that way: a server that stops serving
 * music because it could not walk one directory has traded a small problem
 * for a large one. The timer is `unref`'d so it never holds the process open.
 */
export function startLibrarySyncSchedule(log: Logger): NodeJS.Timeout | null {
  const runRoot = async (rootId: number, rootPath: string, label: string, withScan: boolean) => {
    try {
      const result = await syncLibrary(rootPath, rootId, { scan: withScan });

      if (!result) {
        log.info(`Library sync skipped for "${label}" — one is already running.`);
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
            '. They are flagged, not deleted — see GET /api/library/missing.',
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

  // Runs regardless of the flag below — a root list this app can query from
  // `/library/roots` has to exist even with scheduled scanning turned off.
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
