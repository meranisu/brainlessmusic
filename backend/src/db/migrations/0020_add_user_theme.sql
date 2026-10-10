-- The web theme follows the profile, not the browser (A55). NULL means never chosen: the client keeps whatever the
-- browser already shows and uploads it once. Ids are the web's `THEMES` list; the server only checks their shape.
ALTER TABLE users ADD COLUMN theme TEXT;
