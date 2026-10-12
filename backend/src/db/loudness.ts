import { db } from './connection.js';
import { buildMatchQuery } from '../utils/ftsQuery.js';

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

/** Where a track stands in levelling, for the Control Center. `failed` lives in memory, so the caller passes it in. */
export type LoudnessStatus = 'levelled' | 'waiting' | 'failed';

export interface LoudnessSummary {
  /** Tracks on disk; missing ones are never measured. */
  total: number;
  levelled: number;
  waiting: number;
  failed: number;
}

export interface TrackLoudnessRow {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  status: LoudnessStatus;
  loudnessLufs: number | null;
  loudnessPeak: number | null;
  gainDb: number | null;
}

export interface ListTrackLoudnessOptions {
  status?: LoudnessStatus;
  search?: string;
  limit: number;
  offset: number;
  failedIds: ReadonlySet<number>;
}

export function summarizeLoudness(failedIds: ReadonlySet<number>): LoudnessSummary {
  const row = db
    .prepare(
      `SELECT COUNT(*) as total,
              COALESCE(SUM(loudness_lufs IS NOT NULL), 0) as levelled,
              COALESCE(SUM(loudness_lufs IS NULL AND id IN (SELECT value FROM json_each(?))), 0) as failed
       FROM tracks WHERE missing_since IS NULL`,
    )
    .get(JSON.stringify([...failedIds])) as { total: number; levelled: number; failed: number };

  return { ...row, waiting: row.total - row.levelled - row.failed };
}

/**
 * One page of tracks with their levelling state. Waiting tracks come in the order they will be measured; the rest by
 * title. Search goes through the FTS index like the library's, falling back to LIKE under its trigram floor.
 */
export function listTrackLoudness(options: ListTrackLoudnessOptions): { total: number; tracks: TrackLoudnessRow[] } {
  const failedJson = JSON.stringify([...options.failedIds]);
  const isFailed = `t.id IN (SELECT value FROM json_each(@failed))`;
  const clauses = ['t.missing_since IS NULL'];
  const params: Record<string, unknown> = { failed: failedJson, limit: options.limit, offset: options.offset };

  if (options.status === 'levelled') clauses.push('t.loudness_lufs IS NOT NULL');
  if (options.status === 'waiting') clauses.push(`t.loudness_lufs IS NULL AND NOT ${isFailed}`);
  if (options.status === 'failed') clauses.push(`t.loudness_lufs IS NULL AND ${isFailed}`);

  const search = options.search?.trim();
  if (search) {
    const match = buildMatchQuery(search);
    if (match) {
      clauses.push('t.id IN (SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH @match)');
      params.match = match;
    } else {
      clauses.push('(t.title LIKE @like OR a.name LIKE @like OR al.title LIKE @like)');
      params.like = `%${search}%`;
    }
  }

  const from = `FROM tracks t
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE ${clauses.join(' AND ')}`;
  const order =
    options.status === 'waiting'
      ? 't.last_played_at IS NULL, t.last_played_at DESC, t.id'
      : 't.title COLLATE NOCASE, t.id';

  const { total } = db.prepare(`SELECT COUNT(*) as total ${from}`).get(params) as { total: number };
  const tracks = db
    .prepare(
      `SELECT t.id as id, t.title as title, a.name as artist, al.title as album,
              CASE WHEN t.loudness_lufs IS NOT NULL THEN 'levelled'
                   WHEN ${isFailed} THEN 'failed' ELSE 'waiting' END as status,
              t.loudness_lufs as loudnessLufs, t.loudness_peak as loudnessPeak, ${trackGainSql()} as gainDb
       ${from}
       ORDER BY ${order}
       LIMIT @limit OFFSET @offset`,
    )
    .all(params) as TrackLoudnessRow[];

  return { total, tracks };
}
