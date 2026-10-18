-- Smart playlists (A207): a playlist that holds rules instead of tracks and refills itself each time it opens.
-- The column holds the rules as versioned JSON (see db/smartPlaylists.ts). NULL is an ordinary playlist, which is every
-- playlist made before this, so nothing existing changes.
ALTER TABLE playlists ADD COLUMN rules TEXT;
