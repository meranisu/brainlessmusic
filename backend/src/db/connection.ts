import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { foldText } from '../utils/foldText.js';

/**
 * Opened on first use, not on import: opening creates the file, and import-time opens have twice touched the real
 * `DB_PATH` from unrelated tests (CHANGELOG 2026-09-08, 2026-09-09).
 */
let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!instance) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    instance = new Database(config.dbPath);
    instance.pragma('journal_mode = WAL');
    // Accent-blind matching for the LIKE searches (people, playlists).
    instance.function('fold', { deterministic: true }, (text: unknown) => (typeof text === 'string' ? foldText(text) : text));
  }
  return instance;
}

/** True once a connection has been opened; for tests. */
export function isDatabaseOpen(): boolean {
  return instance !== null;
}

/** Closes the handle so the next access reopens it. Tests only. */
export function closeDb(): void {
  instance?.close();
  instance = null;
}

/** Stands in for the handle so `db.prepare(...)` call sites stay unchanged; each access goes through `getDb()`. */
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

/**
 * `db.transaction(fn)` that waits for the first call to open the connection, so importing a module never opens the
 * database. Rebuilt if the handle was closed and reopened (tests), since a transaction is bound to one handle.
 */
export function lazyTransaction<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
): (...args: Args) => Result {
  let built: { handle: Database.Database; run: (...args: Args) => Result } | null = null;
  return (...args) => {
    const handle = getDb();
    if (built?.handle !== handle) built = { handle, run: handle.transaction(fn) };
    return built.run(...args);
  };
}
