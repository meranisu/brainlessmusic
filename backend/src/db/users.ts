import { randomBytes, randomInt } from 'node:crypto';
import { db } from './connection.js';

/** `'account'` logs in with a password. `'guest'` can't: its one JWT is the only way in, so losing it loses the row. */
export type UserKind = 'account' | 'guest';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
  kind: UserKind;
  last_seen_at: string | null;
  /** NULL means no passcode is set. See `0014_add_passcode.sql`. */
  passcode_hash: string | null;
  /** Web theme id (A55); NULL until the user picks one or the client uploads its local choice. See `0020`. */
  theme: string | null;
  /** What to call this user (A68); NULL shows `username`. See `0022`. */
  display_name: string | null;
  /** Bumped on every password change; tokens signed with an older one are refused (C8). See `0024`. */
  session_version: number;
  /** The profile picture's content hash (A167); NULL means none. See `0035`. */
  avatar_id: string | null;
  /** Lowercase; NULL until added, and always for guests (A190). See `0037`. */
  email: string | null;
}

/** Longest display name, in characters. */
export const DISPLAY_NAME_MAX = 32;

/**
 * Trims, collapses whitespace and drops control characters. `''` means "no name given"; undefined means not a usable
 * name (wrong type or too long), which callers turn into a 400.
 */
export function cleanDisplayName(input: unknown): string | undefined {
  if (input === undefined || input === null) return '';
  if (typeof input !== 'string') return undefined;
  const name = input.replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return [...name].length <= DISPLAY_NAME_MAX ? name : undefined;
}

/** The name an unnamed guest gets: `Guest 4821`. Not unique; the code, not the name, says who someone is (A68). */
export function randomGuestName(): string {
  return `Guest ${randomInt(1000, 10000)}`;
}

/** `display_name`, else `username`. */
export function nameOf(user: Pick<UserRow, 'username' | 'display_name'>): string {
  return user.display_name ?? user.username;
}

/** Case-insensitive (A111): `Imran` finds `imran`. */
export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined;
}

/** Longest email, in characters (the SMTP path limit). */
export const EMAIL_MAX = 254;
/** One `@`, something either side, a dot in the domain. A typo check, not proof the mailbox exists. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed and lowercased, or undefined when it doesn't look like an email. */
export function cleanEmail(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const email = input.trim().toLowerCase();
  return email.length <= EMAIL_MAX && EMAIL_PATTERN.test(email) ? email : undefined;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as UserRow | undefined;
}

/** Sign-in takes a username or an email (A192). Usernames can't contain `@`, so the two never collide. */
export function findUserByLogin(login: string): UserRow | undefined {
  return login.includes('@') ? findUserByEmail(login) : findUserByUsername(login);
}

/** `email` must already be cleaned; the caller checks it isn't someone else's. */
export function setEmail(id: number, email: string): void {
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, id);
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
  db.prepare('UPDATE users SET is_admin = ? WHERE username = ? COLLATE NOCASE').run(isAdmin ? 1 : 0, username);
  return findUserByUsername(username);
}

/** Admins reset other people's passwords from the Users page; `npm run set-password` remains for recovery. */
/** Also ends every session signed before the change (C8). */
export function setPasswordHash(username: string, passwordHash: string): UserRow | undefined {
  db.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE username = ? COLLATE NOCASE').run(passwordHash, username);
  return findUserByUsername(username);
}

/** Every row, guests included. Kept for callers that mean "rows in this table". */
export function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
}

/** Accounts only. Counting guests would close the bootstrap window on a server with no admin yet. */
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
 * A passwordless guest row. The random username keeps `UNIQUE` meaningful and gives logs a name; the retry rules out
 * collisions. `password_hash` is `''`, though `/auth/login` refuses guests before any comparison. An empty
 * `displayName` becomes `Guest NNNN`.
 */
export function insertGuest(displayName = ''): UserRow {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = `guest-${randomBytes(3).toString('hex')}`;
    if (findUserByUsername(username)) continue;

    const result = db
      .prepare("INSERT INTO users (username, password_hash, kind, display_name) VALUES (?, '', 'guest', ?)")
      .run(username, displayName || randomGuestName());

    return findUserById(Number(result.lastInsertRowid))!;
  }

  throw new Error('Could not allocate a unique guest name');
}

