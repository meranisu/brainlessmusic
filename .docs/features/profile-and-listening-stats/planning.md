# Profile and listening stats (Android)

## Goal

A Profile screen in the Android app that shows the signed-in account: its playlists, liked and "less often" songs,
what it listens to most and for how long, by genre, a mix made from its habits, and a once-a-year Wrapped.

Owner's idea, 2026-10-11. Year-in-review sat in the backlog (`feature-brainstorm.md`, "Local year in review"); the
owner asked for it directly, so it's planned here. It isn't a roadmap box yet.

## What exists today (checked 2026-10-11)

| Wanted | Backend | Android |
|---|---|---|
| 1. Playlists | CRUD at `/playlists` (`routes/playlists.ts`) | none |
| 2. Most listened songs | `GET /stats/top-tracks` is **server-wide** (`tracks.play_count`, every user), not per person | none |
| 3. Liked songs | `favorites`, `/me/favorites` (`routes/favorites.ts`) | no heart button, no list |
| 4. Disliked songs | `less_often` (A60, migration `0019`): ids only, `/me/less-often/ids` | swipe right in the queue only |
| 5. Genres | **nothing**: no column, the scanner doesn't read the tag (A22) | Genres tab says "not available yet" |
| 6. Curated mix | nothing; shuffle exists (`/browse/shuffled`, smart shuffle) | none |
| 7. Time listened per song | `play_history.ms_played`, but the app sends it **once, when half the song (max 4 min) has played** (`ListenTracker.kt:9-13`), so it under-counts | none |
| 8. Plays per song | `play_history` rows per user and track | none |
| 9. Wrapped | nothing | none |

Guests are listen-only (A37) and send no plays (`LibraryRepository.scrobble`), so they have nothing to show. A guest
sees one line saying a profile needs an account.

