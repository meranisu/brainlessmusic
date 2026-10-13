import { db } from './connection.js';
import { getTrackSummariesByIds, type TrackSummary } from './browse.js';
import { foldText } from '../utils/foldText.js';

/** Longest bio kept. */
export const MAX_BIO_LENGTH = 300;

/** What a profile shows about the person, before the lists (profile page, A167-A170). */
export interface ProfileHeader {
  id: number;
  name: string;
  username: string;
  isAdmin: boolean;
  memberSince: string;
  bio: string | null;
  /** Null without a picture. Changes when the picture does, so a client can cache by it. */
  avatarId: string | null;
  favoriteTrack: TrackSummary | null;
  favoriteArtist: { id: number; name: string } | null;
}

interface ProfileRow {
  id: number;
  username: string;
  display_name: string | null;
  is_admin: number;
  kind: 'account' | 'guest';
  created_at: string;
  bio: string | null;
  avatar_id: string | null;
  favorite_track_id: number | null;
  favorite_artist_id: number | null;
}

function findProfileRow(userId: number): ProfileRow | undefined {
  return db
    .prepare(
      `SELECT id, username, display_name, is_admin, kind, created_at, bio, avatar_id, favorite_track_id, favorite_artist_id
       FROM users WHERE id = ?`,
    )
    .get(userId) as ProfileRow | undefined;
}

/** The header of an account's profile; undefined for a guest or nobody (guests have none, A167). */
export function getProfileHeader(userId: number): ProfileHeader | undefined {
  const row = findProfileRow(userId);
  if (!row || row.kind !== 'account') return undefined;
  const [favoriteTrack] = row.favorite_track_id === null ? [] : getTrackSummariesByIds([row.favorite_track_id]);
  // A pin to an artist a scan removed simply isn't shown.
  const favoriteArtist =
    row.favorite_artist_id === null
      ? undefined
      : (db.prepare('SELECT id, name FROM artists WHERE id = ?').get(row.favorite_artist_id) as
          | { id: number; name: string }
          | undefined);
  return {
    id: row.id,
    name: row.display_name ?? row.username,
    username: row.username,
    isAdmin: row.is_admin === 1,
    memberSince: row.created_at,
    bio: row.bio,
    avatarId: row.avatar_id,
    favoriteTrack: favoriteTrack ?? null,
    favoriteArtist: favoriteArtist ?? null,
  };
}

export function getAvatarId(userId: number): string | null {
  return findProfileRow(userId)?.avatar_id ?? null;
}

/** Sets the picture; returns the one it replaced, for the caller to delete once nothing uses it. */
export function setAvatarId(userId: number, avatarId: string | null): string | null {
  const previous = getAvatarId(userId);
  db.prepare('UPDATE users SET avatar_id = ? WHERE id = ?').run(avatarId, userId);
  return previous;
}

/** Whether anyone still has [avatarId] (two people can upload the same picture). */
export function isAvatarInUse(avatarId: string): boolean {
  return db.prepare('SELECT 1 FROM users WHERE avatar_id = ? LIMIT 1').get(avatarId) !== undefined;
}

export interface ProfileUpdate {
  /** Trimmed and cut to [MAX_BIO_LENGTH]; empty clears it. */
  bio?: string | null;
  favoriteTrackId?: number | null;
  favoriteArtistId?: number | null;
}

/** Only the fields given change. The caller checks that a pinned song or artist exists. */
export function updateProfile(userId: number, update: ProfileUpdate): void {
  if (update.bio !== undefined) {
    const bio = update.bio?.trim().slice(0, MAX_BIO_LENGTH) || null;
    db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, userId);
  }
  if (update.favoriteTrackId !== undefined) {
    db.prepare('UPDATE users SET favorite_track_id = ? WHERE id = ?').run(update.favoriteTrackId, userId);
  }
  if (update.favoriteArtistId !== undefined) {
    db.prepare('UPDATE users SET favorite_artist_id = ? WHERE id = ?').run(update.favoriteArtistId, userId);
  }
}

export interface Person {
  id: number;
  name: string;
  avatarId: string | null;
  bio: string | null;
  /** Last play of anything; null if never. SQLite UTC. */
  lastPlayedAt: string | null;
}

/** Everyone with a profile: accounts, most recently listening first (A170's People page). */
export function listPeople(): Person[] {
  return db
    .prepare(
      `SELECT u.id AS id, COALESCE(u.display_name, u.username) AS name, u.avatar_id AS avatarId, u.bio AS bio,
              (SELECT MAX(ph.played_at) FROM play_history ph WHERE ph.user_id = u.id) AS lastPlayedAt
       FROM users u
       WHERE u.kind = 'account'
       ORDER BY lastPlayedAt IS NULL, lastPlayedAt DESC, name COLLATE NOCASE`,
    )
    .all() as Person[];
}

/** People whose name or username contains `query`, for search (A172). Accounts only, as on the People page. */
export function searchPeople(query: string, limit = 10, offset = 0): Person[] {
  // `%` and `_` in a name are literal here, not wildcards. Folded, so accents don't matter.
  const pattern = `%${foldText(query.trim()).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .prepare(
      `SELECT u.id AS id, COALESCE(u.display_name, u.username) AS name, u.avatar_id AS avatarId, u.bio AS bio,
              (SELECT MAX(ph.played_at) FROM play_history ph WHERE ph.user_id = u.id) AS lastPlayedAt
       FROM users u
       WHERE u.kind = 'account'
         AND (fold(u.username) LIKE ? ESCAPE '\\' OR fold(u.display_name) LIKE ? ESCAPE '\\')
       ORDER BY name COLLATE NOCASE, u.id
       LIMIT ? OFFSET ?`,
    )
    .all(pattern, pattern, limit, offset) as Person[];
}
