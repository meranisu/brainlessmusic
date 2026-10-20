# Library list cache

## Goal

Make the library list show at once and, on Android, browse with no signal, by keeping a copy of it on the client.

**Done when:** on the phone with mobile data off, the owner opens the app, scrolls the whole Songs list and jumps by letter
without a wait or an error; on the web, the list shows before the server answers.

## Background

On production a request that does no work takes 0.20 to 1.03 s through the Cloudflare tunnel (5 tries of `/api/health`,
2026-10-20). The server's own time for a page is 25 to 125 ms at 12,759 songs (2026-10-18, not on smol). The trip is the
wait, so only a copy already on the client removes it.

## Not doing

- Offline playback of songs that are not downloaded or cached. That stays with Downloads and the song cache.
- A saved copy of playlists, search results or a filtered Songs list.

## Decisions

- [Q220](../../QUESTIONS.md#q220--android-whole-library-copy-room) (open): build the whole-library Room copy on Android?
- [Q221](../../QUESTIONS.md#q221--304-nothing-changed-check) (open): build the 304 "nothing changed" check?

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. First page on the client | Web: first 3 pages in `localStorage`; Android: first page of Songs, Albums, Artists on disk; "Updating…" note | Built 2026-10-20, uncommitted | [Phase 1](#phase-1-first-page-on-the-client) |
| 2. Android whole-library copy | Room table of every song, album and artist, synced from the server | Not started (waits on Q220) | [Phase 2](#phase-2-android-whole-library-copy) |
| 3. 304 check | Server library version; `If-None-Match` on list pages | Not started (waits on Q221) | [Phase 3](#phase-3-304-check) |
| 4. Walkthrough | Phone and browser checks, release | Not started | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: First page on the client

- [x] Web: `frontend/src/lib/libraryPageCache.ts`, wired into `pageQuery` in `LibraryPage.tsx`; cleared on logout
- [x] Web: "Updating…" / "Couldn't refresh" in the list footer; a failed refresh keeps the saved list
- [x] Android: `data/paging/SavedFirstPage.kt` (`LibraryPageStore`, `SavedFirstPage`); reload only when the page differs
- [x] Android: chip over the list in `PagedContent`; files deleted on logout and on a refused session
- [x] Web checked in Chromium on a copy of the dev DB (saved copy, reload, logout). Android: compiles only
- [ ] Commit and push

## Phase 2: Android whole-library copy

Sketch, to settle before building:

- [ ] Room tables `library_track`, `library_album`, `library_artist` with the fields the list rows show, plus `hidden`,
      `missing` and a sort key matching the server's (`title` collation must match, or the letter rail lands wrong)
- [ ] Sync: full download in 200-row pages on first open (12,759 songs is about 64 requests); afterwards a changes-since
      call, which needs a new server endpoint (`GET /library/changes?since=<version>`) and a version bumped by every write
      path (scan, tag edit, hide, delete, upload)
- [ ] Paging from Room (`PagingSource` from the DAO) instead of `OffsetPagingSource`; letter offsets from a local query
- [ ] Storage: about 10 MB per 50k songs; cleared on logout; a "library copy" size line in Settings
- [ ] Tests: backend tests for the changes endpoint and version bumps (`cd backend && npm test`)

## Phase 3: 304 check

- [ ] A `library_version` counter (new migration; update `database-schema.md`) bumped by the same write paths as Phase 2
- [ ] List routes send `ETag` built from version, user and query; answer `If-None-Match` with 304
- [ ] Clients send the stored ETag with the saved first page
- Expected gain is small: a 304 still makes the 0.2 to 1 s trip, and pages are already compressed. Shares the version
  counter with Phase 2, so it is cheapest built together with it, if at all.

## Phase 4: Walkthrough

- [ ] Web on production: list shows at once on a second visit; note appears and goes
- [ ] Phone: app restart shows the list at once; chip appears and goes; logout leaves no saved files
- [ ] Phone, Phase 2 only: mobile data off, whole list scrolls and letter jumps work
- [ ] Android release notes and tag

## Change log

| Date | Change |
|---|---|
| 2026-10-20 | Plan written after Phase 1 was built; Phases 2 and 3 added at the owner's request, pending Q220 and Q221 |
