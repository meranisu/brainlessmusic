-- When an admin last edited this track's title, artist, album or track number (`PATCH /tracks/:id`). Edits live in the
-- database only (no write-back to the file yet, Q5), so a scan must not put the file's own tags back over them (C9).
-- NULL: never edited, so the scan keeps the row in step with the file.
ALTER TABLE tracks ADD COLUMN tags_edited_at TEXT;
