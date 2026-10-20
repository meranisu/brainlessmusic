# On this day

## Context
Brainstorm row (`.docs/features/feature-brainstorm.md:60`) is marked Partial: Rediscover shuffle exists, but nothing shows "what you played on this date in past years". Goal: a card on web home and Android You screen listing songs played on today's local month/day in earlier years, grouped by year, playable.

## Backend
- New `backend/src/db/onThisDay.ts`: `getOnThisDay(userId, tz, now = Date.now())`.
  - Resolve tz with `resolveTimeZone` (`db/listeningStats.ts:327`); get today's local Y-M-D.
  - For each earlier year back to the user's first play (`MIN(played_at)`), compute that local day's UTC start/end window and query `play_history` with `user_id=? AND skipped=0 AND played_at >= ? AND played_at < ?`, grouped by `track_id`, ordered by play count then first play. Uses existing index `idx_play_history_user_played_at`, so no migration.
  - Feb 29: in non-leap years, use Feb 28.
  - Cap at 20 tracks per year; skip empty years.
- Route `GET /me/on-this-day?tz=` in `routes/stats.ts` (same auth plus `requireAccount` as `/mix/daily`). Response: `{ date: "MM-DD", years: [{ year, yearsAgo, tracks: TrackSummary[] }] }`, with tracks built through `getTrackSummariesByIds` (`db/browse.ts`) in order.
- Tests: `backend/src/routes/onThisDay.test.ts`, in the `listeningPatterns.test.ts` style (`playAt`). Cases:
  - plays matched by local date, not UTC (a tz edge case)
  - skips excluded
  - today's year excluded
  - Feb 29 fallback
  - guest rejected
  - another user's plays not leaked
  - empty response when there is no history

## Web
- `frontend/src/lib/onThisDay.ts` fetch, plus types in `types/api.ts`, using react-query. tz comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- `frontend/src/components/OnThisDay.tsx`: the section titled "On this day". One row per year ("1 year ago", "3 years ago"), with Play and track list. The play action reuses the queue start that `DailyMixes.tsx` uses. Hidden when `years` is empty.
- Mounted in `LibraryPage.tsx` next to `DailyMixes` (:207). Follow DESIGN.md.

## Android
- `ApiService.kt`: `@GET("me/on-this-day") onThisDay(@Query("tz") tz)`, with DTOs in `LibraryDtos.kt` and a repository method in `LibraryRepository.kt`.
- `YouViewModel.kt`: a StateFlow loaded alongside `_mixes`, plus `playYear(year)` that mirrors `playMix`.
- `YouScreen.kt`: a section under the daily mixes row, hidden when empty.

## Docs
CHANGELOG, FUNCTIONLOG, the brainstorm row set to Done, STATUS row, and an Android release-notes line.

## Verification
- `cd backend && npm test` (check idle first, because of the shared test.db).
- `cd frontend && npm run build && npm run lint`.
- `cd android && ./gradlew assembleDebug` (run `free -h` first).
- Web check on :5180 with seeded old plays via Playwright.
- Phone check: not possible here unless adb is attached.

## Owner answers (2026-10-21)
1. Plays only (no "added on this day").
2. Web: next to (after) the daily mixes.
3. 20 songs per year is fine.