/** Stamps last-seen. Called from `GET /auth/me`, not per request, which would write on every byte-range. */
export function touchLastSeen(id: number): void {
  db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(id);
}

/**
 * Deletes guests idle for `idleDays`, with all their data; returns how many. The only automatic user-data delete:
 * it touches `kind = 'guest'` only, and runs only under cap pressure. `play_count` stays, since the plays happened.
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
      db.prepare('DELETE FROM less_often WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM play_history WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM playback_state WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM playback_failures WHERE user_id = ?').run(id);
      db.prepare('UPDATE guest_codes SET used_by = NULL WHERE used_by = ?').run(id);
      db.prepare(
        "UPDATE account_invites SET guest_user_id = NULL, revoked_at = COALESCE(revoked_at, datetime('now')) WHERE guest_user_id = ?",
      ).run(id);
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
  /** `display_name`, else `username`. */
  displayName: string;
  /** Plays past the scrobble threshold in the last 7 days; skips don't count. */
  plays7d: number;
}

export function listUsers(): UserSummary[] {
  const rows = db
    .prepare(
      `SELECT id, username, is_admin, created_at, kind, last_seen_at, display_name,
              (SELECT COUNT(*) FROM play_history ph
               WHERE ph.user_id = users.id AND ph.skipped = 0 AND ph.played_at > datetime('now', '-7 days')) AS plays_7d
       FROM users ORDER BY username COLLATE NOCASE`,
    )
    .all() as {
    id: number;
    username: string;
    is_admin: number;
    created_at: string;
    kind: UserKind;
    last_seen_at: string | null;
    display_name: string | null;
    plays_7d: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
    kind: row.kind,
    lastSeenAt: row.last_seen_at,
    displayName: nameOf(row),
    plays7d: row.plays_7d,
  }));
}

/** Used to refuse demoting the last admin; recovery would need the `set-admin` CLI. */
export function countAdmins(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get() as { count: number })
    .count;
}

export function setAdminById(id: number, isAdmin: boolean): UserRow | undefined {
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id);
  return findUserById(id);
}

/** Also ends every session signed before the change (C8). */
export function setPasswordHashById(id: number, passwordHash: string): UserRow | undefined {
  db.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?').run(passwordHash, id);
  return findUserById(id);
}

/** Self-service only, from Options. */
export function setPasscodeHashById(id: number, passcodeHash: string): UserRow | undefined {
  db.prepare('UPDATE users SET passcode_hash = ? WHERE id = ?').run(passcodeHash, id);
  return findUserById(id);
}

export function setUserTheme(id: number, theme: string): void {
  db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, id);
}

/** NULL clears it back to `username`. */
export function setDisplayName(id: number, displayName: string | null): void {
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, id);
}

export function clearPasscodeById(id: number): UserRow | undefined {
  db.prepare('UPDATE users SET passcode_hash = NULL WHERE id = ?').run(id);
  return findUserById(id);
}

export function deleteUser(id: number): boolean {
  const purge = db.transaction((userId: number) => {
    db.prepare(
      'DELETE FROM playlist_tracks WHERE playlist_id IN (SELECT id FROM playlists WHERE owner_id = ?)',
    ).run(userId);
    db.prepare('DELETE FROM playlists WHERE owner_id = ?').run(userId);
    db.prepare('DELETE FROM favorites WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM less_often WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM play_history WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM playback_state WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM playback_failures WHERE user_id = ?').run(userId);
    db.prepare('UPDATE guest_codes SET used_by = NULL WHERE used_by = ?').run(userId);
    db.prepare('UPDATE guest_codes SET created_by = NULL WHERE created_by = ?').run(userId);
    db.prepare('UPDATE account_invites SET created_by = NULL WHERE created_by = ?').run(userId);
    db.prepare('UPDATE account_invites SET used_by = NULL WHERE used_by = ?').run(userId);
    db.prepare(
      "UPDATE account_invites SET guest_user_id = NULL, revoked_at = COALESCE(revoked_at, datetime('now')) WHERE guest_user_id = ?",
    ).run(userId);
    return db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes > 0;
  });
  return purge(id);
}
