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
 * Needs `ph` (play_history) and `t` (tracks) in scope.
 */
const LISTENED_MS = `CASE WHEN ph.ms_final = 1 THEN COALESCE(ph.ms_played, 0)
  ELSE COALESCE(CAST(t.duration * 1000 AS INTEGER), ph.ms_played, 0) END`;

export interface StatsTotals {
  plays: number;
  msListened: number;
  tracks: number;
  artists: number;
}

export interface TopTrackStat {
  track: TrackSummary;
  plays: number;
  msListened: number;
}

export interface TopArtistStat {
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
  topTracks: TopTrackStat[];
  topArtists: TopArtistStat[];
  topAlbums: TopAlbumStat[];
  counts: { liked: number; lessOften: number; playlists: number };
}

export interface TrackStat {
  trackId: number;
  plays: number;
  msListened: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
}

function sinceFor(range: StatsRange): string | null {
  if (range === 'all') return null;
  return (db.prepare('SELECT datetime(\'now\', ?) AS since').get(RANGE_MODIFIER[range]) as { since: string }).since;
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

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS plays, COALESCE(SUM(${LISTENED_MS}), 0) AS msListened,
              COUNT(DISTINCT ph.track_id) AS tracks, COUNT(DISTINCT t.artist_id) AS artists
       FROM play_history ph JOIN tracks t ON t.id = ph.track_id
       WHERE ${scope}`,
    )
    .get(params) as StatsTotals;

  // Missing files are left out of the top lists: they can't be played from there.
  const trackRows = db
    .prepare(
      `SELECT ph.track_id AS id, COUNT(*) AS plays, SUM(${LISTENED_MS}) AS msListened, MAX(ph.played_at) AS last
       FROM play_history ph JOIN tracks t ON t.id = ph.track_id
       WHERE ${scope} AND t.missing_since IS NULL
       GROUP BY ph.track_id
       ORDER BY plays DESC, msListened DESC, last DESC
       LIMIT @limit`,
    )
    .all(params) as { id: number; plays: number; msListened: number }[];
  const summaries = new Map(getTrackSummariesByIds(trackRows.map((r) => r.id)).map((s) => [s.id, s]));
  const topTracks = trackRows.flatMap((row) => {
    const track = summaries.get(row.id);
    return track ? [{ track, plays: row.plays, msListened: row.msListened }] : [];
  });

  const topArtists = db
    .prepare(
      `SELECT a.id AS id, a.name AS name, COUNT(*) AS plays, SUM(${LISTENED_MS}) AS msListened
       FROM play_history ph JOIN tracks t ON t.id = ph.track_id JOIN artists a ON a.id = t.artist_id
       WHERE ${scope}
       GROUP BY a.id
       ORDER BY plays DESC, msListened DESC, a.name
       LIMIT @limit`,
    )
    .all(params) as TopArtistStat[];

  const topAlbums = db
    .prepare(
      `SELECT al.id AS id, al.title AS title, a.name AS artist, COUNT(*) AS plays, SUM(${LISTENED_MS}) AS msListened
       FROM play_history ph JOIN tracks t ON t.id = ph.track_id JOIN albums al ON al.id = t.album_id
       LEFT JOIN artists a ON a.id = al.artist_id
       WHERE ${scope}
       GROUP BY al.id
       ORDER BY plays DESC, msListened DESC, al.title
       LIMIT @limit`,
    )
    .all(params) as TopAlbumStat[];

  return {
    range,
    since,
    memberSince: user.created_at,
    totals,
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

/** One song's numbers for one account, all time. Zero plays is a valid answer, not a 404. */
export function getTrackStat(userId: number, trackId: number): TrackStat {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS plays, COALESCE(SUM(${LISTENED_MS}), 0) AS msListened,
              MIN(ph.played_at) AS firstPlayedAt, MAX(ph.played_at) AS lastPlayedAt
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
