# Smart playlists

## Goal

A playlist type that holds rules instead of tracks and refills itself each time it opens, so "not played in 60 days" and
"liked but rarely played" stay current without hand-editing. From the idea pool
([feature-brainstorm.md](../feature-brainstorm.md), "Rule-based smart playlists").

**Done when:** on the phone and in the browser, the owner builds "not played in 60 days" and "liked but rarely played"
with the rule builder, sees the right songs, and plays, shuffles and downloads them like any playlist.

## Not doing

- Public or shared smart playlists (A210, private only).
- Audio-analysis rules such as "high energy" (needs audio analysis, a separate problem).
- Star ratings or other new data. Rules use what is already stored.
- Navidrome `.nsp` file import.
- Turning an ordinary playlist into a smart one, or the reverse. "Save as playlist" copies the current results out.

## Decisions

- A207 (rule builder, not presets), A208 (my plays only), A209 (backend, web and Android together)
- A210 (smart playlists are private only), A211 (disliked songs excluded unless a rule asks)

## Design

Storage is one nullable column, `playlists.rules` (JSON, versioned). NULL is an ordinary playlist, so list, detail,
rename, delete, cover and Android downloads keep working. Only the track source changes.

```json
{ "v": 1, "match": "all", "rules": [
    { "field": "lastPlayed", "op": "olderThanDays", "value": 60 },
    { "field": "liked", "op": "is", "value": true },
    { "field": "myPlays", "op": "lt", "value": 3 } ],
  "sort": "random", "limit": 100 }
```

| field | ops | source |
|---|---|---|
| `myPlays` | `lt`, `gt`, `eq` | per-user count over `play_history`, `skipped = 0` (as `PLAYED_ONLY`, `db/listeningStats.ts:93`) |
| `lastPlayed` | `olderThanDays`, `withinDays`, `never` | `MAX(played_at)` from the same count |
| `dateAdded` | `withinDays`, `olderThanDays` | `tracks.date_added` |
| `liked` / `disliked` | `is` | `favorites` / `less_often` for the user |
| `genre` | `is`, `isNot` | `track_genres` + `genres` |
| `artist` | `is`, `contains` | artist name |
| `year` | `lt`, `gt`, `eq` | `albums.year` |
| `duration` | `lt`, `gt` | `tracks.duration` (seconds) |

- `match`: `all` or `any`. Sort: `random`, `lastPlayedAsc`, `myPlaysDesc`, `myPlaysAsc`, `dateAddedDesc`, `title`.
  Limit 1 to 500, default 100. At most 10 rules.
- Always excluded: hidden and missing tracks. Disliked tracks too, unless a rule names `disliked` (A211).
- A fixed map turns each field and op into a SQL fragment. Values are bound parameters. Bad input is a 400.

API: `POST /playlists` and `PATCH /playlists/:id` take `rules`; new `POST /playlists/smart/preview` returns
`{trackCount, tracks}`; track add, remove and reorder on a smart playlist return 409; `isPublic: true` returns 400;
`POST /playlists/:id/copy` freezes the current results into an ordinary playlist.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Decisions, rule format, API shape, docs | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Migration, evaluator, routes, tests | Done | [Phase 2](#phase-2-structure) |
| 3. Interior | Web editor and detail, Android editor and detail | Done; web seen running, Android not | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Use it on web and phone, docs, release | In progress (web done, phone not, docs done) | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

- [x] Owner decisions A207, A208, A209 logged
- [x] Open questions Q203 and Q204 asked and answered (now A210, A211)
- [x] Rule format and API shape written down
- [x] Brainstorm row links here, STATUS.md row added

## Phase 2: Structure

- [x] Migration `0038_add_playlist_rules.sql`; `database-schema.md` updated
- [x] `backend/src/db/smartPlaylists.ts`: `checkRules`, `evaluateRules`
- [x] `getPlaylistDetail` and `listPlaylistsForUser` handle smart playlists (`isSmart`, `rules`, track count, cover)
- [x] Routes: create and patch with rules, preview, 409 on track edits, copy freezes, public rejected
- [x] Tests: each field and op, all vs any, exclusions, bad input, route cases (`cd backend && npm test`)

## Phase 3: Interior

Web
- [x] `SmartRules`, `isSmart`, `rules` in `frontend/src/types/api.ts`
- [x] `SmartPlaylistEditor.tsx` with live preview
- [x] "New smart playlist" on `PlaylistsPage`, smart marker on `PlaylistListItem`
- [x] `PlaylistDetailPage`: hide remove and reorder, add "Edit rules" and "Save as playlist"
- [x] `tsc -b` and `npm run lint` pass (`npm run build` itself not run)

Android
- [x] DTOs, `ApiService`, `ProfileRepository`
- [x] `SmartPlaylistSheet.kt` (a `SkinSheet`) and `SmartRules.kt` with `SmartRulesTest`
- [x] "New smart playlist" tile, detail screen changes
- [x] `./gradlew assembleDebug` passes

## Follow-ups done

- [x] Random order steady for a day; labelled on both clients
- [x] Offline download drift: settled by the steady order, same behaviour as an edited ordinary playlist
- [x] List cost: light summary, kept 5 minutes, covering index (migration 0039)

## Phase 4: Walkthrough

- [x] Both example playlists built and checked on web (Playwright, throwaway DB, 12 of 12 steps, 2026-10-18)
- [ ] Same on the phone, including an offline download
- [x] CHANGELOG, FUNCTIONLOG, STATUS, `android/release-notes/v0.4.22.md` drafted
- [ ] Web version bump and "What's new" entry, at release time

## Change log

- 2026-10-18: plan approved (A207-A209).
- 2026-10-18: rough edges fixed (steady random, list cost, migration 0039); 680 backend tests pass.
- 2026-10-18: web walkthrough passed in a browser (12 of 12).
- 2026-10-18: Android built; `assembleDebug` and 175 unit tests pass; not run on a phone.
- 2026-10-18: backend done (671 tests pass). Web built; not opened in a browser, so the editor layout and the preview are unchecked.
