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
  hidden: boolean;
  notRecommended: boolean;
}

export interface TrackDetail extends TrackSummary {
  trackNumber: number | null;
  fileSize: number;
  bitrate: number | null;
  sampleRate: number | null;
  playCount: number;
  dateAdded: string;
  lastPlayedAt: string | null;
  lastStreamError: string | null;
}

export type VisibilityFilter = 'all' | 'only' | 'exclude';
export type SortField = 'title' | 'artist' | 'album' | 'duration' | 'dateAdded' | 'playCount';
export type SortOrder = 'asc' | 'desc';

export interface ListTracksOptions {
  search?: string;
  sort?: SortField;
  order?: SortOrder;
  hidden?: VisibilityFilter;
  notRecommended?: VisibilityFilter;
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
    t.format as format,
    t.hidden as hidden,
    t.not_recommended as notRecommended
  FROM tracks t
  LEFT JOIN artists a ON a.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
`;

interface RawTrackSummary extends Omit<TrackSummary, 'hidden' | 'notRecommended'> {
  hidden: number;
  notRecommended: number;
}

function toTrackSummary(row: RawTrackSummary): TrackSummary {
  return { ...row, hidden: Boolean(row.hidden), notRecommended: Boolean(row.notRecommended) };
}

const SORT_COLUMNS: Record<SortField, string> = {
  title: 't.title COLLATE NOCASE',
  artist: 'a.name COLLATE NOCASE',
  album: 'al.title COLLATE NOCASE',
  duration: 't.duration',
  dateAdded: 't.date_added',
  playCount: 't.play_count',
};

function visibilityClause(column: string, filter: VisibilityFilter | undefined): string | null {
  if (filter === 'only') return `${column} = 1`;
  if (filter === 'exclude') return `${column} = 0`;
  return null; // 'all' or unset — no filter
}

/**
 * Shared WHERE-clause + params builder for listTracks/countTracks, so the
 * two stay in sync — pagination without a matching filtered count is a
 * classic source of an inconsistent total.
 */
function buildTrackFilter(options: ListTracksOptions): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.search?.trim()) {
    clauses.push('(t.title LIKE ? OR a.name LIKE ? OR al.title LIKE ?)');
    const pattern = `%${options.search.trim()}%`;
    params.push(pattern, pattern, pattern);
  }

  const hiddenClause = visibilityClause('t.hidden', options.hidden ?? 'exclude');
  if (hiddenClause) clauses.push(hiddenClause);

  const notRecommendedClause = visibilityClause('t.not_recommended', options.notRecommended ?? 'all');
  if (notRecommendedClause) clauses.push(notRecommendedClause);

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

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

export function countTracks(options: ListTracksOptions = {}): number {
  const { where, params } = buildTrackFilter(options);
  return (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM tracks t
         LEFT JOIN artists a ON a.id = t.artist_id
         LEFT JOIN albums al ON al.id = t.album_id
         ${where}`,
      )
      .get(...params) as { count: number }
  ).count;
}

export function listTracks(limit: number, offset: number, options: ListTracksOptions = {}): TrackSummary[] {
  const { where, params } = buildTrackFilter(options);
  const sortColumn = SORT_COLUMNS[options.sort ?? 'title'];
  const direction = options.order === 'desc' ? 'DESC' : 'ASC';

  const rows = db
    .prepare(`${TRACK_SUMMARY_SELECT} ${where} ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as RawTrackSummary[];

  return rows.map(toTrackSummary);
}

export function getTrackSummaryById(id: number): TrackSummary | undefined {
  const row = db.prepare(`${TRACK_SUMMARY_SELECT} WHERE t.id = ?`).get(id) as
    | RawTrackSummary
    | undefined;
  return row ? toTrackSummary(row) : undefined;
}

/** Batch lookup by id — single `IN (...)` query, not N+1. Order is not guaranteed to match `ids`. */
export function getTrackSummariesByIds(ids: number[]): TrackSummary[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`${TRACK_SUMMARY_SELECT} WHERE t.id IN (${placeholders})`)
    .all(...ids) as RawTrackSummary[];
  return rows.map(toTrackSummary);
}

interface RawTrackDetail extends Omit<TrackDetail, 'hidden' | 'notRecommended'> {
  hidden: number;
  notRecommended: number;
}

export function getTrackDetailById(id: number): TrackDetail | undefined {
  const row = db
    .prepare(
      `SELECT
         t.id as id,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.duration as duration,
         t.format as format,
         t.hidden as hidden,
         t.not_recommended as notRecommended,
         t.track_number as trackNumber,
         t.file_size as fileSize,
         t.bitrate as bitrate,
         t.sample_rate as sampleRate,
         t.play_count as playCount,
         t.date_added as dateAdded,
         t.last_played_at as lastPlayedAt,
         t.last_stream_error as lastStreamError
       FROM tracks t
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE t.id = ?`,
    )
    .get(id) as RawTrackDetail | undefined;

  if (!row) return undefined;
  return { ...row, hidden: Boolean(row.hidden), notRecommended: Boolean(row.notRecommended) };
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

  const tracks = (
    db
      .prepare(`${TRACK_SUMMARY_SELECT} WHERE t.title LIKE ? ORDER BY t.title COLLATE NOCASE LIMIT ?`)
      .all(pattern, SEARCH_RESULT_LIMIT) as RawTrackSummary[]
  ).map(toTrackSummary);

  return { artists, albums, tracks };
}
