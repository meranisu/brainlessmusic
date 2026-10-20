import { db } from './connection.js';

/** What a song is compared on: who made it, when, which genres. */
export interface MixTrack {
  id: number;
  artistId: number | null;
  albumArtistId: number | null;
  year: number | null;
  genreIds: number[];
  liked: boolean;
}

interface RawMixTrack {
  id: number;
  artistId: number | null;
  albumArtistId: number | null;
  year: number | null;
  genreIds: string | null;
  liked: number;
}

const MIX_TRACK_SELECT = `SELECT t.id as id, t.artist_id as artistId, al.artist_id as albumArtistId, al.year as year,
         (SELECT group_concat(tg.genre_id) FROM track_genres tg WHERE tg.track_id = t.id) as genreIds,
         EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = @userId AND f.track_id = t.id) as liked
       FROM tracks t LEFT JOIN albums al ON al.id = t.album_id`;

function toMixTrack(row: RawMixTrack): MixTrack {
  return {
    id: row.id,
    artistId: row.artistId,
    albumArtistId: row.albumArtistId,
    year: row.year,
    genreIds: row.genreIds ? row.genreIds.split(',').map(Number) : [],
    liked: row.liked === 1,
  };
}

export function getMixTrack(trackId: number, userId: number): MixTrack | undefined {
  const row = db.prepare(`${MIX_TRACK_SELECT} WHERE t.id = @trackId`).get({ trackId, userId }) as RawMixTrack | undefined;
  return row ? toMixTrack(row) : undefined;
}

/** Years either side of the seed's that still count as the same era. */
export const ERA_YEARS = 5;

/**
 * Songs worth scoring against the seed: anything sharing a genre, an artist or album artist, or an era, plus the
 * co-played ids passed in. Leaves out the seed, hidden and missing songs, this user's "less often" songs and
 * `exclude`. Capped, genre and artist matches first, so a huge era match can't crowd out the close ones; ties are
 * cut by a hash of id and `salt`, so the same salt picks the same songs.
 */
export function findCandidates(
  seed: MixTrack,
  userId: number,
  coPlayed: readonly number[],
  exclude: readonly number[],
  cap: number,
  salt: number,
): MixTrack[] {
  const rows = db
    .prepare(
      `WITH matched(id, rank) AS (
         SELECT tg.track_id, 0 FROM track_genres tg WHERE tg.genre_id IN (SELECT value FROM json_each(@genres))
         UNION ALL SELECT value, 0 FROM json_each(@coPlayed)
         UNION ALL SELECT t.id, 1 FROM tracks t LEFT JOIN albums al ON al.id = t.album_id
           WHERE (@artistId IS NOT NULL AND t.artist_id = @artistId)
              OR (@albumArtistId IS NOT NULL AND al.artist_id = @albumArtistId)
         UNION ALL SELECT t.id, 2 FROM tracks t JOIN albums al ON al.id = t.album_id
           WHERE @year IS NOT NULL AND al.year BETWEEN @year - ${ERA_YEARS} AND @year + ${ERA_YEARS}
       ),
       picked AS (
         SELECT m.id FROM matched m JOIN tracks t ON t.id = m.id
         WHERE t.id != @seedId AND t.hidden = 0 AND t.missing_since IS NULL
           AND t.id NOT IN (SELECT track_id FROM less_often WHERE user_id = @userId)
           AND t.id NOT IN (SELECT value FROM json_each(@exclude))
         GROUP BY m.id
         ORDER BY MIN(m.rank), (m.id * 2654435761 + @salt) % 1000003
         LIMIT @cap
       )
       ${MIX_TRACK_SELECT} WHERE t.id IN (SELECT id FROM picked)`,
    )
    .all({
      seedId: seed.id,
      userId,
      genres: JSON.stringify(seed.genreIds),
      coPlayed: JSON.stringify(coPlayed),
      artistId: seed.artistId,
      albumArtistId: seed.albumArtistId,
      year: seed.year,
      exclude: JSON.stringify(exclude),
      cap,
      salt,
    }) as RawMixTrack[];

  return rows.map(toMixTrack);
}

