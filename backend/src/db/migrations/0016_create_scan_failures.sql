-- Files the scanner couldn't read on its last pass over a library root — a
-- truncated download, a bad copy, a tag block `music-metadata` chokes on.
-- The scanner has always found these; it just returned them in memory and let
-- them go the moment the scan finished, so "which of my files are broken?"
-- had no answer once the log line scrolled away.
--
-- This is the CURRENT set, not a history: each finished scan replaces its
-- root's rows wholesale. A file that fails every night would otherwise pile
-- up one row per scan forever, and a file that has since been fixed would
-- keep being reported. (Compare `playback_failures`, which is an event log
-- and is append-only on purpose.)
--
-- No ON DELETE CASCADE, matching `favorites`/`playback_failures`: foreign keys
-- are enforced here but none of them cascade, so removing a root clears its
-- rows in application code first (see `deleteLibraryRoot`).
CREATE TABLE IF NOT EXISTS scan_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id INTEGER NOT NULL REFERENCES library_roots(id),
  path TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scan_failures_root_id ON scan_failures(root_id);
