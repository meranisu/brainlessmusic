import { db } from './connection.js';

export interface ArtistSummary {
  id: number;
  name: string;
  trackCount: number;
  albumCount: number;
}

export interface ArtistDetail extends ArtistSummary {
  albums: AlbumSummary[];
}

export interface AlbumSummary {
  id: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  year: number | null;
  trackCount: number;
}

export interface AlbumTrack {
  id: number;
  title: string;
  trackNumber: number | null;
  duration: number | null;
  format: string | null;
}

export interface AlbumDetail {
  id: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  year: number | null;
  tracks: AlbumTrack[];
}

export interface TrackSummary {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  format: string | null;
}

export interface SearchResults {
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  tracks: TrackSummary[];
}

const ARTIST_SUMMARY_SELECT = `
  SELECT
    a.id as id,
    a.name as name,
    COUNT(DISTINCT t.id) as trackCount,
    COUNT(DISTINCT al.id) as albumCount
  FROM artists a
  LEFT JOIN tracks t ON t.artist_id = a.id
  LEFT JOIN albums al ON al.artist_id = a.id
`;

const ALBUM_SUMMARY_SELECT = `
  SELECT
    al.id as id,
    al.title as title,
    al.artist_id as artistId,
    a.name as artistName,
    al.year as year,
    COUNT(t.id) as trackCount
  FROM albums al
  LEFT JOIN artists a ON a.id = al.artist_id
  LEFT JOIN tracks t ON t.album_id = al.id
`;

const TRACK_SUMMARY_SELECT = `
  SELECT
    t.id as id,
    t.title as title,
    a.name as artist,
    al.title as album,
    t.duration as duration,
    t.format as format
  FROM tracks t
  LEFT JOIN artists a ON a.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
`;

export function countArtists(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM artists').get() as { count: number }).count;
}

export function listArtists(limit: number, offset: number): ArtistSummary[] {
  return db
    .prepare(`${ARTIST_SUMMARY_SELECT} GROUP BY a.id ORDER BY a.name COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(limit, offset) as ArtistSummary[];
}

export function getArtistDetail(id: number): ArtistDetail | undefined {
  const artist = db
    .prepare(`${ARTIST_SUMMARY_SELECT} WHERE a.id = ? GROUP BY a.id`)
    .get(id) as ArtistSummary | undefined;
  if (!artist) return undefined;

  const albums = db
    .prepare(`${ALBUM_SUMMARY_SELECT} WHERE al.artist_id = ? GROUP BY al.id ORDER BY al.title COLLATE NOCASE`)
    .all(id) as AlbumSummary[];

  return { ...artist, albums };
}

export function countAlbums(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM albums').get() as { count: number }).count;
}

export function listAlbums(limit: number, offset: number): AlbumSummary[] {
  return db
    .prepare(`${ALBUM_SUMMARY_SELECT} GROUP BY al.id ORDER BY al.title COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(limit, offset) as AlbumSummary[];
}

export function getAlbumDetail(id: number): AlbumDetail | undefined {
  const album = db
    .prepare(
      `SELECT
         al.id as id,
         al.title as title,
         al.artist_id as artistId,
         a.name as artistName,
         al.year as year
       FROM albums al
       LEFT JOIN artists a ON a.id = al.artist_id
       WHERE al.id = ?`,
    )
    .get(id) as Omit<AlbumDetail, 'tracks'> | undefined;
  if (!album) return undefined;

  const tracks = db
    .prepare(
      `SELECT id, title, track_number as trackNumber, duration, format
       FROM tracks
       WHERE album_id = ?
       ORDER BY track_number IS NULL, track_number ASC`,
    )
    .all(id) as AlbumTrack[];

  return { ...album, tracks };
}

export function countTracks(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM tracks').get() as { count: number }).count;
}

export function listTracks(limit: number, offset: number): TrackSummary[] {
  return db
    .prepare(`${TRACK_SUMMARY_SELECT} ORDER BY t.title COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(limit, offset) as TrackSummary[];
}

export function getTrackSummaryById(id: number): TrackSummary | undefined {
  return db.prepare(`${TRACK_SUMMARY_SELECT} WHERE t.id = ?`).get(id) as TrackSummary | undefined;
}

const SEARCH_RESULT_LIMIT = 20;

/**
 * Simple LIKE-based search across artist/album/track names. FTS5 is the
 * planned upgrade once the library is large enough to need it (see
 * .docs/reference/tech-stack.md) — not needed at this scale yet.
 */
export function searchLibrary(query: string): SearchResults {
  const pattern = `%${query}%`;

  const artists = db
    .prepare(
      `${ARTIST_SUMMARY_SELECT} WHERE a.name LIKE ? GROUP BY a.id ORDER BY a.name COLLATE NOCASE LIMIT ?`,
    )
    .all(pattern, SEARCH_RESULT_LIMIT) as ArtistSummary[];

  const albums = db
    .prepare(
      `${ALBUM_SUMMARY_SELECT} WHERE al.title LIKE ? GROUP BY al.id ORDER BY al.title COLLATE NOCASE LIMIT ?`,
    )
    .all(pattern, SEARCH_RESULT_LIMIT) as AlbumSummary[];

  const tracks = db
    .prepare(`${TRACK_SUMMARY_SELECT} WHERE t.title LIKE ? ORDER BY t.title COLLATE NOCASE LIMIT ?`)
    .all(pattern, SEARCH_RESULT_LIMIT) as TrackSummary[];

  return { artists, albums, tracks };
}
