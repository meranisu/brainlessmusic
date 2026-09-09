-- Waveform peaks for the player's scrubber.
--
-- Stored as base64 of one unsigned byte per bucket, not JSON: a library of
-- 50k tracks is ~9MB this way against ~35MB as integer arrays, and the column
-- is read on every open of the Now Playing view.
--
-- Nullable and computed lazily on first request rather than during a scan —
-- decoding every file in a library to draw a picture would turn a minute-long
-- scan into an hour-long one, and most tracks are never played.
ALTER TABLE tracks ADD COLUMN waveform TEXT;
