import { db } from './connection.js';

export interface PlaylistRow {
  id: number;
  name: string;
  owner_id: number;
  created_at: string;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  trackCount: number;
  createdAt: string;
}

export interface PlaylistTrack {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  format: string | null;
  position: number;
}

export interface PlaylistDetail {
  id: number;
  name: string;
  ownerId: number;
  createdAt: string;
  tracks: PlaylistTrack[];
}

export function findPlaylistById(id: number): PlaylistRow | undefined {
  return db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as PlaylistRow | undefined;
}

export function listPlaylistsForUser(ownerId: number): PlaylistSummary[] {
  return db
    .prepare(
      `SELECT
         p.id as id,
         p.name as name,
         p.created_at as createdAt,
         COUNT(pt.track_id) as trackCount
       FROM playlists p
       LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
       WHERE p.owner_id = ?
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
    )
    .all(ownerId) as PlaylistSummary[];
}

export function getPlaylistDetail(id: number): PlaylistDetail | undefined {
  const playlist = findPlaylistById(id);
  if (!playlist) return undefined;

  const tracks = db
    .prepare(
      `SELECT
         t.id as id,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.duration as duration,
         t.format as format,
         pt.position as position
       FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE pt.playlist_id = ?
       ORDER BY pt.position ASC`,
    )
    .all(id) as PlaylistTrack[];

  return {
    id: playlist.id,
    name: playlist.name,
    ownerId: playlist.owner_id,
    createdAt: playlist.created_at,
    tracks,
  };
}

export function createPlaylist(name: string, ownerId: number): PlaylistRow {
  const result = db
    .prepare('INSERT INTO playlists (name, owner_id) VALUES (?, ?)')
    .run(name, ownerId);
  return findPlaylistById(Number(result.lastInsertRowid))!;
}

export function renamePlaylist(id: number, name: string): void {
  db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, id);
}

export function deletePlaylist(id: number): void {
  const deleteAll = db.transaction(() => {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id);
    db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
  });
  deleteAll();
}

export function isTrackInPlaylist(playlistId: number, trackId: number): boolean {
  return (
    db
      .prepare('SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
      .get(playlistId, trackId) !== undefined
  );
}

/**
 * Appends a track at the end of the playlist (highest existing position + 1).
 */
export function addTrackToPlaylist(playlistId: number, trackId: number): number {
  const { maxPosition } = db
    .prepare('SELECT MAX(position) as maxPosition FROM playlist_tracks WHERE playlist_id = ?')
    .get(playlistId) as { maxPosition: number | null };

  const position = maxPosition === null ? 0 : maxPosition + 1;

  db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
  ).run(playlistId, trackId, position);

  return position;
}

export function removeTrackFromPlaylist(playlistId: number, trackId: number): boolean {
  const result = db
    .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
    .run(playlistId, trackId);
  return result.changes > 0;
}

export function getPlaylistTrackIdsInOrder(playlistId: number): number[] {
  return (
    db
      .prepare(
        'SELECT track_id as trackId FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC',
      )
      .all(playlistId) as { trackId: number }[]
  ).map((row) => row.trackId);
}

/**
 * Reassigns positions 0..N-1 to match the given track id order. Caller must
 * ensure `trackIds` is exactly the playlist's current track set (same
 * elements, no duplicates) before calling this.
 */
export function reorderPlaylistTracks(playlistId: number, trackIds: number[]): void {
  const reorder = db.transaction(() => {
    trackIds.forEach((trackId, index) => {
      db.prepare(
        'UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?',
      ).run(index, playlistId, trackId);
    });
  });
  reorder();
}
