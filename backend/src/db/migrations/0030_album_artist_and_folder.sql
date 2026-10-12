-- v0.4 metadata model, rules 1-3 and 7 (.docs/features/metadata-model/planning.md, A148). Albums are keyed by title,
-- album artist and album folder instead of title and track artist. `UNIQUE (title, artist_id)` from 0002 can't be
-- dropped in place, so the table is rebuilt: copied out, recreated, copied back with every id kept, so tracks,
-- the search index and anything a client holds still point at the same rows.
--
-- No RENAME: renaming a table re-parses every trigger, and the tracks_fts triggers name `albums`, which doesn't
-- exist mid-rebuild. Foreign keys stay on and are only deferred to the commit, when `albums` is whole again.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE albums_0030 AS SELECT id, title, artist_id, year, created_at, artwork_id FROM albums;

DROP TABLE albums;

CREATE TABLE albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  -- The album artist since 0030 (the track artist before): the albumartist tag, Various Artists for a compilation,
  -- or, when `artist_from_tracks` is 1, whoever is on more than half its tracks.
  artist_id INTEGER REFERENCES artists(id),
  year INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  artwork_id TEXT,
  -- The tracks' folder, or its parent for a disc folder (CD1, Disc 2). NULL on rows from before 0030; a scan moves
  -- their tracks to keyed rows, adopting the old row where it can.
  folder TEXT,
  -- 1: no file had an albumartist tag, so artist_id is worked out from the tracks after each scan (A148).
  artist_from_tracks INTEGER NOT NULL DEFAULT 0,
  -- Set when a scan emptied this album: the album most of its tracks moved to. GET /albums/:id follows it.
  merged_into_id INTEGER REFERENCES albums(id)
);

INSERT INTO albums (id, title, artist_id, year, created_at, artwork_id)
SELECT id, title, artist_id, year, created_at, artwork_id FROM albums_0030;

DROP TABLE albums_0030;

CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums (artist_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_key ON albums (title, folder, artist_id)
  WHERE folder IS NOT NULL AND artist_from_tracks = 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_key_from_tracks ON albums (title, folder)
  WHERE folder IS NOT NULL AND artist_from_tracks = 1;

-- Dropped with the old table; same bodies as 0008.
CREATE TRIGGER albums_fts_after_insert AFTER INSERT ON albums BEGIN
  INSERT INTO albums_fts (rowid, title) VALUES (new.id, new.title);
END;

CREATE TRIGGER albums_fts_after_delete AFTER DELETE ON albums BEGIN
  DELETE FROM albums_fts WHERE rowid = old.id;
END;

CREATE TRIGGER albums_fts_after_update AFTER UPDATE OF title ON albums BEGIN
  DELETE FROM albums_fts WHERE rowid = old.id;
  INSERT INTO albums_fts (rowid, title) VALUES (new.id, new.title);
  UPDATE tracks_fts SET album = new.title
  WHERE rowid IN (SELECT id FROM tracks WHERE album_id = new.id);
END;
