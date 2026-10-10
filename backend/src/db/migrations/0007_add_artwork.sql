-- Cover art, content-addressed (sha256 + extension), so art shared by many files is stored once.
-- Tracks keep their own embedded art; albums take the first cover found.
ALTER TABLE tracks ADD COLUMN artwork_id TEXT;
ALTER TABLE albums ADD COLUMN artwork_id TEXT;
