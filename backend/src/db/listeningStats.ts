import { db } from './connection.js';
import { getTrackSummariesByIds, type TrackSummary } from './browse.js';

export type StatsRange = 'week' | 'month' | 'year' | 'all';

/** Rolling windows, not calendar ones: Wrapped (calendar year) has its own query. */
const RANGE_MODIFIER: Record<Exclude<StatsRange, 'all'>, string> = {
  week: '-7 days',
  month: '-30 days',
  year: '-365 days',
};

/**
 * Milliseconds a play counts for (A62): the reported total once the app sent it, otherwise one full play of the song.
 * Needs `ph` (play_history) and `t` (tracks) in scope. The Control Center's Overview uses it too (`summarizeRecentPlays`).
 */
export const LISTENED_MS = `CASE WHEN ph.ms_final = 1 THEN COALESCE(ph.ms_played, 0)
  ELSE COALESCE(CAST(t.duration * 1000 AS INTEGER), ph.ms_played, 0) END`;

export interface StatsTotals {
  plays: number;
  msListened: number;
  tracks: number;
  artists: number;
}

/**
 * Where the song or artist ranked in the window just before this one (A91): null when it wasn't played then. Left out
 * for all time, which has nothing before it.
 */
type PreviousRank = { previousRank?: number | null };

export interface TopTrackStat extends PreviousRank {
  track: TrackSummary;
  plays: number;
  msListened: number;
}

export interface TopArtistStat extends PreviousRank {
  id: number;
  name: string;
  plays: number;
  msListened: number;
}

export interface TopAlbumStat {
  id: number;
  title: string;
  artist: string | null;
  plays: number;
  msListened: number;
}

export interface UserStats {
  range: StatsRange;
  /** ISO-ish SQLite timestamp the range starts at, or null for all time. */
  since: string | null;
  memberSince: string;
  totals: StatsTotals;
  /** The same totals for the window just before this one, same length; null for all time (A91). */
  previousTotals: StatsTotals | null;
  topTracks: TopTrackStat[];
  topArtists: TopArtistStat[];
  topAlbums: TopAlbumStat[];
  counts: { liked: number; lessOften: number; playlists: number };
}

export interface TrackStat {
  trackId: number;
  plays: number;
  /** Times cut short before the scrobble threshold (A113); the player's clear lamp weighs them against plays (A115). */
  skips: number;
  msListened: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
}

function sinceFor(range: StatsRange): string | null {
  if (range === 'all') return null;
  return (db.prepare('SELECT datetime(\'now\', ?) AS since').get(RANGE_MODIFIER[range]) as { since: string }).since;
}

/** Where the window before [since] starts: as far back again as [range] reaches. */
function previousSinceFor(range: Exclude<StatsRange, 'all'>, since: string): string {
  return (db.prepare('SELECT datetime(?, ?) AS since').get(since, RANGE_MODIFIER[range]) as { since: string }).since;
}

// Top-list orders, as aggregate expressions so the previous window's ranking (a window function) can reuse them.
const TRACK_ORDER = `COUNT(*) DESC, SUM(${LISTENED_MS}) DESC, MAX(ph.played_at) DESC`;
const ARTIST_ORDER = `COUNT(*) DESC, SUM(${LISTENED_MS}) DESC, MIN(a.name)`;

/** Leaves out skips (A113): they count toward time listened, never toward plays or the top lists. */
const PLAYED_ONLY = 'ph.skipped = 0';

// Totals over [scope]; the same sums for the current and the previous window. Time listened includes skips.
const TOTALS_SQL = (scope: string) => `SELECT COALESCE(SUM(ph.skipped = 0), 0) AS plays,
         COALESCE(SUM(${LISTENED_MS}), 0) AS msListened,
         COUNT(DISTINCT CASE WHEN ${PLAYED_ONLY} THEN ph.track_id END) AS tracks,
         COUNT(DISTINCT CASE WHEN ${PLAYED_ONLY} THEN t.artist_id END) AS artists
  FROM play_history ph JOIN tracks t ON t.id = ph.track_id
  WHERE ${scope}`;

