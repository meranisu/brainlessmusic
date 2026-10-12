import { basename, dirname } from 'node:path';
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
  /** Null on rows from before 0030. */
  folder: string | null;
  artist_from_tracks: number;
  merged_into_id: number | null;
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
  missing_since: string | null;
  root_id: number | null;
  /** Set by an admin's tag edit; a scan then leaves title, artist, album and track number alone (C9). See `0025`. */
  tags_edited_at: string | null;
  /** Integrated loudness in LUFS, measured in the background; null until then. See `0028`. */
  loudness_lufs: number | null;
  /** True peak in dBTP; null until measured, or for a silent file. */
  loudness_peak: number | null;
}

export interface TrackInput {
  path: string;
  title: string;
  artistName: string | null;
  /** The albumartist tag. Null: the album's artist is worked out from its tracks by `settleAlbums` (A148). */
  albumArtistName?: string | null;
  compilation?: boolean;
  albumTitle: string | null;
  albumYear: number | null;
  trackNumber: number | null;
  duration: number | null;
  format: string | null;
  fileSize: number;
  bitrate?: number | null;
  sampleRate?: number | null;
  /** Which `library_roots` row this file was found under. */
  rootId: number;
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

export const VARIOUS_ARTISTS = 'Various Artists';

/** `CD1`, `Disc 2`, `disk_03`, `Disc 1 - Bonus`: one album split across folders, keyed by the folder above. */
const DISC_FOLDER = /^(cd|disc|disk)[\s._-]*\d{1,2}\b/i;

/** The folder an album is keyed by (rule 1b): the file's folder, or its parent when that is a disc folder. */
export function albumFolder(trackPath: string): string {
  const dir = dirname(trackPath);
  return DISC_FOLDER.test(basename(dir)) ? dirname(dir) : dir;
}

/**
 * Finds the album for (title, folder, album artist), or creates it. `artistId` null means no file named an album
 * artist: the row is keyed without one and `settleAlbums` fills it in from the tracks (A148).
 *
 * A row from before 0030 (no folder) that one of its own tracks is moving out of is adopted instead of creating a new
 * row, so an album that didn't split or merge keeps its id, and one that merged keeps one of its old ids. Not when an
 * admin-edited track is in it: that track stays put, so its album must too.
 */
function findOrCreateAlbum(
  title: string,
  folder: string,
  artistId: number | null,
  year: number | null,
  adoptFrom: number | null = null,
): AlbumRow {
  const fromTracks = artistId === null ? 1 : 0;
  const existing = (
    fromTracks
      ? db
          .prepare('SELECT * FROM albums WHERE title = ? AND folder = ? AND artist_from_tracks = 1')
          .get(title, folder)
      : db
          .prepare('SELECT * FROM albums WHERE title = ? AND folder = ? AND artist_id = ? AND artist_from_tracks = 0')
          .get(title, folder, artistId)
  ) as AlbumRow | undefined;
  if (existing) return existing;

  if (adoptFrom !== null) {
    const adopted = db
      .prepare(
        `UPDATE albums SET folder = @folder, artist_id = COALESCE(@artistId, artist_id),
           artist_from_tracks = @fromTracks, merged_into_id = NULL
         WHERE id = @id AND folder IS NULL AND title = @title
           AND NOT EXISTS (SELECT 1 FROM tracks WHERE album_id = @id AND tags_edited_at IS NOT NULL)`,
      )
      .run({ id: adoptFrom, folder, artistId, fromTracks, title });
    if (adopted.changes > 0) {
      return db.prepare('SELECT * FROM albums WHERE id = ?').get(adoptFrom) as AlbumRow;
    }
  }

  const result = db
    .prepare('INSERT INTO albums (title, artist_id, year, folder, artist_from_tracks) VALUES (?, ?, ?, ?, ?)')
    .run(title, artistId, year, folder, fromTracks);
  return db.prepare('SELECT * FROM albums WHERE id = ?').get(result.lastInsertRowid) as AlbumRow;
}

/** Rule 1-2: Various Artists for a compilation, else the albumartist tag, else null (worked out later). */
function albumArtistId(input: Pick<TrackInput, 'albumArtistName' | 'compilation'>): number | null {
  if (input.compilation) return findOrCreateArtist(VARIOUS_ARTISTS).id;
  return input.albumArtistName ? findOrCreateArtist(input.albumArtistName).id : null;
}

export function findTrackByPath(path: string): TrackRow | undefined {
  return db.prepare('SELECT * FROM tracks WHERE path = ?').get(path) as TrackRow | undefined;
}

export function findTrackById(id: number): TrackRow | undefined {
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRow | undefined;
}

/** One `IN (...)` query. May return fewer rows than ids. */
export function findTracksByIds(ids: number[]): TrackRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM tracks WHERE id IN (${placeholders})`).all(...ids) as TrackRow[];
}

/**
 * Inserts or updates a track by path, creating its artist and album as needed. A track an admin has edited
 * (`tags_edited_at`) keeps its title, artist, album and track number: the edit isn't in the file, so the file's tags
 * would undo it (C9). Everything read from the audio itself is still refreshed.
 */
export function upsertTrack(input: TrackInput): TrackRow {
  const current = findTrackByPath(input.path);
  // An edited track keeps its artist and album below, so don't create rows it won't use.
  const keepsTags = current?.tags_edited_at != null;
  const artist = input.artistName && !keepsTags ? findOrCreateArtist(input.artistName) : null;
  const album = input.albumTitle && !keepsTags
    ? findOrCreateAlbum(
        input.albumTitle,
        albumFolder(input.path),
        albumArtistId(input),
        input.albumYear,
        current?.album_id ?? null,
      )
    : null;

  db.prepare(
    `INSERT INTO tracks (path, title, artist_id, album_id, track_number, duration, format, file_size, bitrate, sample_rate, root_id)
     VALUES (@path, @title, @artistId, @albumId, @trackNumber, @duration, @format, @fileSize, @bitrate, @sampleRate, @rootId)
     ON CONFLICT (path) DO UPDATE SET
       title = CASE WHEN tracks.tags_edited_at IS NULL THEN excluded.title ELSE tracks.title END,
       artist_id = CASE WHEN tracks.tags_edited_at IS NULL THEN excluded.artist_id ELSE tracks.artist_id END,
       album_id = CASE WHEN tracks.tags_edited_at IS NULL THEN excluded.album_id ELSE tracks.album_id END,
       track_number = CASE WHEN tracks.tags_edited_at IS NULL THEN excluded.track_number ELSE tracks.track_number END,
       duration = excluded.duration,
       format = excluded.format,
       file_size = excluded.file_size,
       -- A different file at the same path is measured again; same size is taken as the same audio.
       loudness_lufs = CASE WHEN tracks.file_size = excluded.file_size THEN tracks.loudness_lufs ELSE NULL END,
       loudness_peak = CASE WHEN tracks.file_size = excluded.file_size THEN tracks.loudness_peak ELSE NULL END,
       bitrate = excluded.bitrate,
       sample_rate = excluded.sample_rate,
       root_id = excluded.root_id`,
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
    rootId: input.rootId,
  });

  return findTrackByPath(input.path)!;
}

/** Partial tag or visibility edit. Names resolve through the same find-or-create as a scan. */
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
    // Edited albums go by the edited track artist: the edit form has no album artist field.
    const album = update.albumTitle
      ? findOrCreateAlbum(update.albumTitle, albumFolder(existing.path), artistId, null)
      : null;
    sets.push('album_id = @albumId');
    params.albumId = album?.id ?? null;
  }
  if (update.trackNumber !== undefined) {
    sets.push('track_number = @trackNumber');
    params.trackNumber = update.trackNumber;
  }
  if (sets.length > 0) {
    // Only tag fields so far: visibility flags below aren't something a scan would undo.
    sets.push("tags_edited_at = datetime('now')");
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
  const updated = findTrackById(id);
  if (updated && existing.album_id !== null && updated.album_id !== existing.album_id) {
    settleAlbums(new Map([[id, existing.album_id]]), updated.album_id === null ? [] : [updated.album_id]);
  }
  return updated;
}

/** Each track's album before a scan, so `settleAlbums` can tell where an emptied album's tracks went. */
export function albumIdsByTrack(rootId: number): Map<number, number> {
  const rows = db
    .prepare('SELECT id, album_id FROM tracks WHERE root_id = ? AND album_id IS NOT NULL')
    .all(rootId) as { id: number; album_id: number }[];
  return new Map(rows.map((r) => [r.id, r.album_id]));
}

export interface SettleSummary {
  /** Albums whose artist was worked out from their tracks and changed. */
  artistsSet: number;
  /** Albums emptied by this pass that now point at where their tracks went. */
  merged: number;
}

/** Longest redirect chain followed or collapsed; a scan only ever adds one hop, so this is generous. */
const MAX_MERGE_HOPS = 20;

/**
 * After a scan or an upload. (1) An album no file named an artist for gets the artist on more than half its tracks,
 * otherwise Various Artists (A148); if a tagged album with that key already exists, its tracks join it. (2) An album
 * that `before` had tracks in and that is now empty points at the album most of them moved to, and passes on its
 * cover if that album has none (rule 7). `onlyAlbumIds` limits step 1 to those albums.
 */
export function settleAlbums(before: Map<number, number>, onlyAlbumIds?: number[]): SettleSummary {
  return db.transaction((): SettleSummary => {
    let artistsSet = 0;
    let merged = 0;

    const fromTracks = (
      onlyAlbumIds
        ? onlyAlbumIds.length === 0
          ? []
          : db
              .prepare(
                `SELECT * FROM albums WHERE artist_from_tracks = 1
                 AND id IN (${onlyAlbumIds.map(() => '?').join(',')})`,
              )
              .all(...onlyAlbumIds)
        : db.prepare('SELECT * FROM albums WHERE artist_from_tracks = 1').all()
    ) as AlbumRow[];

    const countByArtist = db.prepare(
      'SELECT artist_id, COUNT(*) as n FROM tracks WHERE album_id = ? GROUP BY artist_id ORDER BY n DESC',
    );
    const findTagged = db.prepare(
      'SELECT id FROM albums WHERE title = ? AND folder = ? AND artist_id = ? AND artist_from_tracks = 0',
    );
    let variousId: number | null = null;

    for (const album of fromTracks) {
      const counts = countByArtist.all(album.id) as { artist_id: number | null; n: number }[];
      if (counts.length === 0) continue;
      const total = counts.reduce((sum, c) => sum + c.n, 0);
      const top = counts[0];
      const chosen =
        top.artist_id !== null && top.n * 2 > total
          ? top.artist_id
          : (variousId ??= findOrCreateArtist(VARIOUS_ARTISTS).id);

      const tagged = findTagged.get(album.title, album.folder, chosen) as { id: number } | undefined;
      if (tagged) {
        db.prepare('UPDATE tracks SET album_id = ? WHERE album_id = ?').run(tagged.id, album.id);
        mergeInto(album.id, tagged.id);
        merged++;
      } else if (album.artist_id !== chosen) {
        db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(chosen, album.id);
        artistsSet++;
      }
    }

    if (before.size > 0) {
      const now = new Map(
        (db.prepare('SELECT id, album_id FROM tracks').all() as { id: number; album_id: number | null }[]).map(
          (r) => [r.id, r.album_id],
        ),
      );
      const movedTo = new Map<number, Map<number, number>>();
      for (const [trackId, oldAlbum] of before) {
        const newAlbum = now.get(trackId);
        if (newAlbum == null || newAlbum === oldAlbum) continue;
        const targets = movedTo.get(oldAlbum) ?? new Map<number, number>();
        targets.set(newAlbum, (targets.get(newAlbum) ?? 0) + 1);
        movedTo.set(oldAlbum, targets);
      }
      const isEmpty = db.prepare('SELECT NOT EXISTS (SELECT 1 FROM tracks WHERE album_id = ?) as empty');
      for (const [oldAlbum, targets] of movedTo) {
        if (!(isEmpty.get(oldAlbum) as { empty: number }).empty) continue;
        const [target] = [...targets.entries()].sort((a, b) => b[1] - a[1])[0];
        mergeInto(oldAlbum, target);
        merged++;
      }
    }

    // An album that has tracks again isn't merged anywhere; then collapse chains so each redirect is one hop.
    db.prepare(
      `UPDATE albums SET merged_into_id = NULL
       WHERE merged_into_id IS NOT NULL AND EXISTS (SELECT 1 FROM tracks WHERE album_id = albums.id)`,
    ).run();
    for (let hop = 0; hop < MAX_MERGE_HOPS; hop++) {
      const collapsed = db
        .prepare(
          `UPDATE albums SET merged_into_id = NULLIF(
             (SELECT m.merged_into_id FROM albums m WHERE m.id = albums.merged_into_id), albums.id)
           WHERE merged_into_id IN (SELECT id FROM albums WHERE merged_into_id IS NOT NULL)`,
        )
        .run();
      if (collapsed.changes === 0) break;
    }

    return { artistsSet, merged };
  })();
}

function mergeInto(albumId: number, targetId: number): void {
  db.prepare('UPDATE albums SET merged_into_id = ? WHERE id = ?').run(targetId, albumId);
  db.prepare(
    `UPDATE albums SET artwork_id = (SELECT artwork_id FROM albums WHERE id = ?)
     WHERE id = ? AND artwork_id IS NULL`,
  ).run(albumId, targetId);
}

export function setLastStreamError(id: number, message: string | null): void {
  db.prepare('UPDATE tracks SET last_stream_error = ? WHERE id = ?').run(message, id);
}

/** Every track path, for the disk sweep. Scope to one root, so each root's guard judges only its own tracks. */
export function listTrackPaths(
  rootId?: number,
): { id: number; path: string; missing_since: string | null }[] {
  if (rootId !== undefined) {
    return db
      .prepare('SELECT id, path, missing_since FROM tracks WHERE root_id = ? ORDER BY id')
      .all(rootId) as { id: number; path: string; missing_since: string | null }[];
  }
  return db
    .prepare('SELECT id, path, missing_since FROM tracks ORDER BY id')
    .all() as { id: number; path: string; missing_since: string | null }[];
}

/** Marks tracks missing, keeping an existing stamp so the date still says "since when". */
export function markTracksMissing(ids: number[], at: string): void {
  if (ids.length === 0) return;
  const statement = db.prepare(
    'UPDATE tracks SET missing_since = ? WHERE id = ? AND missing_since IS NULL',
  );
  db.transaction(() => {
    for (const id of ids) statement.run(at, id);
  })();
}

/** Clears the missing flag for files that have come back. */
export function clearTracksMissing(ids: number[]): void {
  if (ids.length === 0) return;
  const statement = db.prepare(
    'UPDATE tracks SET missing_since = NULL, last_stream_error = NULL WHERE id = ?',
  );
  db.transaction(() => {
    for (const id of ids) statement.run(id);
  })();
}

export function countMissingTracks(): number {
  return (
    db.prepare('SELECT COUNT(*) as count FROM tracks WHERE missing_since IS NOT NULL').get() as {
      count: number;
    }
  ).count;
}

export interface MissingTrack {
  id: number;
  title: string;
  artist: string | null;
  path: string;
  missingSince: string;
  lastStreamError: string | null;
  /** Null on rows detached by a root removal before A51 (2026-10-11); a removal now deletes the tracks. */
  rootId: number | null;
  rootLabel: string | null;
}

/** Missing tracks, oldest absence first. */
export function listMissingTracks(): MissingTrack[] {
  return db
    .prepare(
      `SELECT
         t.id as id,
         t.title as title,
         a.name as artist,
         t.path as path,
         t.missing_since as missingSince,
         t.last_stream_error as lastStreamError,
         t.root_id as rootId,
         r.label as rootLabel
       FROM tracks t
       LEFT JOIN artists a ON a.id = t.artist_id
       LEFT JOIN library_roots r ON r.id = t.root_id
       WHERE t.missing_since IS NOT NULL
       ORDER BY t.missing_since ASC, t.id ASC`,
    )
    .all() as MissingTrack[];
}

/** Sets `hidden` and/or `not_recommended` on many tracks in one transaction. Returns how many rows matched. */
export function setTrackFlags(
  ids: number[],
  flags: { hidden?: boolean; notRecommended?: boolean },
): number {
  const sets: string[] = [];
  const params: Record<string, unknown> = {};
  if (flags.hidden !== undefined) {
    sets.push('hidden = @hidden');
    params.hidden = flags.hidden ? 1 : 0;
  }
  if (flags.notRecommended !== undefined) {
    sets.push('not_recommended = @notRecommended');
    params.notRecommended = flags.notRecommended ? 1 : 0;
  }
  if (sets.length === 0 || ids.length === 0) return 0;

  const update = db.prepare(`UPDATE tracks SET ${sets.join(', ')} WHERE id = @id`);
  return db.transaction(() => ids.reduce((n, id) => n + update.run({ ...params, id }).changes, 0))();
}

/**
 * Deletes a track row and its favorites, less-often marks, playlist entries and history, dependents first: foreign keys are enforced
 * and none cascade. The file on disk is the caller's job.
 */
/** Every table with rows that point at a track. Both deletes below clear these first. */
const TRACK_CHILD_TABLES = ['favorites', 'less_often', 'playlist_tracks', 'play_history', 'playback_failures'] as const;

export function deleteTrackRow(id: number): void {
  const cleanup = db.transaction((trackId: number) => {
    for (const table of TRACK_CHILD_TABLES) db.prepare(`DELETE FROM ${table} WHERE track_id = ?`).run(trackId);
    db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
  });
  cleanup(id);
}

/**
 * Every track of one root, with its child rows, in a handful of statements however many tracks there are (removing a
 * large folder used to prepare six per track). The caller's transaction makes it all-or-nothing.
 */
export function deleteTrackRowsOfRoot(rootId: number): void {
  for (const table of TRACK_CHILD_TABLES) {
    db.prepare(`DELETE FROM ${table} WHERE track_id IN (SELECT id FROM tracks WHERE root_id = ?)`).run(rootId);
  }
  db.prepare('DELETE FROM tracks WHERE root_id = ?').run(rootId);
}
