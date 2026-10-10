-- When a track's file was first seen absent; NULL means present, and it clears when the file returns.
-- A flag, not a deletion, so favorites and playlists survive a lost mount.
ALTER TABLE tracks ADD COLUMN missing_since TEXT;

CREATE INDEX IF NOT EXISTS idx_tracks_missing_since ON tracks(missing_since);
