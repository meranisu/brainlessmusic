# Home tab (Android)

## Goal

Turn the You tab into Home, the first tab and where the app opens, leading with something to play and then your
listening stats (A97); guests get a smaller Home (A98).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Order of the page, guests, offline start, navigation anchor | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Routes, start route, tab anchor, shared library shuffle | Done | [Phase 2](#phase-2-structure) |
| 3. Interior | Home layout, guest Home, greeting | Done | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Build, unit tests, use it on a phone | In progress | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

- [x] Page order (A97): greeting, Shuffle my library, Recently played, library tiles (A96), range picker, player card,
      Top songs, Top artists.
- [x] Guests (A98): greeting and Shuffle my library, plus a line saying stats need an account.
- [x] Offline start still opens Downloads, on top of Home instead of on top of Library.
- [x] No backend change: Home reuses `/me/stats`, `/me/history` and `/browse/shuffled` (guests may call the last).

## Phase 2: Structure

- [x] `Routes.YOU` becomes `Routes.HOME` (`"home"`); Home replaces Library as the anchor every tab pops back to
      (`navigateToTab`, the offline banner, the start route, login, logout).
- [x] Tabs: Home, Library, Search, Downloads, Settings.
- [x] The library shuffle moves out of `LibraryViewModel` into `LibraryShuffle`, shared by Library and Home, and says
      so when the server can't be reached (it was silent).

## Phase 3: Interior

- [x] The greeting and Shuffle my library show at once; the stats below load, fail or refresh on their own.
- [x] Guest Home.

## Phase 4: Walkthrough

- [x] `./gradlew compileDebugKotlin :app:testDebugUnitTest`
- [ ] On a phone: cold start lands on Home; every tab's back returns to Home; offline start opens Downloads; a guest
      sees the smaller Home; Shuffle my library plays.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-10-11 | Interior | The greeting is the top bar title, not a header under it | A "Home" title with a greeting right below says the same thing twice | Yes |
| 2026-10-11 | Interior | Order is now Shuffle, card, library tiles, range picker, Recently played, Top songs, Top artists | Owner asked after using it on the phone | Yes, Shuffle still leads |
| 2026-10-11 | Interior | Shuffle becomes a small top bar button | Owner: the full-width button took too much room | Yes, still one tap from Home |
| 2026-10-11 | Interior | Guest Home gets a card with the library's song, album and artist counts, plus "Songs to try" and "Albums to try" rows picked at random (pull or New picks rerolls) | Owner: the guest Home felt bare with only the note | Yes, still no stats for guests (A98) |
