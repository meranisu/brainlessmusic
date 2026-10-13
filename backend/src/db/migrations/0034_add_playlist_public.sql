-- Public playlists (A162-A166): the owner can let everyone signed in on this server see and play a playlist. Private
-- by default, so every playlist made before this stays private. `public_at` is when it last went public; the
-- "From others" list is newest first by it (A166), and it is NULL while private.
ALTER TABLE playlists ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE playlists ADD COLUMN public_at TEXT;

CREATE INDEX IF NOT EXISTS idx_playlists_public_at ON playlists(is_public, public_at);
