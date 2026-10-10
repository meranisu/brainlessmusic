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
| 1. Plan | This doc; owner answers Q61–Q66 | In progress | [Phase 1](#phase-1-plan) |
| 2. Stats backend | Per-user stats endpoint; full listening time | Not started | [Phase 2](#phase-2-stats-backend) |
| 3. Profile screen | Header, top songs/artists, liked, less often, playlists | Not started | [Phase 3](#phase-3-profile-screen) |
| 4. Genres | Genre column, scanner, re-scan, genre stats and the Genres tab | Not started | [Phase 4](#phase-4-genres) |
| 5. Your mix | Curated mix from listening habits | Not started | [Phase 5](#phase-5-your-mix) |
| 6. Wrapped | Yearly recap as a swipeable story | Not started | [Phase 6](#phase-6-wrapped) |
| 7. Walkthrough | On a phone, empty states, guests, speed | Not started | [Phase 7](#phase-7-walkthrough) |

Each phase ships on its own (debug build, then release, per the standing rule). Phases 2 and 3 are the core; 4–6
can follow in any order.

---

## Phase 1: Plan

- [x] Survey what exists (table above)
- [ ] Owner answers [Q61](../../QUESTIONS.md)–Q66

## Phase 2: Stats backend

- [ ] `GET /me/stats?range=all|year|month|week`, accounts only: total plays, total listening time, top songs (plays
      and time each), top artists, top albums, counts of liked / less often / playlists. One query per list over
      `play_history` (indexed on `user_id, played_at`), grouped by `track_id`.
- [ ] Per-song detail, `GET /me/stats/tracks/:id`: plays, time listened, first and last play.
- [ ] `GET /me/less-often` with track summaries (today only ids exist).
- [ ] Full listening time (depends on Q62): the app keeps counting after the threshold and, when the track ends or is
      skipped, sends the final amount. Backend: `PATCH` the play's `ms_played` (the scrobble returns the history id),
      or a second endpoint. Old plays keep their partial value or get estimated, per Q62.
- [ ] Tests for each, through `npm test`; route-gate table in `guestAccess.test.ts`.

## Phase 3: Profile screen

- [ ] Where it lives (Q61).
- [ ] Header: username, member since, total plays and hours.
- [ ] Top songs and top artists, with a range switch (week / month / year / all time). Each song shows plays and time.
- [ ] Liked songs: list and play. Needs a heart on Now Playing to like a song from the phone at all (Q65).
- [ ] Songs you hear less: list, with undo per song (replaces needing the queue to see them).
- [ ] Playlists: list and play (Q65 for create and edit).
- [ ] Empty states for a new account, and the guest line.

## Phase 4: Genres

- [ ] Migration: `genres` table plus `track_genres` (a file can carry several), or a single `tracks.genre` column.
      Decide in this phase from what the library's tags actually look like.
- [ ] Scanner reads the genre tag (`music-metadata` `common.genre`); a full re-scan fills existing tracks.
- [ ] Genre stats in `/me/stats`; the Library's Genres tab comes alive.
- [ ] Owner deploys and re-scans on smol (ask first).

## Phase 5: Your mix

- [ ] Server builds the mix (Q63): your most played and most recent songs, plus songs by the artists you play most
      that you haven't played much, never anything marked less often. About 50 songs.
- [ ] Shown on the profile with a play button; plays through the normal queue.

## Phase 6: Wrapped

- [ ] `GET /me/wrapped/:year`: top songs, artists, genres, total minutes, busiest month, a song you found this year,
      longest listening day.
- [ ] Full-screen story cards, tap or swipe through, in the app's colours and motion (DESIGN.md).
- [ ] When it appears (Q64). No sharing to outside services: sharing links are out of scope.

## Phase 7: Walkthrough

- [ ] Tried on a phone, with a real account's history.
- [ ] A brand-new account and a guest both look right.
- [ ] `/me/stats` stays fast on a large history.
- [ ] CHANGELOG, FUNCTIONLOG and schema doc updated in each phase's commit.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-10-11 | Plan | Created | Owner's idea | Yes |
| 2026-10-11 | All | A61–A64 answered, phases updated | Owner took every recommendation | Yes |
