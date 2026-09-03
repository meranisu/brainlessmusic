import { db } from './connection.js';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
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
