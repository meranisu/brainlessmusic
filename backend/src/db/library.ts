import { db } from './connection.js';

export interface ArtistRow {
  id: number;
  name: string;
  created_at: string;
}

export interface AlbumRow {
  id: number;
  title: string;
  artist_id: number | null;
  year: number | null;
  created_at: string;
}

export interface TrackRow {
  id: number;
  path: string;
  title: string;
  artist_id: number | null;
  album_id: number | null;
  track_number: number | null;
  duration: number | null;
  format: string | null;
  file_size: number;
  date_added: string;
  play_count: number;
  last_played_at: string | null;
}

export interface TrackInput {
  path: string;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  albumYear: number | null;
  trackNumber: number | null;
  duration: number | null;
  format: string | null;
  fileSize: number;
}

function findOrCreateArtist(name: string): ArtistRow {
  const existing = db.prepare('SELECT * FROM artists WHERE name = ?').get(name) as
    | ArtistRow
    | undefined;
  if (existing) return existing;

  const result = db.prepare('INSERT INTO artists (name) VALUES (?)').run(name);
  return db.prepare('SELECT * FROM artists WHERE id = ?').get(result.lastInsertRowid) as ArtistRow;
}

function findOrCreateAlbum(title: string, artistId: number | null, year: number | null): AlbumRow {
  const existing = db
    .prepare('SELECT * FROM albums WHERE title = ? AND artist_id IS ?')
    .get(title, artistId) as AlbumRow | undefined;
  if (existing) return existing;

  const result = db
    .prepare('INSERT INTO albums (title, artist_id, year) VALUES (?, ?, ?)')
    .run(title, artistId, year);
  return db.prepare('SELECT * FROM albums WHERE id = ?').get(result.lastInsertRowid) as AlbumRow;
}

export function findTrackByPath(path: string): TrackRow | undefined {
  return db.prepare('SELECT * FROM tracks WHERE path = ?').get(path) as TrackRow | undefined;
}

export function findTrackById(id: number): TrackRow | undefined {
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRow | undefined;
}

/** Batch lookup by id — single `IN (...)` query, not N+1. May return fewer rows than ids given. */
export function findTracksByIds(ids: number[]): TrackRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM tracks WHERE id IN (${placeholders})`).all(...ids) as TrackRow[];
}

/**
 * Insert or update (by path) a track, creating its artist/album rows as needed.
 */
export function upsertTrack(input: TrackInput): TrackRow {
  const artist = input.artistName ? findOrCreateArtist(input.artistName) : null;
  const album = input.albumTitle
    ? findOrCreateAlbum(input.albumTitle, artist?.id ?? null, input.albumYear)
    : null;

  db.prepare(
    `INSERT INTO tracks (path, title, artist_id, album_id, track_number, duration, format, file_size)
     VALUES (@path, @title, @artistId, @albumId, @trackNumber, @duration, @format, @fileSize)
     ON CONFLICT (path) DO UPDATE SET
       title = excluded.title,
       artist_id = excluded.artist_id,
       album_id = excluded.album_id,
       track_number = excluded.track_number,
       duration = excluded.duration,
       format = excluded.format,
       file_size = excluded.file_size`,
  ).run({
    path: input.path,
    title: input.title,
    artistId: artist?.id ?? null,
    albumId: album?.id ?? null,
    trackNumber: input.trackNumber,
    duration: input.duration,
    format: input.format,
    fileSize: input.fileSize,
  });

  return findTrackByPath(input.path)!;
}
