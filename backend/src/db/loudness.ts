import { db } from './connection.js';

/** Where levelling aims every track: the ReplayGain 2.0 reference level. */
export const TARGET_LUFS = -18;
/** A raised track's true peak stays this far under full scale, so levelling never clips. */
export const PEAK_CEILING_DBTP = -1;
/** The most any track is raised, whatever its peak; a near-silent file shouldn't come out roaring. */
export const MAX_BOOST_DB = 12;

/**
 * The gain in dB that levels a track, as a SELECT expression on the `tracks` alias given. NULL until measured, and for
 * a silent file (no peak); clients play NULL at unity. SQLite's multi-argument MIN is NULL when any argument is.
 */
export function trackGainSql(alias = 't'): string {
  return `ROUND(MIN(${TARGET_LUFS} - ${alias}.loudness_lufs, ${PEAK_CEILING_DBTP} - ${alias}.loudness_peak, ${MAX_BOOST_DB}), 2)`;
}

/**
 * Tracks with no measurement yet, leaving out those that just failed. Most recently played first, so the songs people
 * actually listen to are levelled within hours of a deploy, not after the whole library (a day or more on 32k tracks).
 */
export function findUnmeasuredTrackIds(limit: number, skip: ReadonlySet<number>): number[] {
  const rows = db
    .prepare(
      `SELECT id FROM tracks
       WHERE loudness_lufs IS NULL AND missing_since IS NULL
       ORDER BY last_played_at IS NULL, last_played_at DESC, id
       LIMIT ?`,
    )
    .all(limit + skip.size) as Array<{ id: number }>;

  return rows.map((row) => row.id).filter((id) => !skip.has(id)).slice(0, limit);
}

export function setTrackLoudness(trackId: number, lufs: number, peak: number | null): void {
  db.prepare('UPDATE tracks SET loudness_lufs = ?, loudness_peak = ? WHERE id = ?').run(lufs, peak, trackId);
}
