-- Full-text search with the trigram tokenizer: substring matches in any script (Japanese has no spaces for
-- unicode61 to split on). Queries under 3 characters fall back to LIKE in `searchLibrary()`.

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

-- Triggers keep the index in sync. `OF <columns>` keeps play_count and `hidden` updates from touching it.

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

-- Nothing renames an artist today, but a rename from anywhere must not leave the old name in tracks_fts.
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
