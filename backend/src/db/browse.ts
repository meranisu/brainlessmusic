import { db } from './connection.js';
import { buildMatchQuery } from '../utils/ftsQuery.js';

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
  /** The file is gone from disk. Nothing can play it until it comes back. */
  missing: boolean;
  playCount: number;
  dateAdded: string;
}

export interface TrackDetail extends TrackSummary {
  trackNumber: number | null;
  fileSize: number;
  bitrate: number | null;
  sampleRate: number | null;
  lastPlayedAt: string | null;
  lastStreamError: string | null;
  /** When the file was first observed absent, or `null` while it is present. */
  missingSince: string | null;
}

export type VisibilityFilter = 'all' | 'only' | 'exclude';
export type SortField = 'title' | 'artist' | 'album' | 'duration' | 'dateAdded' | 'playCount';
export type SortOrder = 'asc' | 'desc';

export interface ListTracksOptions {
  search?: string;
  sort?: SortField;
  order?: SortOrder;
  hidden?: VisibilityFilter;
  /**
   * Tracks whose file is gone. Excluded by default — a row nobody can play is
   * noise in a library listing, and clicking it is a `500`. `only` is how an
   * admin finds them in the same UI as everything else.
   */
  missing?: VisibilityFilter;
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
  LEFT JOIN tracks t ON t.artist_id = a.id AND t.missing_since IS NULL
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
  LEFT JOIN tracks t ON t.album_id = al.id AND t.missing_since IS NULL
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
    t.not_recommended as notRecommended,
    (t.missing_since IS NOT NULL) as missing,
    t.play_count as playCount,
    t.date_added as dateAdded
  FROM tracks t
  LEFT JOIN artists a ON a.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
`;

interface RawTrackSummary extends Omit<TrackSummary, 'hidden' | 'notRecommended' | 'missing'> {
  hidden: number;
  notRecommended: number;
  missing: number;
}

function toTrackSummary(row: RawTrackSummary): TrackSummary {
  return {
    ...row,
    hidden: Boolean(row.hidden),
    notRecommended: Boolean(row.notRecommended),
    missing: Boolean(row.missing),
  };
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
 * `missing_since` records a date rather than a flag, so it needs its own
 * clause builder — "present" is `IS NULL`, not `= 0`.
 */
function nullabilityClause(column: string, filter: VisibilityFilter | undefined): string | null {
  if (filter === 'only') return `${column} IS NOT NULL`;
  if (filter === 'exclude') return `${column} IS NULL`;
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
    const match = buildMatchQuery(options.search);
    if (match) {
      // Used as a filter only, never as an ordering: the caller has already
      // chosen a sort, and quietly replacing it with relevance would be wrong.
      clauses.push('t.id IN (SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?)');
      params.push(match);
    } else {
      // Below the trigram floor — no index can answer a 1-2 character
      // substring, so scan. Bounded by library size and rare in practice.
      clauses.push('(t.title LIKE ? OR a.name LIKE ? OR al.title LIKE ?)');
      const pattern = `%${options.search.trim()}%`;
      params.push(pattern, pattern, pattern);
    }
  }

  const hiddenClause = visibilityClause('t.hidden', options.hidden ?? 'exclude');
  if (hiddenClause) clauses.push(hiddenClause);

  const notRecommendedClause = visibilityClause('t.not_recommended', options.notRecommended ?? 'all');
  if (notRecommendedClause) clauses.push(notRecommendedClause);

  const missingClause = nullabilityClause('t.missing_since', options.missing ?? 'exclude');
  if (missingClause) clauses.push(missingClause);

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

/**
 * Artists and albums are only worth listing while something under them can
 * actually be played. When a library root goes away its artists and albums
 * would otherwise sit in the grid forever, opening onto nothing.
 *
 * The count and the list have to agree, or pagination reports a total it can
 * never reach — the same trap `buildTrackFilter` exists to avoid.
 */
const HAS_PLAYABLE_TRACKS = 'HAVING COUNT(DISTINCT t.id) > 0';

export function countArtists(): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM artists a
         WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.artist_id = a.id AND t.missing_since IS NULL)`,
      )
      .get() as { count: number }
  ).count;
}

export function listArtists(limit: number, offset: number): ArtistSummary[] {
  return db
    .prepare(
      `${ARTIST_SUMMARY_SELECT} GROUP BY a.id ${HAS_PLAYABLE_TRACKS}
       ORDER BY a.name COLLATE NOCASE LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as ArtistSummary[];
}

export function getArtistDetail(id: number): ArtistDetail | undefined {
  const artist = db
    .prepare(`${ARTIST_SUMMARY_SELECT} WHERE a.id = ? GROUP BY a.id`)
    .get(id) as ArtistSummary | undefined;
  if (!artist) return undefined;

  const albums = db
    .prepare(
      `${ALBUM_SUMMARY_SELECT} WHERE al.artist_id = ? GROUP BY al.id ${HAS_PLAYABLE_TRACKS}
       ORDER BY al.title COLLATE NOCASE`,
    )
    .all(id) as AlbumSummary[];

  return { ...artist, albums };
}

export function countAlbums(): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM albums al
         WHERE EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = al.id AND t.missing_since IS NULL)`,
      )
      .get() as { count: number }
  ).count;
}

