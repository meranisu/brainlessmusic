-- Cover art. Images are content-addressed on disk (sha256 of the image bytes
-- plus its extension, e.g. "ab12...ef.jpg"), so the same album art embedded in
-- twelve track files is stored once and re-scanning never rewrites it.
--
-- Art lives on both tables on purpose: a track carries whatever was embedded in
-- its own file (compilations differ track to track), while the album carries the
-- first cover found among its tracks, which is what a browse view wants.
ALTER TABLE tracks ADD COLUMN artwork_id TEXT;
ALTER TABLE albums ADD COLUMN artwork_id TEXT;
