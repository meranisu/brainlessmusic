import { db } from './connection.js';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
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

/** Used to decide whether registration is still in its bootstrap state. */
export function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
}

export interface UserSummary {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export function listUsers(): UserSummary[] {
  const rows = db
    .prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY username COLLATE NOCASE')
    .all() as { id: number; username: string; is_admin: number; created_at: string }[];

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
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
