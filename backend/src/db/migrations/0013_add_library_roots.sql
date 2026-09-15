-- Multiple, independently-scanned music folders — in practice, separate
-- external drives — instead of the one fixed LIBRARY_PATH this app started
-- with. Each row is a folder an admin has registered from the UI.
--
-- `path` is UNIQUE rather than compound-keyed with anything: two roots
-- pointing at the same filesystem path would just scan the same files twice
-- and double-count them, with no upside.
--
-- The current single `LIBRARY_PATH` is *not* seeded here — a migration is
-- pure SQL with no access to the env var that holds it. That seeding (plus
-- backfilling every existing track's new `root_id`) happens once at server
-- boot, in application code that actually has `config.libraryPath` to read.
CREATE TABLE IF NOT EXISTS library_roots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  label TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_scanned_at TEXT,
  -- Set when the root itself was unreadable at the last scan/reconcile
  -- attempt (the "whole drive is gone" case) — distinct from an individual
  -- track's own `missing_since`, which survives its root disappearing.
  last_scan_error TEXT
);

-- Nullable: a track can end up unowned (its root was deleted — see
-- `deleteLibraryRoot`, which detaches rather than cascades) without that
-- being a data-integrity problem. No `ON DELETE` action is declared because
-- foreign keys ARE enforced here (better-sqlite3's bundled SQLite defaults
-- it on) — `deleteLibraryRoot` must null out every referencing track's
-- `root_id` before deleting the row, in one transaction, or the delete
-- itself fails with a constraint error.
ALTER TABLE tracks ADD COLUMN root_id INTEGER REFERENCES library_roots(id);

CREATE INDEX IF NOT EXISTS idx_tracks_root_id ON tracks(root_id);
