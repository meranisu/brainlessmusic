# Incremental scan

## Goal

Stop the library scan from rereading every file's tags at boot and every 12 h. Today it does this for all 12,759 songs,
even when nothing changed.

**Done when:** a second scan of an unchanged library finishes in about the time of the folder walk alone. It reports
every file as unchanged.

## Not doing

- File watcher (brainstorm row; only after this, and inotify is unreliable on WSL `/mnt`).
- Skipping unchanged folders by folder mtime (Navidrome's approach). The per-file check is enough for now.

## Decisions

- A223 (web Full rescan button), A224 (an mtime-only change rereads tags)

## Phase Overview

| Phase | What it covers | Status |
|---|---|---|
| 1. Plan | Size + mtime + scanner version per track; `?full=1` override | Done 2026-10-20 |
| 2. Structure | Migration 0041, `listTrackFileStamps`, skip in `scanFile`, `full` through `syncLibrary` and both scan routes | Done 2026-10-20 |
| 3. Interior | Web: "Full rescan" button beside each folder's "Rescan" in Options (A223) | Done 2026-10-20 |
| 4. Walkthrough | Time a full and an incremental scan on a copy of the real library; check on smol after deploy | Not started |

## Phase 2: Structure

- [x] `0041_add_track_file_mtime.sql`: `tracks.file_mtime`, `tracks.scan_version`, nullable, no backfill
- [x] `upsertTrack` stores both; `listTrackFileStamps(rootId)` loads them in one query (`backend/src/db/library.ts`)
- [x] `SCANNER_VERSION`; `scanFile` stats first and returns `unchanged` when size, mtime and version match; `filesUnchanged` in `ScanSummary` (`backend/src/services/scanner.ts`)
- [x] `syncLibrary(..., { full })`; `POST /library/scan?full=1` and `POST /library/roots/:id/scan?full=1`
- [x] Tests in `scanner.test.ts`: unchanged rescan, mtime change, replaced file drops loudness, stale version, full, admin edit kept

## Phase 4: Walkthrough

- [ ] Scan time before and after, on a copy of the real DB (never the container)
- [ ] First scan on smol after deploy rereads everything once; the next one is incremental

## Notes

- Bump `SCANNER_VERSION` whenever `extractTrackTags` reads a new field. Otherwise existing rows never get it.
- Uploads (`routes/tracks.ts`) store null stamps, so the next scan reads them once more. This is harmless.

## Change log

| Date | Change |
|---|---|
| 2026-10-20 | Plan approved; Phase 2 built |
| 2026-10-20 | Owner answered Q212/Q213 (A223, A224): web Full rescan button added |
