ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tracks ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN not_recommended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN bitrate INTEGER;
ALTER TABLE tracks ADD COLUMN sample_rate INTEGER;
ALTER TABLE tracks ADD COLUMN last_stream_error TEXT;

CREATE INDEX IF NOT EXISTS idx_tracks_hidden ON tracks(hidden);
CREATE INDEX IF NOT EXISTS idx_tracks_not_recommended ON tracks(not_recommended);
