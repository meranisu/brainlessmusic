import { randomBytes } from 'node:crypto';
import { db } from './connection.js';

/**
 * `'account'` has a password and can log in. `'guest'` has neither and never
 * will — it is minted by pressing the button on the title screen, and the JWT
 * handed back at that moment is the only way anything will ever authenticate
 * as it. Losing that token loses the row's listening history for good, which
 * is why nothing in the UI should offer to clear it casually.
 */
export type UserKind = 'account' | 'guest';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
  kind: UserKind;
  last_seen_at: string | null;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function insertUser(username: string, passwordHash: string): UserRow {
  const result = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);

  return findUserById(Number(result.lastInsertRowid))!;
}

/** Also reachable from the admin Users page; the CLI (`npm run set-admin`) remains for recovery. */
export function setAdmin(username: string, isAdmin: boolean): UserRow | undefined {
  db.prepare('UPDATE users SET is_admin = ? WHERE username = ?').run(isAdmin ? 1 : 0, username);
  return findUserByUsername(username);
}

/** Admins reset other people's passwords from the Users page; `npm run set-password` remains for recovery. */
export function setPasswordHash(username: string, passwordHash: string): UserRow | undefined {
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(passwordHash, username);
  return findUserByUsername(username);
}

/** Every row, guests included. Kept for callers that mean "rows in this table". */
export function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
}

/**
 * Password-holding accounts only — what "is this server claimed yet" actually
 * asks. Guests must not answer it: the first visitor to a fresh server mints
 * one before anybody logs in, and counting it would slam the bootstrap window
 * shut on a server that still has no admin, with no way back except the CLI.
 */
export function countAccounts(): number {
  return (
    db.prepare("SELECT COUNT(*) as count FROM users WHERE kind = 'account'").get() as {
      count: number;
    }
  ).count;
}

export function countGuests(): number {
  return (
    db.prepare("SELECT COUNT(*) as count FROM users WHERE kind = 'guest'").get() as { count: number }
  ).count;
}

/**
 * A passwordless row, minted by the title screen's enter button.
 *
 * The username exists so the `UNIQUE` constraint still means something and so
 * a log line has something to say; it is not a name anybody types. Six random
 * bytes make a collision vanishingly unlikely, and the retry makes it
 * impossible rather than merely unlikely — a caught 409 on a door that anyone
 * can knock on is not a good trade for four lines.
 *
 * `password_hash` is `''`, which no bcrypt hash can equal. That is belt to
 * `kind`'s braces: `/auth/login` refuses guests before it reaches a comparison
 * at all, so this value is never fed to bcrypt in the first place.
 */
export function insertGuest(): UserRow {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = `guest-${randomBytes(3).toString('hex')}`;
    if (findUserByUsername(username)) continue;

    const result = db
      .prepare("INSERT INTO users (username, password_hash, kind) VALUES (?, '', 'guest')")
      .run(username);

    return findUserById(Number(result.lastInsertRowid))!;
  }

  throw new Error('Could not allocate a unique guest name');
}

/**
 * Records that this row presented a valid token just now. Called from
 * `GET /auth/me` rather than from the auth decorator: every request would mean
 * a write per streamed byte-range, and the only thing reading this column is a
 * prune that measures in days.
 */
export function touchLastSeen(id: number): void {
  db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(id);
}

/**
 * Deletes guests untouched for `idleDays`, **with everything they owned** —
 * favorites, playlists, play history and resume position. Returns how many
 * rows went.
 *
 * Two things make this safe enough to run automatically, and it is worth being
 * clear about both because this is the only code in the project that deletes
 * user data without a human pressing something:
 *
 * 1. It can only ever touch `kind = 'guest'`. An account is never eligible, at
 *    any age, because someone can still log into it.
 * 2. It runs only under cap pressure (`POST /auth/guest` at the ceiling), not
 *    on a timer, so an idle guest survives indefinitely on a server nobody is
 *    filling up.
 *
 * The deletes are explicit rather than left to cascades — none of this
 * project's foreign keys cascade, matching `deletePlaylist`. `tracks.play_count`
 * is deliberately *not* decremented: it counts what was played, and the plays
 * happened.
 */
export function pruneIdleGuests(idleDays: number): number {
  const stale = db
    .prepare(
      `SELECT id FROM users
        WHERE kind = 'guest'
          AND COALESCE(last_seen_at, created_at) < datetime('now', ?)`,
    )
    .all(`-${idleDays} days`) as { id: number }[];

  if (stale.length === 0) return 0;

  const purge = db.transaction((ids: number[]) => {
    for (const id of ids) {
      db.prepare(
        'DELETE FROM playlist_tracks WHERE playlist_id IN (SELECT id FROM playlists WHERE owner_id = ?)',
      ).run(id);
      db.prepare('DELETE FROM playlists WHERE owner_id = ?').run(id);
      db.prepare('DELETE FROM favorites WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM play_history WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM playback_state WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    }
  });

  purge(stale.map((row) => row.id));
  return stale.length;
}

export interface UserSummary {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  /** So the admin page can tell a person from a device that pressed "enter". */
  kind: UserKind;
  lastSeenAt: string | null;
}

export function listUsers(): UserSummary[] {
  const rows = db
    .prepare(
      'SELECT id, username, is_admin, created_at, kind, last_seen_at FROM users ORDER BY username COLLATE NOCASE',
    )
    .all() as {
    id: number;
    username: string;
    is_admin: number;
    created_at: string;
    kind: UserKind;
    last_seen_at: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
    kind: row.kind,
    lastSeenAt: row.last_seen_at,
  }));
}

/**
 * How many admins remain. Used to refuse the last demotion — an installation
 * with no admin can no longer create users or manage anything, and the only
 * way back is the `set-admin` CLI on the server.
 */
export function countAdmins(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get() as { count: number })
    .count;
}

export function setAdminById(id: number, isAdmin: boolean): UserRow | undefined {
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id);
  return findUserById(id);
}

export function setPasswordHashById(id: number, passwordHash: string): UserRow | undefined {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  return findUserById(id);
}

export function deleteUser(id: number): boolean {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}
