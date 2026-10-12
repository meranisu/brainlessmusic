-- v0.4 box 27: genres from the files' genre tags, a track can have several. Names match without case, so "Rock" and
-- "rock" are one genre; the first spelling seen is the one shown. Refreshed by every scan, admin-edited tracks
-- included (the edit form has no genre field). Empty until the next scan re-reads the files.
CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS track_genres (
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  genre_id INTEGER NOT NULL REFERENCES genres(id),
  PRIMARY KEY (track_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_track_genres_genre_id ON track_genres (genre_id);
