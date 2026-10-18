import { db } from './connection.js';
import { trackGainSql } from './loudness.js';
import { foldText } from '../utils/foldText.js';
import { evaluateRules, parseStoredRules, smartSeed, summarizeRules, type SmartRules } from './smartPlaylists.js';
import { likePattern } from '../utils/like.js';

export interface PlaylistRow {
  id: number;
  name: string;
  owner_id: number;
  created_at: string;
  /** 1: everyone signed in can see, play and copy it (A162). */
  is_public: number;
  /** When it last went public; null while private. */
  public_at: string | null;
  /** What it is, in the owner's words; null without one. */
  description: string | null;
  /** Smart playlist rules as JSON (A207); null for an ordinary playlist. */
  rules: string | null;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  description: string | null;
  trackCount: number;
  createdAt: string;
  isPublic: boolean;
  /** Filled by rules each time it opens (A207) instead of by hand; always private (A210). */
  isSmart: boolean;
  /** Up to four albums, in playlist order, for the cover mosaic the app shows (A147). */
  coverAlbumIds: number[];
  /** Whether it holds the track asked about; only set when the list was asked for one track. */
  hasTrack?: boolean;
}

/** Someone else's public playlist, for "From others" (A162, A166). */
export interface PublicPlaylistSummary extends PlaylistSummary {
  ownerId: number;
  ownerName: string;
  publicAt: string;
}

/** A playlist found by name: the viewer's own, or someone's public one. */
export interface PlaylistSearchResult {
  id: number;
  name: string;
  trackCount: number;
  ownerId: number;
  ownerName: string;
  isPublic: boolean;
  isSmart: boolean;
  /** The viewer's own, so a client can label the rest "by <owner>" without knowing its own user id. */
  isOwner: boolean;
  coverAlbumIds: number[];
}

export interface PlaylistTrack {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  /** With `trackNumber`, lets a player keep a join inside an album gapless (A72). */
  albumId: number | null;
  trackNumber: number | null;
  duration: number | null;
  gainDb: number | null;
  format: string | null;
  position: number;
  /** When it went into this playlist, for "Recently added". */
  addedAt: string;
}

export interface PlaylistDetail {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  ownerName: string;
  createdAt: string;
  isPublic: boolean;
  isSmart: boolean;
  /** The rules a smart playlist runs; null for an ordinary one. */
  rules: SmartRules | null;
  tracks: PlaylistTrack[];
}

/** Hidden tracks leave someone else's playlist unless an admin asked, as they leave browsing (A34). */
function hiddenClause(includeHidden: boolean): string {
  return includeHidden ? '' : 'AND t.hidden = 0';
}

const OWNER_NAME = 'COALESCE(u.display_name, u.username)';

/** Count and cover for a smart playlist, which holds no rows to count; kept between calls (see `summarizeRules`). */
function smartCountAndCover(stored: string | null, ownerId: number): { trackCount: number; coverAlbumIds: number[] } {
  const rules = parseStoredRules(stored);
  return rules ? summarizeRules(rules, ownerId) : { trackCount: 0, coverAlbumIds: [] };
}

/** Up to four albums, in playlist order, for the cover mosaic. */
function coverAlbumIdsOf(playlistId: number, includeHidden = true): number[] {
  return (
    db
      .prepare(
        `SELECT t.album_id as albumId
         FROM playlist_tracks pt
         JOIN tracks t ON t.id = pt.track_id
         WHERE pt.playlist_id = ? AND t.album_id IS NOT NULL ${hiddenClause(includeHidden)}
         GROUP BY t.album_id
         ORDER BY MIN(pt.position) ASC
         LIMIT 4`,
      )
      .all(playlistId) as { albumId: number }[]
  ).map((r) => r.albumId);
}

export function findPlaylistById(id: number): PlaylistRow | undefined {
  return db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as PlaylistRow | undefined;
}

