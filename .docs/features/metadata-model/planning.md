# Metadata model — planning

## Goal

Group albums by album artist, recognise compilations, sort multi-disc albums in disc order, and let people browse by
genre, without losing anything that points at the existing library. Roadmap boxes 24 to 28, release v0.4 (A147).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Measure the real library's tags, settle the grouping rules and what happens to old album ids | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Migration, scanner, album regrouping, disc order, genres, API | Done | [Phase 2](#phase-2-structure) |
| 3. Interior | Web, then Android: album artist, per-track artists on compilations, disc headers, Genres | Not started | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Rescan on smol, check nothing was lost, owner tries it on web and phone | Not started | [Phase 4](#phase-4-walkthrough) |

---

## How it works today (checked 2026-10-12)

- **Tags read:** `extractTrackTags()` (`backend/src/services/trackTags.ts:30`) reads title, artist, album, year, track
  number. `albumartist` is used only as a fallback when `artist` is empty (`trackTags.ts:38`). Disc number, compilation
  flag and genre are not read.
- **Album key:** `findOrCreateAlbum(title, artistId, year)` (`backend/src/db/library.ts:80`) finds an album by
  `(title, track artist)`, matching the `UNIQUE(title, artist_id)` constraint. So an album whose tracks have different
  artists ("A feat. B", compilations) becomes one album per artist.
- **Track order:** album tracks sort by `track_number` alone (`backend/src/db/browse.ts:310`, and `TRACK_ORDER` at
  `browse.ts:171`), so two discs' track 1s sit together.
- **Every scan re-reads every file** (`scanFile()`, `backend/src/services/scanner.ts:62`), every 12 h from boot or when
  an admin presses scan. Boot itself only reconciles (`services/librarySync.ts:147`); corrected 2026-10-12, this said
  "at boot". A new grouping rule takes effect on the next scan by itself. No separate "regroup" job is needed.
- **Admin tag edits win over the file:** a track with `tags_edited_at` set keeps its artist and album on rescan
  (`library.ts:123-124`, Q5/C9).
- **Album track list has no per-track artist** (`getAlbumDetail()`, `browse.ts:305-311`). Fine today, because every
  track on an album has the album's artist. Not fine for a compilation.

### What points at what

| Thing | Keyed by | Survives regrouping? |
|---|---|---|
| Favorites, playlists, play history, less-often, play counts | `track_id` | **Yes.** Tracks upsert by `path`, so their ids never change |
| Android downloaded songs (`downloaded_track`) | `trackId` | **Yes** |
| Android downloaded albums (`download_group`, id `album:<id>`, `android/app/src/main/kotlin/com/brainlessmusic/app/downloads/DownloadDatabase.kt:50`) | album id | **No.** Songs still play, but the group points at an album that went empty |
| Web links `/albums/<id>`, Android "go to album", `albumId` on queue items | album id | **No**, same reason |
| Album cover (`albums.artwork_id`) | album id | New album rows pick a cover on the scan that creates them (`db/artwork.ts:31`), so yes in practice |
| Album lists, artist pages, search | live query | Empty albums are already hidden (`HAVING COUNT(DISTINCT t.id) > 0`, `browse.ts:230`) |

Nothing deletes an album row today, so old albums stay in the table, empty and invisible.

## Rules (proposed)

1. **Album artist** = the file's `albumartist` tag; if empty, the track artist. `albums.artist_id` now means the album
   artist. `tracks.artist_id` stays the track artist.
1b. **Album key = title + album artist + album folder.** The album folder is the track's folder, or its parent when the
   folder is a disc folder (`CD1`, `Disc 2`, `DISC 02`, `Disk 1`, case-insensitive). Stops two unrelated albums with a
   generic title and the same album artist from merging. Needs `albums.folder` and the unique key widened to
   `(title, artist_id, folder)`.
2. **Compilation:** if the file's compilation flag is set (`common.compilation`), the album artist is "Various Artists",
   whatever `albumartist` says.
3. **Albums with no `albumartist` and mixed track artists** join when they share a title and a folder; the album
   artist is the artist on more than half the songs, otherwise Various Artists (A148).
4. **Disc number** from `common.disk.no`, stored on the track. Order everywhere is disc (missing = 1), then track,
   then title.
5. **Genres** come from `common.genre`, which is already a list. Each entry is also split on `;` and `/`, trimmed, and
   matched without case, so "Rock" and "rock" are one genre. Commas are not split, because names like "Rock, Pop" can't
   be told apart from "Hip-Hop, Rap"-style single genres.
6. **Admin-edited tracks** (`tags_edited_at` set) keep their album, as now. Their genre and disc number still refresh
   from the file, since the edit form doesn't touch those.
7. **Old album ids are redirected, not lost.** When a scan leaves an album empty because its tracks moved to another
   album, the old row records where they went (`albums.merged_into_id`, the album most of its tracks went to).
   `GET /albums/:id` on an emptied album answers with the album it merged into, plus a `mergedFrom` field, so old web
   links and Android download groups land on the right album. Android rewrites `album:<old>` groups to the new id the
   first time it sees the redirect.

## Phase 1: Plan

- [x] Map today's keying and everything that holds an album id (above).
- [x] **Measure the real library's tags** with a read-only script (reads tags, writes nothing).
  - 2026-10-12, this machine (`/home/abcde/music`): one 19-track album, nothing to regroup. Not smol's library after
    all, so it said nothing (Q151 → A151).
  - **2026-10-12, smol** (`docker exec -i brainless-app node --input-type=module - /library`, owner-approved, A151):

    | | Tracks | Share |
    |---|---|---|
    | Files read | 32,409 (4 unreadable) | |
    | Have `albumartist` | 27,137 | 84% |
    | Compilation flag | 435 | 1% |
    | Have a disc tag / disc above 1 | 16,200 / 4,555 | 50% / 14% |
    | Have a genre | 27,043 (359 distinct names) | 83% |

    Albums today: **14,123** (2.3 tracks each). Under the script's grouping: **2,886**; 2,295 albums change. So most of
    today's albums are fragments, and v0.4 changes nearly every album id at once.
- [x] Settle Q148 and Q149 with the owner (A148, A149).
- [x] Confirm the rules above against the measurement (2026-10-12). The script keyed every album by folder without
  collapsing disc folders, so its 2,886 is a little high; rule 1b will join those disc folders. What the smol run showed:
  - **Same title, same album artist, different folders.** "AD:PIANO IV - Monochrome -" and others appear twice. Most look
    like disc folders. But generic titles under one album artist ("Original Soundtrack" under "Various Artists") would
    merge unrelated albums if the key ignored the folder. → rule 1b below.
  - **Album artist spellings differ** ("Various" / "Various Artists", "Diverse System" / "Diverse Systems",
    "Key Sound Label" / "Key Sounds Label"). The rules take tags as they are; fixing spellings is tag editing (Q5),
    not this release.
  - **Genre spellings differ** ("soundtrack" 7,805 / "soundtracks" 233; "chiptune, video game music" is one
    comma-joined name). Same answer: shown as tagged, case merged only.
  - **4,555 tracks are on disc 2 or later**, so disc order matters for real.


## Phase 2: Structure

Box 25 landed as `0030_album_artist_and_folder.sql` (albums only); disc numbers and genres get their own migration.

- [x] Migration `0030`: `tracks.disc_number INTEGER`, `albums.merged_into_id INTEGER` (FK to `albums.id`),
  `albums.folder TEXT` with the unique key widened to `(title, artist_id, folder)` (rule 1b), `genres`
  (`id`, `name` unique `COLLATE NOCASE`), `track_genres` (`track_id`, `genre_id`, composite PK, index on `genre_id`).
  Update `.docs/reference/database-schema.md` in the same change.
- [x] `extractTrackTags()`: return `albumArtistName`, `compilation` (box 25), `discNumber` (box 26), `genres` (box 27).
- [x] `upsertTrack()`: key the album on the album artist (rule 1, 2); write `disc_number`; replace the track's
  `track_genres` rows. `deleteTrackRow()` deletes `track_genres` first (FKs are enforced, no cascade).
- [x] After a scan: for each album that went from having tracks to none, set `merged_into_id` (rule 7). Follow chains
  so a redirect never points at another emptied album. (`settleAlbums`, box 25)
- [x] Disc order in `TRACK_ORDER`, `getAlbumDetail()` and album shuffle; album detail returns `discNumber` and each track's artist (`0031`).
- [x] `GET /albums/:id` follows `merged_into_id` (and `/cover`).
- [x] `GET /genres` (name, album count, track count) and `GET /genres/:id` (its albums), behind the same auth as
  browse. Hidden and missing tracks don't count (`0032`, `db/genres.ts`).
- [x] Artist page: albums where they are the album artist, plus "Appears on" for albums where they only have track credits (A149).
- [x] Tests (`cd backend && npm test`, temp library from `makeTempDir()`): a compilation becomes one album; a
  feat. album groups by album artist; an emptied album redirects; favorites, playlist entries and history are untouched
  after a regrouping rescan; disc order; genre split and case merge; an admin-edited track stays put.

## Phase 3: Interior

- [ ] Web: album page shows the album artist and, on a compilation, each track's artist; "Disc 1", "Disc 2" headers
  when an album has more than one disc; a Genres view; follow the redirect for old `/albums/<id>` links.
- [ ] Android: same album page changes; Genres in browse; rewrite `album:<old>` download groups on redirect (Room
  migration for `download_group` only if the id format changes, which it shouldn't).
- [ ] Skins: the album page and any list that shows an artist go through every skin, not only Standard.

## Phase 4: Walkthrough

- [x] Back up smol's database before the first deploy (owner OK 2026-10-12). `db.backup()` inside `brainless-app`, same
  method as `deploy.sh`, into its own folder so no pruning touches it:
  `/data/backups/pre-v0.4/pre-v0.4-2026-10-12T07-45-04.db` (69 MB, `integrity_check` ok). Baseline: 32,405 tracks,
  14,123 albums (all with tracks), 6,682 artists, 8 favorites, 3 playlist entries, 299 plays, 0 less-often, 0 edited
  tracks, 29 migrations. `deploy.sh` takes its own pre-deploy copy as well.
- [x] Deployed 2026-10-12 ~15:50 with `bd5efce` (pushed by the other agent along with box 25's `deb4211`). `0030` applied;
  app healthy. Checked read-only right after: 14,123 albums, all still pre-0030 (no scan yet), 8 favorites, 3 playlist
  entries, 301 plays (299 at the backup, people listening).
- [ ] After the first scan (12 h after boot, or an admin's scan): album count before and after, favorites/playlist/history row counts unchanged.
- [ ] Owner checks: a compilation is one album under Various Artists, a two-disc album plays in disc order, Genres
  browse works, on web and phone; an album downloaded before the update still opens.
- [ ] CHANGELOG, FUNCTIONLOG, STATUS, roadmap boxes ticked.

## Risks

- **A scan on smol regroups the whole library at once**, the first time the new code runs. There is no "dry run" in
  the scanner. The Phase 1 measurement is the dry run: it says how many albums will merge before anything ships.
- **Bad tags make it worse, not better.** A file with a wrong `albumartist` will now move. The measurement should list
  the albums that change so the owner can spot surprises.
- **Room sync and the persisted queue** hold track ids, not album ids, so they are not affected.

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-10-12 | Plan | Plan written | v0.4 chosen (A147), box 24 | — |
| 2026-10-12 | Structure | Migration split: `0030` is albums only (rebuild, folder, artist_from_tracks, merged_into_id); disc and genre columns come with boxes 26-27 | Keeps each box shippable on its own | Yes |
| 2026-10-12 | Structure | Album detail tracks gained `artistId`/`artistName`, artist detail `appearsOn`, artist lists count only playable albums and include album-only artists, all in box 25 | Regrouping alone would have emptied featured artists' pages and inflated album counts with redirect rows | Yes |
| 2026-10-12 | Plan | Album key gains the album folder (rule 1b) | smol run: generic titles under one album artist would merge unrelated albums | Yes, extends rule 1 and A148's folder idea |
