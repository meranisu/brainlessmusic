import { db } from './connection.js';
import type { AlbumSummary } from './browse.js';

export interface GenreSummary {
  id: number;
  name: string;
  /** Playable tracks: on disk and not hidden. */
  trackCount: number;
  albumCount: number;
}

export interface GenreDetail extends GenreSummary {
  albums: AlbumSummary[];
}

/**
 * Rule 5 of the metadata plan: each tag value is also split on `;` and `/`, trimmed, and merged without case. Commas
 * are left alone, since "Rock, Pop" can't be told from a single comma-named genre.
 */
export function splitGenres(values: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    for (const part of value.split(/[;/]/)) {
      const name = part.trim();
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    }
  }
  return [...seen.values()];
}

/** Replaces a track's genres. Genre rows are never deleted; one with no playable track is simply not listed. */
export function setTrackGenres(trackId: number, names: readonly string[]): void {
  db.prepare('DELETE FROM track_genres WHERE track_id = ?').run(trackId);
  const insertGenre = db.prepare('INSERT OR IGNORE INTO genres (name) VALUES (?)');
  const findGenre = db.prepare('SELECT id FROM genres WHERE name = ?');
  const link = db.prepare('INSERT OR IGNORE INTO track_genres (track_id, genre_id) VALUES (?, ?)');
  for (const name of names) {
    insertGenre.run(name);
    link.run(trackId, (findGenre.get(name) as { id: number }).id);
  }
}

const PLAYABLE = 't.missing_since IS NULL AND t.hidden = 0';

const GENRE_SUMMARY_SELECT = `
  SELECT g.id as id, g.name as name,
    COUNT(DISTINCT t.id) as trackCount,
    COUNT(DISTINCT t.album_id) as albumCount
  FROM genres g
  JOIN track_genres tg ON tg.genre_id = g.id
  JOIN tracks t ON t.id = tg.track_id AND ${PLAYABLE}
`;

/** Every genre with a playable track, by name. A few hundred at most (smol: 359), so not paged. */
export function listGenres(): GenreSummary[] {
  return db
    .prepare(`${GENRE_SUMMARY_SELECT} GROUP BY g.id ORDER BY g.name COLLATE NOCASE`)
    .all() as GenreSummary[];
}

/** The genre and every album with a playable track in it. Album track counts are the whole album's. */
export function getGenreDetail(id: number): GenreDetail | undefined {
  const genre = db.prepare(`${GENRE_SUMMARY_SELECT} WHERE g.id = ? GROUP BY g.id`).get(id) as
    | GenreSummary
    | undefined;
  if (!genre) return undefined;

  const albums = db
    .prepare(
      `SELECT al.id as id, al.title as title, al.artist_id as artistId, a.name as artistName, al.year as year,
         (SELECT COUNT(*) FROM tracks at WHERE at.album_id = al.id AND at.missing_since IS NULL) as trackCount
       FROM albums al
       LEFT JOIN artists a ON a.id = al.artist_id
       WHERE al.id IN (
         SELECT t.album_id FROM track_genres tg JOIN tracks t ON t.id = tg.track_id
         WHERE tg.genre_id = ? AND ${PLAYABLE}
       )
       ORDER BY al.title COLLATE NOCASE`,
    )
    .all(id) as AlbumSummary[];

  return { ...genre, albums };
}
