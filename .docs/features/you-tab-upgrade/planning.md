# You tab upgrade (Android)

## Goal

Make the You tab feel like a rhythm-game player profile (DESIGN.md identity) and surface what the server already knows:
recent plays, per-song numbers, and how this period compares with the last. Picks: A91.

## Phase Overview

| Phase | What it covers | Status |
|---|---|---|
| 1 | Recently played, song stats in Details, Play all / Shuffle, song menu on top songs | Built 2026-10-11, not tried on a phone |
| 2 | Player card header, #1 large, leaderboard ranks | Built 2026-10-11, not tried on a phone |
| 3 | Rank changes and the listening delta (backend + app) | Built 2026-10-11, not tried on a phone |
| 4 | Walkthrough on a phone with a real history | Not started |

## Phase 1: Surface what exists

- [x] Recently played row: `GET /me/history`, distinct songs, missing files skipped (`ProfileRepository.recentlyPlayed`).
      History rows now carry `albumId` and `missing` (`backend/src/db/plays.ts`, `listHistoryForUser`).
- [x] Song menu → Details shows your plays, time listened, first and last play (`GET /me/stats/tracks/:id`). Works
      from every screen with the song menu, not only You.
- [x] Play / Shuffle buttons on the Top songs heading.
- [x] Long press on top songs, the #1 card and recent covers opens the song menu (with Go to album).

## Phase 2: Look

- [x] Player card: square-cornered initial, name, then listening time, plays and songs large in Barlow Condensed.
- [x] #1 song as a hero row with a 120 dp cover and "#1" in the accent.
- [x] Ranks in the display face at a fixed width so titles line up; the top 3 in full ink.

## Phase 3: Rank changes

- [x] `/me/stats` adds `previousTotals` and per-song / per-artist `previousRank` for week, month and year, against the
      window just before (same length). All time gets `previousTotals: null` and no `previousRank`.
- [x] App shows ▲n / ▼n / NEW under each rank (up and new in the accent), and "2 h more than the 7 days before" on the card.
- [x] Tests: `routes/listeningStats.test.ts` (backend), `YouStatsTest.kt` (app).
- [ ] Owner deploys the backend to smol (ask first). Until then the app shows no arrows and no delta, and Recently
      played has no Go to album (old servers don't send the new fields).

## Phase 4: Walkthrough

- [ ] Tried on a phone: new account, a week with history, all time, offline, guest.
- [ ] Light and dark theme, and a long username.

## Change Log

- 2026-10-11: plan written after the owner took the recommended picks (A91).
