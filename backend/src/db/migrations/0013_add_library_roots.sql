-- Several independently scanned music folders (in practice, external drives), registered from the UI.
-- LIBRARY_PATH is seeded at boot (`ensureDefaultLibraryRoot`), since SQL can't read env vars.
CREATE TABLE IF NOT EXISTS library_roots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  label TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_scanned_at TEXT,
  -- The root itself was unreadable at the last scan (the "whole drive is gone" case).
  last_scan_error TEXT
);

-- Nullable: a deleted root's tracks are detached, not deleted. Foreign keys are enforced, so `deleteLibraryRoot`
-- must null `root_id` before deleting the row, in one transaction.
ALTER TABLE tracks ADD COLUMN root_id INTEGER REFERENCES library_roots(id);

CREATE INDEX IF NOT EXISTS idx_tracks_root_id ON tracks(root_id);
