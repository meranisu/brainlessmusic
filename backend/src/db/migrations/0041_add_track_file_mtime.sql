-- Incremental scan: a file whose size, mtime and scanner version all match its row is skipped, tags unread. Both start
-- null, which never matches, so the first scan after this reads every file once and fills them in.
-- Whole milliseconds (floor of stat's mtimeMs): the fraction is not stable on WSL drvfs mounts.
ALTER TABLE tracks ADD COLUMN file_mtime INTEGER;
-- `SCANNER_VERSION` in services/scanner.ts when the row was last read. Bumped when the scanner reads new tags.
ALTER TABLE tracks ADD COLUMN scan_version INTEGER;
