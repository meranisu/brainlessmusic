import { config } from '../config.js';
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
 * True while a sync is running.
 *
 * A scan writes a row per file, so a scheduled run landing on top of an
 * admin's manual one would have both walking the same library and upserting
 * the same paths. The second caller is turned away rather than queued —
 * whatever it wanted to know, the run already in flight is about to find out.
 */
let running = false;

export function isLibrarySyncRunning(): boolean {
  return running;
}

/**
 * Reconciles, and optionally scans first. Returns `null` if a sync is already
 * in progress.
 */
export async function syncLibrary(
  libraryRoot: string,
  options: { scan?: boolean } = {},
): Promise<LibrarySyncResult | null> {
  if (running) return null;
  running = true;

  try {
    const scan = options.scan ? await scanLibrary(libraryRoot) : undefined;
    const reconcile = await reconcileMissingTracks(libraryRoot, {
      abortRatio: config.libraryMissingAbortRatio,
    });
    return { scan, reconcile };
  } finally {
    running = false;
  }
}

type Logger = { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

function describe(result: LibrarySyncResult): string {
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

  return `Library sync: ${parts.join(', ')}.`;
}

/**
 * Reconciles at boot, then scans and reconciles every
 * `libraryScanIntervalHours`.
 *
 * A failure is logged and the schedule continues, for the same reason backups
 * work that way: a server that stops serving music because it could not walk a
 * directory has traded a small problem for a large one. The timer is `unref`'d
 * so it never holds the process open.
 */
export function startLibrarySyncSchedule(log: Logger): NodeJS.Timeout | null {
  const run = async (withScan: boolean) => {
    try {
      const result = await syncLibrary(config.libraryPath, { scan: withScan });

      if (!result) {
        log.info('Library sync skipped — one is already running.');
        return;
      }

      log.info(describe(result));

      // Loud, because both of these mean the database is now describing music
      // that is not there, and neither fixes itself.
      if (result.reconcile.aborted) {
        log.warn(`Library sync guard tripped: ${result.reconcile.aborted}`);
      } else if (result.reconcile.missingTotal > 0) {
        const stranded = result.reconcile.strandedOutsideRoot;
        log.warn(
          `${result.reconcile.missingTotal} track${result.reconcile.missingTotal === 1 ? '' : 's'} ` +
            `have no file on disk` +
            (stranded > 0 ? `, ${stranded} of them outside ${config.libraryPath}` : '') +
            '. They are flagged, not deleted — see GET /api/library/missing.',
        );
      }
    } catch (err) {
      log.error(`Library sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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