/** Two plays this close together count as one listening session. */
const SESSION_GAP_MINUTES = 30;
/** Seed plays looked at; the most recent, so an old phase doesn't outweigh a new one. */
const MAX_SEED_PLAYS = 500;

/**
 * How often each song was played right before or right after the seed, by anyone, within 30 minutes. Skips don't
 * count on either side: a song skipped after the seed is the opposite of a match.
 */
export function coPlayCounts(seedId: number): Map<number, number> {
  const rows = db
    .prepare(
      `WITH seed_plays AS (
         SELECT user_id, played_at FROM play_history
         WHERE track_id = ? AND skipped = 0
         ORDER BY played_at DESC LIMIT ${MAX_SEED_PLAYS}
       ),
       neighbours AS (
         SELECT (SELECT ph.track_id FROM play_history ph
                 WHERE ph.user_id = s.user_id AND ph.played_at > s.played_at AND ph.skipped = 0
                   AND ph.played_at <= datetime(s.played_at, '+${SESSION_GAP_MINUTES} minutes')
                 ORDER BY ph.played_at LIMIT 1) as id
         FROM seed_plays s
         UNION ALL
         SELECT (SELECT ph.track_id FROM play_history ph
                 WHERE ph.user_id = s.user_id AND ph.played_at < s.played_at AND ph.skipped = 0
                   AND ph.played_at >= datetime(s.played_at, '-${SESSION_GAP_MINUTES} minutes')
                 ORDER BY ph.played_at DESC LIMIT 1)
         FROM seed_plays s
       )
       SELECT id, COUNT(*) as n FROM neighbours WHERE id IS NOT NULL AND id != ? GROUP BY id`,
    )
    .all(seedId, seedId) as Array<{ id: number; n: number }>;

  return new Map(rows.map((row) => [row.id, row.n]));
}

export interface DailySeedGenre {
  genreId: number;
  name: string;
  /** This user's most played songs in the genre over the window, most played first. */
  trackIds: number[];
}

/**
 * The user's top genres over the last [days] days with their most played songs in each, for daily mixes. Hidden
 * songs and skips are left out.
 */
export function listDailySeedGenres(userId: number, days: number, genres: number, perGenre: number): DailySeedGenre[] {
  const rows = db
    .prepare(
      `WITH plays AS (
         SELECT ph.track_id, COUNT(*) as n FROM play_history ph JOIN tracks t ON t.id = ph.track_id
         WHERE ph.user_id = @userId AND ph.skipped = 0 AND ph.played_at >= datetime('now', @window)
           AND t.hidden = 0 AND t.missing_since IS NULL
         GROUP BY ph.track_id
       ),
       top AS (
         SELECT tg.genre_id, SUM(p.n) as plays FROM plays p JOIN track_genres tg ON tg.track_id = p.track_id
         GROUP BY tg.genre_id ORDER BY plays DESC LIMIT @genres
       )
       SELECT top.genre_id as genreId, g.name as name, p.track_id as trackId
       FROM top JOIN genres g ON g.id = top.genre_id
       JOIN track_genres tg ON tg.genre_id = top.genre_id JOIN plays p ON p.track_id = tg.track_id
       ORDER BY top.plays DESC, g.id, p.n DESC, p.track_id`,
    )
    .all({ userId, window: `-${days} days`, genres }) as Array<{ genreId: number; name: string; trackId: number }>;

  const byGenre = new Map<number, DailySeedGenre>();
  for (const row of rows) {
    let genre = byGenre.get(row.genreId);
    if (!genre) byGenre.set(row.genreId, (genre = { genreId: row.genreId, name: row.name, trackIds: [] }));
    if (genre.trackIds.length < perGenre) genre.trackIds.push(row.trackId);
  }
  return [...byGenre.values()];
}
