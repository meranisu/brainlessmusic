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
  hidden: number;
  not_recommended: number;
  bitrate: number | null;
  sample_rate: number | null;
  last_stream_error: string | null;
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
  bitrate?: number | null;
  sampleRate?: number | null;
}

export interface TrackFieldUpdate {
  title?: string;
  artistName?: string | null;
  albumTitle?: string | null;
  trackNumber?: number | null;
  hidden?: boolean;
  notRecommended?: boolean;
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
    `INSERT INTO tracks (path, title, artist_id, album_id, track_number, duration, format, file_size, bitrate, sample_rate)
     VALUES (@path, @title, @artistId, @albumId, @trackNumber, @duration, @format, @fileSize, @bitrate, @sampleRate)
     ON CONFLICT (path) DO UPDATE SET
       title = excluded.title,
       artist_id = excluded.artist_id,
       album_id = excluded.album_id,
       track_number = excluded.track_number,
       duration = excluded.duration,
       format = excluded.format,
       file_size = excluded.file_size,
       bitrate = excluded.bitrate,
       sample_rate = excluded.sample_rate`,
  ).run({
    path: input.path,
    title: input.title,
    artistId: artist?.id ?? null,
    albumId: album?.id ?? null,
    trackNumber: input.trackNumber,
    duration: input.duration,
    format: input.format,
    fileSize: input.fileSize,
    bitrate: input.bitrate ?? null,
    sampleRate: input.sampleRate ?? null,
  });

  return findTrackByPath(input.path)!;
}

/**
 * Applies a partial tag/visibility edit. Title/artist/album go through the
 * same find-or-create resolution as upsertTrack so renaming an artist here
 * behaves consistently with a re-scan.
 */
export function updateTrackFields(id: number, update: TrackFieldUpdate): TrackRow | undefined {
  const existing = findTrackById(id);
  if (!existing) return undefined;

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  if (update.title !== undefined) {
    sets.push('title = @title');
    params.title = update.title;
  }
  if (update.artistName !== undefined) {
    const artist = update.artistName ? findOrCreateArtist(update.artistName) : null;
    sets.push('artist_id = @artistId');
    params.artistId = artist?.id ?? null;
  }
  if (update.albumTitle !== undefined) {
    const artistId = update.artistName !== undefined
      ? (update.artistName ? findOrCreateArtist(update.artistName).id : null)
      : existing.artist_id;
    const album = update.albumTitle ? findOrCreateAlbum(update.albumTitle, artistId, null) : null;
    sets.push('album_id = @albumId');
    params.albumId = album?.id ?? null;
  }
  if (update.trackNumber !== undefined) {
    sets.push('track_number = @trackNumber');
    params.trackNumber = update.trackNumber;
  }
  if (update.hidden !== undefined) {
    sets.push('hidden = @hidden');
    params.hidden = update.hidden ? 1 : 0;
  }
  if (update.notRecommended !== undefined) {
    sets.push('not_recommended = @notRecommended');
    params.notRecommended = update.notRecommended ? 1 : 0;
  }

  if (sets.length === 0) return existing;

  db.prepare(`UPDATE tracks SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return findTrackById(id);
}

export function setLastStreamError(id: number, message: string | null): void {
  db.prepare('UPDATE tracks SET last_stream_error = ? WHERE id = ?').run(message, id);
}

/**
 * Hard-deletes a track row and every row referencing it (favorites,
 * playlist entries, play history). better-sqlite3 enforces FK constraints
 * by default (`PRAGMA foreign_keys = ON` per connection) and none of these
 * FKs cascade, so dependents must be deleted first in this order or the
 * final `DELETE FROM tracks` throws a constraint error rather than orphaning
 * anything. Does NOT touch the file on disk — callers unlink it separately,
 * since that's an fs concern, not a DB one.
 */
export function deleteTrackRow(id: number): void {
  const cleanup = db.transaction((trackId: number) => {
    db.prepare('DELETE FROM favorites WHERE track_id = ?').run(trackId);
    db.prepare('DELETE FROM playlist_tracks WHERE track_id = ?').run(trackId);
    db.prepare('DELETE FROM play_history WHERE track_id = ?').run(trackId);
    db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
  });
  cleanup(id);
}
