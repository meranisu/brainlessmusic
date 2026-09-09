import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

/**
 * The database handle, opened on first use rather than on import.
 *
 * This matters because `import` is not a passive act here: opening a
 * connection creates the file and its WAL sidecars. When that happened at
 * import time, merely importing any module that transitively reached `db/` —
 * a unit test for an unrelated pure function, say — touched whatever
 * `DB_PATH` pointed at. That has bitten this project twice (see
 * .docs/CHANGELOG.md, 2026-09-08 and 2026-09-09).
 *
 * Lazily opening it means a module can be imported, inspected and tested
 * without a database existing at all.
 */
let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!instance) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    instance = new Database(config.dbPath);
    instance.pragma('journal_mode = WAL');
  }
  return instance;
}

/** True once a connection has actually been opened — used by tests. */
export function isDatabaseOpen(): boolean {
  return instance !== null;
}

/** Closes the handle so the next access reopens it. Tests only. */
export function closeDb(): void {
  instance?.close();
  instance = null;
}

/**
 * A stand-in for the handle, so the ~90 existing `db.prepare(...)` call sites
 * need no change. Every property access resolves through `getDb()`, which is
 * what defers the connection.
 */
export const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[property];
    // Methods must keep their receiver, or better-sqlite3's internals break.
    return typeof value === 'function' ? value.bind(real) : value;
  },
  set(_target, property, value) {
    (getDb() as unknown as Record<string | symbol, unknown>)[property] = value;
    return true;
  },
  has(_target, property) {
    return property in (getDb() as unknown as object);
  },
});
