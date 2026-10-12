-- v0.4 box 26: the disc a track is on, from the file's disc tag. NULL = untagged, sorted as disc 1. Refreshed by every
-- scan, admin-edited tracks included (the edit form has no disc field). Rows from before this stay NULL until the
-- next scan, which re-reads every file.
ALTER TABLE tracks ADD COLUMN disc_number INTEGER;
