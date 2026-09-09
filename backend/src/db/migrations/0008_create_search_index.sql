-- Full-text search, replacing the LIKE '%x%' scans in db/browse.ts.
--
-- Tokenizer choice is the load-bearing decision here. The default `unicode61`
-- splits on whitespace and punctuation, which would break this library in two
-- ways: it can only match from the start of a token (so "eatles" finds
-- nothing), and Japanese text has no spaces, so an entire title becomes one
-- token and only a prefix of it is ever findable. `trigram` indexes every
-- 3-character run instead, giving true substring matching in any script — the
-- same thing LIKE '%x%' did, minus the full-table scan.
--
-- The cost: trigram cannot match a query shorter than 3 characters. Queries
-- that short fall back to LIKE in `searchLibrary()`, which matters most for
-- CJK, where a 2-character query is a perfectly ordinary thing to type.

CREATE VIRTUAL TABLE tracks_fts USING fts5(
  title,
  artist,
  album,
  tokenize = 'trigram remove_diacritics 1'
);

CREATE VIRTUAL TABLE artists_fts USING fts5(
  name,
  tokenize = 'trigram remove_diacritics 1'
);

CREATE VIRTUAL TABLE albums_fts USING fts5(
  title,
  tokenize = 'trigram remove_diacritics 1'
);

-- Seed from what's already in the library. rowid is the source table's id in
-- every case, so a MATCH result joins straight back with no extra column.
INSERT INTO tracks_fts (rowid, title, artist, album)
SELECT t.id, t.title, a.name, al.title
FROM tracks t
LEFT JOIN artists a ON a.id = t.artist_id
LEFT JOIN albums al ON al.id = t.album_id;

INSERT INTO artists_fts (rowid, name) SELECT id, name FROM artists;

INSERT INTO albums_fts (rowid, title) SELECT id, title FROM albums;

-- Triggers keep the index correct by construction rather than by remembering
-- to call something. Note the `OF <columns>` clauses: a scrobble updating
-- play_count, or the admin toggling `hidden`, must not touch the index.

CREATE TRIGGER tracks_fts_after_insert AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts (rowid, title, artist, album)
  VALUES (
    new.id,
    new.title,
    (SELECT name FROM artists WHERE id = new.artist_id),
    (SELECT title FROM albums WHERE id = new.album_id)
  );
END;

CREATE TRIGGER tracks_fts_after_delete AFTER DELETE ON tracks BEGIN
  DELETE FROM tracks_fts WHERE rowid = old.id;
END;

CREATE TRIGGER tracks_fts_after_update AFTER UPDATE OF title, artist_id, album_id ON tracks BEGIN
  DELETE FROM tracks_fts WHERE rowid = old.id;
  INSERT INTO tracks_fts (rowid, title, artist, album)
  VALUES (
    new.id,
    new.title,
    (SELECT name FROM artists WHERE id = new.artist_id),
    (SELECT title FROM albums WHERE id = new.album_id)
  );
END;

CREATE TRIGGER artists_fts_after_insert AFTER INSERT ON artists BEGIN
  INSERT INTO artists_fts (rowid, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER artists_fts_after_delete AFTER DELETE ON artists BEGIN
  DELETE FROM artists_fts WHERE rowid = old.id;
END;

-- Nothing in the app renames an artist today — tag edits find-or-create and
-- repoint `tracks.artist_id`. This trigger exists so that a rename arriving by
-- any other route (a future feature, a manual fix) can't leave the name that
-- tracks_fts denormalises pointing at the old spelling.
CREATE TRIGGER artists_fts_after_update AFTER UPDATE OF name ON artists BEGIN
  DELETE FROM artists_fts WHERE rowid = old.id;
  INSERT INTO artists_fts (rowid, name) VALUES (new.id, new.name);
  UPDATE tracks_fts SET artist = new.name
  WHERE rowid IN (SELECT id FROM tracks WHERE artist_id = new.id);
END;

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