/**
 * Each of [ids]' rank among everything played in the previous window, ranked the same way as the top list. Ranked over
 * the whole window, not just [ids], so a song that was 40th shows as 40th. [filter] is a join or condition that leaves
 * out what the top list leaves out.
 */
function previousRanks(
  key: 'ph.track_id' | 't.artist_id',
  order: string,
  filter: { join?: string; where?: string },
  params: { userId: number; from: string; to: string },
  ids: number[],
): Map<number, number> {
  if (ids.length === 0) return new Map();
  const rows = db
    .prepare(
      `WITH ranked AS (
         SELECT ${key} AS id, ROW_NUMBER() OVER (ORDER BY ${order}) AS rank
         FROM play_history ph JOIN tracks t ON t.id = ph.track_id ${filter.join ?? ''}
         WHERE ph.user_id = @userId AND ph.played_at >= @from AND ph.played_at < @to AND ${PLAYED_ONLY}
           ${filter.where ?? ''}
         GROUP BY ${key}
       )
       SELECT id, rank FROM ranked WHERE id IN (SELECT value FROM json_each(@ids))`,
    )
    .all({ ...params, ids: JSON.stringify(ids) }) as { id: number; rank: number }[];
  return new Map(rows.map((r) => [r.id, r.rank]));
}

function count(sql: string, userId: number): number {
  return (db.prepare(sql).get(userId) as { c: number }).c;
}

/** One account's listening over [range]: totals, the top [limit] songs, artists and albums, and library counts. */
export function getUserStats(userId: number, range: StatsRange, limit: number): UserStats | undefined {
  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId) as { created_at: string } | undefined;
  if (!user) return undefined;

  const since = sinceFor(range);
  // `played_at >= ''` is every row, so one statement serves every range.
  const params = { userId, since: since ?? '', limit };
  const scope = 'ph.user_id = @userId AND ph.played_at >= @since';

  const totals = db.prepare(TOTALS_SQL(scope)).get(params) as StatsTotals;

  // Missing files are left out of the top lists: they can't be played from there.
  const trackRows = db
    .prepare(
      `SELECT ph.track_id AS id, COUNT(*) AS plays, SUM(${LISTENED_MS}) AS msListened, MAX(ph.played_at) AS last
       FROM play_history ph JOIN tracks t ON t.id = ph.track_id
       WHERE ${scope} AND ${PLAYED_ONLY} AND t.missing_since IS NULL
       GROUP BY ph.track_id
       ORDER BY ${TRACK_ORDER}
       LIMIT @limit`,
    )
    .all(params) as { id: number; plays: number; msListened: number }[];
  const summaries = new Map(getTrackSummariesByIds(trackRows.map((r) => r.id)).map((s) => [s.id, s]));
  const topTracks: TopTrackStat[] = trackRows.flatMap((row) => {
    const track = summaries.get(row.id);
    return track ? [{ track, plays: row.plays, msListened: row.msListened }] : [];
  });

  const topArtists = db
    .prepare(
      `SELECT a.id AS id, a.name AS name, COUNT(*) AS plays, SUM(${LISTENED_MS}) AS msListened
       FROM play_history ph JOIN tracks t ON t.id = ph.track_id JOIN artists a ON a.id = t.artist_id
       WHERE ${scope} AND ${PLAYED_ONLY}
       GROUP BY a.id
       ORDER BY ${ARTIST_ORDER}
       LIMIT @limit`,
    )
    .all(params) as TopArtistStat[];

  const topAlbums = db
    .prepare(
      `SELECT al.id AS id, al.title AS title, a.name AS artist, COUNT(*) AS plays, SUM(${LISTENED_MS}) AS msListened
       FROM play_history ph JOIN tracks t ON t.id = ph.track_id JOIN albums al ON al.id = t.album_id
       LEFT JOIN artists a ON a.id = al.artist_id
       WHERE ${scope} AND ${PLAYED_ONLY}
       GROUP BY al.id
       ORDER BY plays DESC, msListened DESC, al.title
       LIMIT @limit`,
    )
    .all(params) as TopAlbumStat[];

  let previousTotals: StatsTotals | null = null;
  if (range !== 'all' && since) {
    const window = { userId, from: previousSinceFor(range, since), to: since };
    previousTotals = db
      .prepare(TOTALS_SQL('ph.user_id = @userId AND ph.played_at >= @from AND ph.played_at < @to'))
      .get(window) as StatsTotals;
    const trackRanks = previousRanks('ph.track_id', TRACK_ORDER, { where: 'AND t.missing_since IS NULL' }, window, topTracks.map((x) => x.track.id));
    for (const x of topTracks) x.previousRank = trackRanks.get(x.track.id) ?? null;
    const artistRanks = previousRanks('t.artist_id', ARTIST_ORDER, { join: 'JOIN artists a ON a.id = t.artist_id' }, window, topArtists.map((x) => x.id));
    for (const x of topArtists) x.previousRank = artistRanks.get(x.id) ?? null;
  }

  return {
    range,
    since,
    memberSince: user.created_at,
    totals,
    previousTotals,
    topTracks,
    topArtists,
    topAlbums,
    counts: {
      liked: count('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?', userId),
      lessOften: count('SELECT COUNT(*) AS c FROM less_often WHERE user_id = ?', userId),
      playlists: count('SELECT COUNT(*) AS c FROM playlists WHERE owner_id = ?', userId),
    },
  };
}