History only goes back to when `play_history` started being written (migration `0004`), so the first Wrapped covers
part of a year.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | This doc; owner answers Q61–Q66 | Done | [Phase 1](#phase-1-plan) |
| 2. Stats backend | Per-user stats endpoint; full listening time | Done (web reporting in Phase 7) | [Phase 2](#phase-2-stats-backend) |
| 3. Profile screen | Header, top songs/artists, liked, less often, playlists | Built (CI); not tried on a phone | [Phase 3](#phase-3-profile-screen) |
| 4. Genres | Genre column, scanner, re-scan, genre stats and the Genres tab | Not started | [Phase 4](#phase-4-genres) |
| 5. Your mix | Curated mix from listening habits | Not started | [Phase 5](#phase-5-your-mix) |
| 6. Wrapped | Yearly recap as a swipeable story | Not started | [Phase 6](#phase-6-wrapped) |
| 7. Web | Profile page, mix and Wrapped on the web (A66) | Not started | [Phase 7](#phase-7-web) |
| 8. Walkthrough | On a phone and the web, empty states, guests, speed | Not started | [Phase 8](#phase-8-walkthrough) |

Each phase ships on its own (Android: debug build, then release, per the standing rule; web: a deploy on smol).
Phases 2 and 3 are the core; 4–7 can follow in any order.

---

## Phase 1: Plan

- [x] Survey what exists (table above)
- [x] Owner answered A61–A64 (2026-10-11): "You" tab; real listening time from the next release; live daily mix;
      Wrapped yearly from December. A65: Android creates and edits playlists. A66: the web gets it all too.

## Phase 2: Stats backend

- [x] `GET /me/stats?range=all|year|month|week`, accounts only: total plays, total listening time, top songs (plays
      and time each), top artists, top albums, counts of liked / less often / playlists. One query per list over
      `play_history` (indexed on `user_id, played_at`), grouped by `track_id`.
- [x] Per-song detail, `GET /me/stats/tracks/:id`: plays, time listened, first and last play.
- [x] `GET /me/less-often` with track summaries (today only ids exist).
- [x] Full listening time (A62), Android: the app keeps counting after the threshold and, when the track ends or is skipped,
      sends the final amount. Backend: `PATCH` the play's `ms_played` (the scrobble returns the history id). Plays
      from before this change count as a full play of the song (their stored `ms_played` stops at the threshold).
- [x] Tests for each, through `npm test`; route-gate table in `guestAccess.test.ts` (`routes/listeningStats.test.ts`).
- [ ] The web player reports final listening time too (moved to Phase 7; until then web plays count as full plays).

## Phase 3: Profile screen

- [x] A fourth bottom tab, "You" (A61), next to Library, Search and Settings.
- [x] Header: username, member since, total plays and hours.
- [x] Top songs and top artists, with a range switch (week / month / year / all time). Each song shows plays and time.
- [x] Liked songs: list and play. Plus a heart on Now Playing and in the song menu (A65).
- [x] Songs you hear less: list, with undo per song (replaces needing the queue to see them).
- [x] Playlists (A65): list and play, create, rename, delete, add a song (song menu and Now Playing), remove and
      reorder songs. All over the existing `/playlists` endpoints, reorder included (`PATCH /playlists/:id/tracks/reorder`,
      `routes/playlists.ts:168`).
- [x] Empty states for a new account, and the guest line.

## Phase 4: Genres

- [ ] Migration: `genres` table plus `track_genres` (a file can carry several), or a single `tracks.genre` column.
      Decide in this phase from what the library's tags actually look like.
- [ ] Scanner reads the genre tag (`music-metadata` `common.genre`); a full re-scan fills existing tracks.
- [ ] Genre stats in `/me/stats`; the Library's Genres tab comes alive.
- [ ] Owner deploys and re-scans on smol (ask first).

## Phase 5: Your mix

- [ ] Server builds the mix, rebuilt daily and play-only, not saved as a playlist (A63): your most played and most recent songs, plus songs by the artists you play most
      that you haven't played much, never anything marked less often. About 50 songs.
- [ ] Shown on the profile with a play button; plays through the normal queue.

## Phase 6: Wrapped

- [ ] `GET /me/wrapped/:year`: top songs, artists, genres, total minutes, busiest month, a song you found this year,
      longest listening day.
- [ ] Full-screen story cards, tap or swipe through, in the app's colours and motion (DESIGN.md).
- [ ] Unlocks in December for that year; past years stay viewable (A64). No sharing to outside services: sharing links are out of scope.

## Phase 7: Web

- [ ] The web player sends final listening time (`PATCH /me/history/:id` with the scrobble's `playId`), like Android.
- [ ] A Profile page on the web over the same endpoints (A66): stats with the range switch, liked, less often (with
      undo), playlists (the web already edits them), your mix, and Wrapped in December.
- [ ] Fits the web's existing nav and look (DESIGN.md); works at phone width.

## Phase 8: Walkthrough

- [ ] Tried on a phone and in the browser, with a real account's history.
- [ ] A brand-new account and a guest both look right.
- [ ] `/me/stats` stays fast on a large history.
- [ ] CHANGELOG, FUNCTIONLOG and schema doc updated in each phase's commit.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-10-11 | Plan | Created | Owner's idea | Yes |
| 2026-10-11 | All | A61–A64 answered, phases updated | Owner took every recommendation | Yes |
| 2026-10-11 | 2 | Built: `/me/stats`, `/me/stats/tracks/:id`, `/me/less-often`, `PATCH /me/history/:id`, migration `0021` (`ms_final`) | Phase 2 | Yes; web reporting moved to Phase 7 |
| 2026-10-11 | 3 | Built: You tab, likes, playlists list and page, add-to-playlist sheet, liked and less-often lists. "Song menu" means the album page's; Library song rows have no menu yet | Phase 3 | Yes |
| 2026-10-11 | 3, 7 | A65: Android edits playlists; A66: web gets a Phase 7, walkthrough moves to 8 | Owner's answers | Yes |
