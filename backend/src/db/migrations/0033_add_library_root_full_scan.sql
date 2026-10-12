-- When each root last had a full tag-reading scan. `last_scanned_at` is also stamped by the reconcile-only pass at
-- boot, so it can't say whether a scan is due. The schedule scans a root once this is older than
-- LIBRARY_SCAN_INTERVAL_HOURS, checked hourly, so restarts (auto-deploy, A120) no longer reset the 12-hour clock.
-- NULL: never, so the first boot after this scans every root.
ALTER TABLE library_roots ADD COLUMN last_full_scan_at TEXT;
