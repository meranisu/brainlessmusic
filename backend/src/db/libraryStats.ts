import { db } from './connection.js';

export interface FormatStat {
  /** As tagged at scan (`codec`, else container, else the extension); `null` when none of those was readable. */
  format: string | null;
  tracks: number;
  bytes: number;
}

export interface LibraryStats {
  tracks: number;
  seconds: number;
  bytes: number;
  /** Largest share of disk first. */
  formats: FormatStat[];
  /** Admin only: present tracks that are hidden (already counted above), and tracks whose file is missing (not). */
  hidden?: number;
  missing?: number;
}

/**
 * What is in the library (A52). Counts files that are present; a listener's view also leaves out hidden tracks, so the
 * totals match what they can browse.
 */
export function getLibraryStats(options: { includeHidden: boolean }): LibraryStats {
  const where = options.includeHidden ? 'WHERE missing_since IS NULL' : 'WHERE missing_since IS NULL AND hidden = 0';

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS tracks, COALESCE(SUM(duration), 0) AS seconds, COALESCE(SUM(file_size), 0) AS bytes
       FROM tracks ${where}`,
    )
    .get() as { tracks: number; seconds: number; bytes: number };

  const formats = db
    .prepare(
      `SELECT format, COUNT(*) AS tracks, COALESCE(SUM(file_size), 0) AS bytes
       FROM tracks ${where}
       GROUP BY format
       ORDER BY bytes DESC, tracks DESC`,
    )
    .all() as FormatStat[];

  const stats: LibraryStats = { ...totals, formats };
  if (options.includeHidden) {
    const extra = db
      .prepare(
        `SELECT COALESCE(SUM(missing_since IS NULL AND hidden = 1), 0) AS hidden,
                COALESCE(SUM(missing_since IS NOT NULL), 0) AS missing
         FROM tracks`,
      )
      .get() as { hidden: number; missing: number };
    Object.assign(stats, extra);
  }
  return stats;
}
