-- Loudness for volume levelling (A3: the client applies the gain). Measured in the background with ffmpeg's ebur128
-- filter, not read from tags: this library's R128/ReplayGain tags disagree with a measurement. NULL means not measured
-- yet; a scan clears both when the file's size changes.
ALTER TABLE tracks ADD COLUMN loudness_lufs REAL;
-- True peak in dBTP, which caps how far a quiet track may be raised. NULL with a measured `loudness_lufs` is a silent file.
ALTER TABLE tracks ADD COLUMN loudness_peak REAL;