export function listAlbums(limit: number, offset: number): AlbumSummary[] {
  return db
    .prepare(
      `${ALBUM_SUMMARY_SELECT} GROUP BY al.id ${HAS_PLAYABLE_TRACKS}
       ORDER BY al.title COLLATE NOCASE LIMIT ? OFFSET ?`,
    )
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
       WHERE album_id = ? AND missing_since IS NULL
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

interface RawTrackDetail extends Omit<TrackDetail, 'hidden' | 'notRecommended' | 'missing'> {
  hidden: number;
  notRecommended: number;
  missing: number;
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
         (t.missing_since IS NOT NULL) as missing,
         t.missing_since as missingSince,
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
  return {
    ...row,
    hidden: Boolean(row.hidden),
    notRecommended: Boolean(row.notRecommended),
    missing: Boolean(row.missing),
  };
}

const SEARCH_RESULT_LIMIT = 20;

/**
 * Column weights for track relevance: a hit in the title outranks one in the
 * artist, which outranks one in the album. Without this, searching an album
 * name buries the track actually called that under its twelve siblings.
 */
const TRACK_BM25_WEIGHTS = '10.0, 5.0, 3.0';

/**
 * Search across artists, albums and tracks, backed by the FTS5 trigram index
 * (migration 0008).
 *
 * Queries the index cannot answer — anything with a term under three
 * characters — fall back to the LIKE scan this replaced. That path is not
 * vestigial: a two-character CJK query is an ordinary thing to type, and
 * returning nothing for it would be a regression, not a limitation.
 */
export function searchLibrary(query: string): SearchResults {
  const match = buildMatchQuery(query);
  return match === null ? searchWithLike(query) : searchWithFts(match);
}

function searchWithFts(match: string): SearchResults {
  const artists = db
    .prepare(
      `${ARTIST_SUMMARY_SELECT}
       WHERE a.id IN (SELECT rowid FROM artists_fts WHERE artists_fts MATCH ?)
       GROUP BY a.id ${HAS_PLAYABLE_TRACKS} ORDER BY a.name COLLATE NOCASE LIMIT ?`,
    )
    .all(match, SEARCH_RESULT_LIMIT) as ArtistSummary[];

  const albums = db
    .prepare(
      `${ALBUM_SUMMARY_SELECT}
       WHERE al.id IN (SELECT rowid FROM albums_fts WHERE albums_fts MATCH ?)
       GROUP BY al.id ${HAS_PLAYABLE_TRACKS} ORDER BY al.title COLLATE NOCASE LIMIT ?`,
    )
    .all(match, SEARCH_RESULT_LIMIT) as AlbumSummary[];

  // Tracks join the index directly rather than using an `IN (...)` subquery,
  // because ranking needs bm25() over the matched rows.
  const tracks = (
    db
      .prepare(
        `${TRACK_SUMMARY_SELECT}
         JOIN tracks_fts ON tracks_fts.rowid = t.id
         WHERE tracks_fts MATCH ? AND t.missing_since IS NULL
         ORDER BY bm25(tracks_fts, ${TRACK_BM25_WEIGHTS})
         LIMIT ?`,
      )
      .all(match, SEARCH_RESULT_LIMIT) as RawTrackSummary[]
  ).map(toTrackSummary);

  return { artists, albums, tracks };
}

/** The pre-FTS path, still reached by queries shorter than a trigram. */
function searchWithLike(query: string): SearchResults {
  const pattern = `%${query.trim()}%`;

  const artists = db
    .prepare(
      `${ARTIST_SUMMARY_SELECT} WHERE a.name LIKE ? GROUP BY a.id ${HAS_PLAYABLE_TRACKS}
       ORDER BY a.name COLLATE NOCASE LIMIT ?`,
    )
    .all(pattern, SEARCH_RESULT_LIMIT) as ArtistSummary[];

  const albums = db
    .prepare(
      `${ALBUM_SUMMARY_SELECT} WHERE al.title LIKE ? GROUP BY al.id ${HAS_PLAYABLE_TRACKS}
       ORDER BY al.title COLLATE NOCASE LIMIT ?`,
    )
    .all(pattern, SEARCH_RESULT_LIMIT) as AlbumSummary[];

  // Matches title, artist and album, the same three fields the FTS index
  // covers. Before FTS this path searched titles alone; leaving it that way
  // would mean a two-character query quietly searched fewer fields than a
  // three-character one, which is not something a user could predict.
  const tracks = (
    db
      .prepare(
        `${TRACK_SUMMARY_SELECT}
         WHERE (t.title LIKE ? OR a.name LIKE ? OR al.title LIKE ?)
           AND t.missing_since IS NULL
         ORDER BY t.title COLLATE NOCASE LIMIT ?`,
      )
      .all(pattern, pattern, pattern, SEARCH_RESULT_LIMIT) as RawTrackSummary[]
  ).map(toTrackSummary);

  return { artists, albums, tracks };
}
