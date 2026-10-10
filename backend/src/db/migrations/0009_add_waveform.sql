-- Scrubber peaks, base64 of one byte per bucket (~9 MB per 50k tracks vs ~35 MB as JSON).
-- Computed on first request, not during a scan, since most tracks are never played.
ALTER TABLE tracks ADD COLUMN waveform TEXT;
