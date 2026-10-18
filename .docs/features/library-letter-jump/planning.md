# Library letter jump (web)

## Goal

Jump to any letter in the web library at once, and stop the page from loading and keeping every song you scroll past.
The server is not the slow part (a 200-song page takes 11 to 58 ms at 50,000 songs); the web only loads in order and
its letter rail only knows the songs already loaded. Android already jumps through `GET /browse/letters`.

**Done when:** in the browser, tapping Z on the rail lands on the Z songs after a handful of requests, scrolling back up
works, and a library with missing songs keeps every letter on the right song.

## Not doing

- Android (it already has this).
- Keeping the first page in the browser between visits, a 304 "nothing changed" check, keyset paging.
- The Full table view (no rail).

## Decisions

- A212 (load only what is on screen), A213 (missing songs stay in the web list, letter positions get an option)
- Q205 (open: how much queues on Play after a jump)

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Approach, decisions, docs | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | `missing` option on the letters endpoint, test | Done | [Phase 2](#phase-2-structure) |
| 3. Interior | Page loading, windowed `ArcadeSelect`, rail from server letters, Play | Done | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Browser check on a throwaway library, docs | Done (50k-song browser run and a real phone not done) | [Phase 4](#phase-4-walkthrough) |

## Phase 1: Plan

- [x] Measured the server (11 to 58 ms a page at 50k songs, count 7 ms)
- [x] Found the existing `/browse/letters` endpoint and that only Android uses it
- [x] A212, A213 logged; Q205 logged with its assumption

## Phase 2: Structure

- [x] `getLetterIndex(scope, { missing })`
- [x] `?missing=all` on `GET /browse/letters`
- [x] Test: offsets match `/tracks?...&missing=all` with a missing song seeded; default unchanged

## Phase 3: Interior

- [x] `useLetterIndex`, `letterAtIndex`, `letterEntry` (`lib/letterIndex.ts`), types
- [x] `LibraryPage`: pages near the selection by `useQueries`, `total`, `getTrack`, loaded pairs, Play queue (Q205)
- [x] `ArcadeSelect`: windowed rows, skeleton rows, `total` everywhere, "N of total", letter typing from offsets
- [x] `AlphabetIndex`: server letters, dimmed empty ones, highlight from offsets
- [x] `tsc -b` and `npm run lint` pass

## Phase 4: Walkthrough

- [x] Playwright on a throwaway library (about 1,500 songs, some missing, some non-English)
- [x] CHANGELOG, FUNCTIONLOG, STATUS, capability-map

## Change log

- 2026-10-18: plan approved (A212, A213).
- 2026-10-18: tried on a copy of the real local database (12,759 songs): jumps 26 to 300 ms, migrations 0018 to 0039 applied cleanly to the copy.
- 2026-10-18: built; browser walkthrough 10 of 10 on a throwaway 1,450-song library. The rail's `letterOffset` helper became `letterEntry`.