/** One song's numbers for one account, all time. Zero plays is a valid answer, not a 404. Time includes skips (A113). */
export function getTrackStat(userId: number, trackId: number): TrackStat {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(ph.skipped = 0), 0) AS plays, COALESCE(SUM(ph.skipped = 1), 0) AS skips,
              COALESCE(SUM(${LISTENED_MS}), 0) AS msListened,
              MIN(CASE WHEN ${PLAYED_ONLY} THEN ph.played_at END) AS firstPlayedAt,
              MAX(CASE WHEN ${PLAYED_ONLY} THEN ph.played_at END) AS lastPlayedAt
       FROM play_history ph JOIN tracks t ON t.id = ph.track_id
       WHERE ph.user_id = ? AND ph.track_id = ?`,
    )
    .get(userId, trackId) as Omit<TrackStat, 'trackId'>;
  return { trackId, ...row };
}

/**
 * The final listening time for one of the user's own plays (A62). Capped at the song's length when known, so a stuck
 * timer can't inflate stats. Returns false if the play isn't theirs.
 */
export function finishPlay(userId: number, playId: number, msPlayed: number): boolean {
  return (
    db
      .prepare(
        `UPDATE play_history
         SET ms_played = MIN(@ms, COALESCE((SELECT CAST(duration * 1000 AS INTEGER) FROM tracks WHERE id = play_history.track_id), @ms)),
             ms_final = 1
         WHERE id = @playId AND user_id = @userId`,
      )
      .run({ ms: msPlayed, playId, userId }).changes > 0
  );
}

/** The songs this user marked "less often", newest mark first, as track summaries. */
export function listLessOftenTracks(userId: number, limit: number, offset: number): TrackSummary[] {
  const ids = (
    db
      .prepare('SELECT track_id FROM less_often WHERE user_id = ? ORDER BY created_at DESC, track_id DESC LIMIT ? OFFSET ?')
      .all(userId, limit, offset) as { track_id: number }[]
  ).map((r) => r.track_id);
  const byId = new Map(getTrackSummariesByIds(ids).map((s) => [s.id, s]));
  return ids.flatMap((id) => {
    const s = byId.get(id);
    return s ? [s] : [];
  });
}

export interface TopGenreStat {
  id: number;
  name: string;
  plays: number;
}

/** One person's most played genres over [range] (profile page, A169). A song with two genres counts toward both. */
export function getTopGenres(userId: number, range: StatsRange, limit: number): TopGenreStat[] {
  const since = sinceFor(range);
  return db
    .prepare(
      `SELECT g.id AS id, g.name AS name, COUNT(*) AS plays
       FROM play_history ph
       JOIN track_genres tg ON tg.track_id = ph.track_id
       JOIN genres g ON g.id = tg.genre_id
       WHERE ph.user_id = ? AND ph.played_at >= ? AND ${PLAYED_ONLY}
       GROUP BY g.id
       ORDER BY plays DESC, g.name COLLATE NOCASE
       LIMIT ?`,
    )
    .all(userId, since ?? '', limit) as TopGenreStat[];
}
