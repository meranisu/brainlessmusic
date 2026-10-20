# Listening stats dashboard

## Goal

A full stats view of your own listening on web and Android: totals with change, trend over time, when you listen (hour and
weekday), streaks, top songs, artists, albums and genres, and recently played.

**Done when:** on the web and on the phone, the owner opens Stats, switches between week, month, year and all time, and the
busiest hour matches when they actually listen (local time, not UTC).

## Not doing

- Other people's patterns on their profiles (A230)
- Skin-specific Stats looks on Android; Standard look only
- A chart library; bars are hand-drawn (SVG on web, Compose `Canvas` on Android)
- Year-in-review, on-this-day (separate brainstorm rows)

## Decisions

- A37 (guests have no history), A227 (web: overflow menu), A228 (Android: separate screen from Home), A229 (weekly bars
  for all time), A230 (own only).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Data source, API shape, timezone handling | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Backend: `GET /me/stats/patterns`, `topGenres` on `/me/stats`, tests | Done | [Phase 2](#phase-2-structure) |
| 3. Interior | Web `/stats` page; Android Stats screen | Done (Android not phone-tested) | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Real-DB copy check, phone check, docs, release | In progress | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

- [x] Data: `play_history` only. `played_at` is UTC text; index `(user_id, played_at)` covers the range read. No migration.
- [x] Plays count played-only (`PLAYED_ONLY`); time listened uses `LISTENED_MS` (`backend/src/db/listeningStats.ts`).
- [x] Timezone: the client sends an IANA `tz`; the server buckets in JS with `Intl.DateTimeFormat` so DST is right.
  Missing or invalid `tz` falls back to UTC, never a 400.
- [x] API shape:
  `GET /me/stats/patterns?range=week|month|year|all&tz=Area/City` →
  `{ range, tz, bucket: 'day'|'week', byHour[24], byWeekday[7] (Mon first), trend[], streak, busiest }`.
  `streak` is `{ current, longest, longestEndedOn }` in local days, always over all time.

## Phase 2: Structure

- [x] `getListeningPatterns(userId, range, tz)` in `backend/src/db/listeningStats.ts`
- [x] Route in `backend/src/routes/stats.ts`, `[authenticate, requireAccount]`, same range check as `/me/stats`
- [x] `topGenres` added to `/me/stats`
- [x] Tests `backend/src/routes/listeningPatterns.test.ts`: tz shifts the hour, DST day, skips not plays, zero-fill,
  streak across a gap, guest 403, bad tz falls back to UTC

## Phase 3: Interior

Web:
- [x] `frontend/src/pages/StatsPage.tsx` at `/stats` inside `<RequireAccount>`, overflow nav entry (A227)
- [x] Range switch drives `/me/stats` and `/me/stats/patterns`
- [x] Sections: totals and streak, trend (plays/minutes toggle), hour and weekday bars, top lists, recently played
- [x] Check at phone width

Android:
- [x] `ui/stats/StatsScreen.kt` + `StatsViewModel.kt`, route in `BrainlessNavGraph.kt`, "See all" on the Home stats card (A228)
- [x] DTO + `ApiService` for `/me/stats/patterns`
- [x] Same sections, Standard look

## Phase 4: Walkthrough

- [x] Web `/stats` against a copy of the real DB; busiest hour looks right in local time
- [ ] Phone over adb: open Stats from Home, switch ranges
- [x] CHANGELOG, FUNCTIONLOG, brainstorm row, STATUS, Android release notes, web changelog if the version moves

## Change log

- 2026-10-20: plan approved in plan mode and saved here.
- 2026-10-20: built. Changes from the plan: the response field is `trend`, not `daily`. On Android the patterns call may
  fail without hiding the rest (an older server has no such endpoint). Found and fixed: profile Top songs overflowed a
  phone's width. Open: phone walkthrough, Android release notes when tagged.
