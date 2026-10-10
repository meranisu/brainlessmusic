-- Files the last scan of each root couldn't read. Each scan replaces its root's rows, so fixed files drop off.
-- No cascade: removing a root clears its rows first (`deleteLibraryRoot`).
CREATE TABLE IF NOT EXISTS scan_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id INTEGER NOT NULL REFERENCES library_roots(id),
  path TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scan_failures_root_id ON scan_failures(root_id);