/** The owner's playlists, newest first. With [trackId], each also says whether it holds that track (`hasTrack`). */
export function listPlaylistsForUser(ownerId: number, trackId?: number): PlaylistSummary[] {
  const playlists = db
    .prepare(
      `SELECT
         p.id as id,
         p.name as name,
         p.description as description,
         p.created_at as createdAt,
         p.is_public as isPublic,
         p.rules as rules,
         COUNT(pt.track_id) as trackCount,
         MAX(pt.track_id = @trackId) as hasTrack
       FROM playlists p
       LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
       WHERE p.owner_id = @ownerId
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
    )
    .all({ ownerId, trackId: trackId ?? null }) as (Omit<
    PlaylistSummary,
    'coverAlbumIds' | 'isPublic' | 'isSmart' | 'hasTrack'
  > & {
    isPublic: number;
    rules: string | null;
    hasTrack: number | null;
  })[];
  return playlists.map(({ hasTrack, rules, ...p }) => {
    const smart = rules === null ? undefined : smartCountAndCover(rules, ownerId);
    return {
      ...p,
      isPublic: p.isPublic === 1,
      isSmart: rules !== null,
      trackCount: smart?.trackCount ?? p.trackCount,
      coverAlbumIds: smart?.coverAlbumIds ?? coverAlbumIdsOf(p.id),
      // A smart playlist can't take a hand-added song, so "Add to playlist" never marks it as holding one.
      ...(trackId === undefined ? {} : { hasTrack: rules === null && hasTrack === 1 }),
    };
  });
}

/** Other people's public playlists, newest public first (A166). Counts and covers skip hidden tracks unless admin. */
export function listPublicPlaylists(viewerId: number, includeHidden = false): PublicPlaylistSummary[] {
  const rows = db
    .prepare(
      `SELECT
         p.id as id,
         p.name as name,
         p.description as description,
         p.created_at as createdAt,
         p.public_at as publicAt,
         p.owner_id as ownerId,
         ${OWNER_NAME} as ownerName,
         COUNT(t.id) as trackCount
       FROM playlists p
       JOIN users u ON u.id = p.owner_id
       LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
       LEFT JOIN tracks t ON t.id = pt.track_id ${hiddenClause(includeHidden)}
       WHERE p.is_public = 1 AND p.owner_id != ?
       GROUP BY p.id
       ORDER BY p.public_at DESC, p.id DESC`,
    )
    .all(viewerId) as Omit<PublicPlaylistSummary, 'coverAlbumIds' | 'isPublic' | 'isSmart'>[];
  return rows.map((p) => ({
    ...p,
    isPublic: true,
    isSmart: false,
    coverAlbumIds: coverAlbumIdsOf(p.id, includeHidden),
  }));
}

/** Playlists whose name contains `query`: the viewer's own and everyone's public ones, own first. */
export function searchPlaylists(query: string, viewerId: number, limit = 20, offset = 0): PlaylistSearchResult[] {
  // `%` and `_` in a name are literal here, not wildcards. Folded, so accents don't matter.
  const pattern = likePattern(foldText(query.trim()));
  const rows = db
    .prepare(
      `SELECT
         p.id as id,
         p.name as name,
         p.owner_id as ownerId,
         ${OWNER_NAME} as ownerName,
         p.is_public as isPublic,
         p.rules as rules,
         (p.owner_id = ?) as isOwner,
         (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) as trackCount
       FROM playlists p
       JOIN users u ON u.id = p.owner_id
       WHERE fold(p.name) LIKE ? ESCAPE '\\' AND (p.owner_id = ? OR p.is_public = 1)
       ORDER BY (p.owner_id = ?) DESC, p.name COLLATE NOCASE, p.id
       LIMIT ? OFFSET ?`,
    )
    .all(viewerId, pattern, viewerId, viewerId, limit, offset) as (Omit<
    PlaylistSearchResult,
    'coverAlbumIds' | 'isPublic' | 'isSmart' | 'isOwner'
  > & {
    isPublic: number;
    rules: string | null;
    isOwner: number;
  })[];
  return rows.map(({ rules, ...p }) => {
    // Only the viewer's own can be smart (A210), so its owner is the viewer.
    const smart = rules === null ? undefined : smartCountAndCover(rules, viewerId);
    return {
      ...p,
      isPublic: p.isPublic === 1,
      isSmart: rules !== null,
      isOwner: p.isOwner === 1,
      trackCount: smart?.trackCount ?? p.trackCount,
      coverAlbumIds: smart?.coverAlbumIds ?? coverAlbumIdsOf(p.id),
    };
  });
}

/** `includeHidden` is false when the viewer is neither the owner nor an admin. */
export function getPlaylistDetail(id: number, includeHidden = true): PlaylistDetail | undefined {
  const playlist = findPlaylistById(id);
  if (!playlist) return undefined;
  const owner = db.prepare(`SELECT ${OWNER_NAME} as name FROM users u WHERE u.id = ?`).get(playlist.owner_id) as
    | { name: string }
    | undefined;

  // A smart playlist runs its rules for its owner; nobody else can open one (A210), so the viewer is the owner.
  const rules = parseStoredRules(playlist.rules);
  const tracks = rules
    ? evaluateRules(rules, playlist.owner_id, smartSeed(playlist.id))
    : (db
        .prepare(
          `SELECT
         t.id as id,
         t.title as title,
         a.name as artist,
         al.title as album,
         t.album_id as albumId,
         t.track_number as trackNumber,
         t.duration as duration,
         ${trackGainSql()} as gainDb,
         t.format as format,
         pt.position as position,
         pt.added_at as addedAt
       FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN albums al ON al.id = t.album_id
       WHERE pt.playlist_id = ? ${hiddenClause(includeHidden)}
       ORDER BY pt.position ASC`,
        )
        .all(id) as PlaylistTrack[]);

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    ownerId: playlist.owner_id,
    ownerName: owner?.name ?? '',
    createdAt: playlist.created_at,
    isPublic: playlist.is_public === 1,
    isSmart: playlist.rules !== null,
    rules,
    tracks,
  };
}

/** With `rules` it is a smart playlist (A207); without, an ordinary one. */
export function createPlaylist(name: string, ownerId: number, rules?: SmartRules): PlaylistRow {
  const result = db
    .prepare('INSERT INTO playlists (name, owner_id, rules) VALUES (?, ?, ?)')
    .run(name, ownerId, rules ? JSON.stringify(rules) : null);
  return findPlaylistById(Number(result.lastInsertRowid))!;
}

/** Replaces a smart playlist's rules. The caller checks it is smart: an ordinary playlist never becomes one. */
export function setPlaylistRules(id: number, rules: SmartRules): void {
  db.prepare('UPDATE playlists SET rules = ? WHERE id = ?').run(JSON.stringify(rules), id);
}

export function renamePlaylist(id: number, name: string): void {
  db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, id);
}

/** Null or an empty string clears it. */
export function setPlaylistDescription(id: number, description: string | null): void {
  db.prepare('UPDATE playlists SET description = ? WHERE id = ?').run(description || null, id);
}

/** Making it public stamps `public_at`, so it rises to the top of "From others"; private clears it. */
export function setPlaylistPublic(id: number, isPublic: boolean): void {
  db.prepare(
    `UPDATE playlists
     SET public_at = CASE WHEN ? = 0 THEN NULL WHEN is_public = 1 THEN public_at ELSE datetime('now') END,
         is_public = ?
     WHERE id = ?`,
  ).run(isPublic ? 1 : 0, isPublic ? 1 : 0, id);
}

/**
 * A private copy for `ownerId`, same tracks in the same order (A162, "Save a copy"). Hidden tracks are left out when
 * the copier couldn't see them.
 */
export function copyPlaylist(sourceId: number, ownerId: number, name: string, includeHidden: boolean): PlaylistRow {
  const copy = db.transaction(() => {
    const created = createPlaylist(name, ownerId);
    db.prepare('UPDATE playlists SET description = (SELECT description FROM playlists WHERE id = ?) WHERE id = ?').run(
      sourceId,
      created.id,
    );
    const smartRules = parseStoredRules(findPlaylistById(sourceId)?.rules ?? null);
    if (smartRules) {
      // "Save as playlist" (A207): freeze what the rules pick right now into an ordinary playlist.
      const insert = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
      evaluateRules(smartRules, ownerId, smartSeed(sourceId)).forEach((track, position) => insert.run(created.id, track.id, position));
    } else {
      db.prepare(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position)
       SELECT ?, pt.track_id, ROW_NUMBER() OVER (ORDER BY pt.position) - 1
       FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? ${hiddenClause(includeHidden)}`,
      ).run(created.id, sourceId);
    }
    return findPlaylistById(created.id)!;
  });
  return copy();
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

/** Appends a track at the end of the playlist. */
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

/** Renumbers positions to `trackIds` order. The caller must check it is exactly the playlist's set. */
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

/** One person's public playlists, newest public first, for their profile (profile page, A168). */
export function listPublicPlaylistsOf(ownerId: number, includeHidden = false): PlaylistSummary[] {
  const rows = db
    .prepare(
      `SELECT
         p.id as id,
         p.name as name,
         p.description as description,
         p.created_at as createdAt,
         COUNT(t.id) as trackCount
       FROM playlists p
       LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
       LEFT JOIN tracks t ON t.id = pt.track_id ${hiddenClause(includeHidden)}
       WHERE p.is_public = 1 AND p.owner_id = ?
       GROUP BY p.id
       ORDER BY p.public_at DESC, p.id DESC`,
    )
    .all(ownerId) as Omit<PlaylistSummary, 'coverAlbumIds' | 'isPublic' | 'isSmart'>[];
  return rows.map((p) => ({
    ...p,
    isPublic: true,
    isSmart: false,
    coverAlbumIds: coverAlbumIdsOf(p.id, includeHidden),
  }));
}
