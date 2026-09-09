## Goal

Given a set of track IDs (playlist, album, library-wide, anything), return them reordered so the same artist doesn't play back-to-back wherever mathematically possible. This is the one shuffle variant that needs the server — it requires knowing artist relationships across the whole set, unlike plain shuffle/repeat which are pure client-side queue reordering (see note below).

Out of scope: plain repeat/shuffle (Android, client-side), any "avoid same album"/genre-diversity logic beyond artist adjacency.

## Phase Overview

| Phase | What it covers | Status | Est. Duration | Checklist |
|---|---|---|---|---|
| 1. Data Access | Batch artist_id lookup for a set of track ids | Done | — | [Phase 1](#phase-1-data-access) |
| 2. Shuffle Algorithm | Pure reorder function, group + greedy interleave | Done | — | [Phase 2](#phase-2-shuffle-algorithm) |
| 3. Endpoint | `POST /shuffle` | Done | — | [Phase 3](#phase-3-endpoint) |
| 4. Verification | Manual end-to-end against real library, `STATUS.md` update | Done | — | [Phase 4](#phase-4-verification) |

**Status values:** `Not started` → `In progress` → `Blocked` → `Done`.

---

## Phase 1: Data Access

- [x] `findTracksByIds(ids)` (`src/db/library.ts`) — single `WHERE id IN (...)` query, not N+1
- [x] Unknown track IDs: reject the whole request with `404` (simpler and safer for v1, per resolved decision below) rather than silently dropping them

**Done when:** a batch of real track IDs resolves to correct artist IDs in one query. ✅ confirmed via manual curl against the real 20-track library.

## Phase 2: Shuffle Algorithm

- [x] `smartShuffle()` (`src/services/shuffle.ts`) — pure function, no DB/HTTP dependency, input `{ trackId, artistId }[]`, output `trackId[]`
- [x] Approach: group by artist, then greedily interleave by always placing next from the largest remaining group that isn't the artist just placed (the standard "reorganize string" algorithm) — guarantees zero adjacent same-artist pairs unless one artist exceeds half the set, in which case it hits the mathematical minimum rather than just reducing violations informally
- [x] Randomization: input is pre-shuffled before grouping, so both within-group order and tie-breaks between equal-size groups vary between calls
- [x] `artist_id IS NULL` tracks grouped together as their own bucket (not scattered as singletons) — consistent with treating "no artist" as one logical group

**Done when:** unit tests confirm zero same-artist adjacency on balanced distributions and minimal (mathematically unavoidable) violations on skewed ones. ✅ `src/services/shuffle.test.ts`, 7 tests, `npm test` — includes an exact-minimum-violations assertion (10-vs-2 split → exactly 7 forced adjacent pairs, matching the `2m - n - 1` formula) and a 10-run randomization check.

## Phase 3: Endpoint

- [x] `POST /shuffle` (auth required, for consistency with the rest of the API even though the operation is stateless)
- [x] Request body: `{ trackIds: number[] }` — same convention as the existing playlist reorder endpoint (`PATCH /playlists/:id/tracks/reorder`), not the loose `string[]` from the original plan sketch
- [x] Response: `{ tracks: [...] }` reusing the existing lean track-summary shape (`getTrackSummariesByIds()`, batch query, `src/db/browse.ts`) — same shape as `GET /tracks`/upload/favorites, so the client can render immediately with no follow-up fetch
- [x] Errors: empty/missing/non-integer `trackIds` → `400`; any unknown track id → `404` with `{ error, missing: [...] }`; unauthenticated → `401`

**Done when:** a real client-shaped request (all track IDs from a playlist) returns a valid reordered response. ✅ confirmed manually.

## Phase 4: Verification

- [x] Shuffled the full real 20-track library (19 tracks from one artist + 1 from another, uploaded earlier as upload-endpoint test data) — result correctly isolated the single minority-artist track as the one adjacency break, hitting the exact theoretical minimum (17 forced same-artist pairs for a 19-vs-1 split: `2×19 - 20 - 1 = 17`)
- [x] Shuffled a single-artist-only subset (5 tracks, one artist) — returned a valid randomized order, no error, as expected when zero-adjacency isn't achievable
- [x] Shuffled an artificially skewed set (10 tracks artist A + 2 artist B) at the unit-test level — confirmed exactly 7 violations (the mathematical minimum), not just "some" violations
- [x] Repeated identical requests — confirmed different track orderings each time (within-group shuffling), not deterministic
- [x] Confirmed empty `trackIds` → `400`, missing body → `400`, unknown track id → `404` with the missing id listed, unauthenticated → `401`
- [x] `.docs/STATUS.md` updated

All verified manually against the real running backend (temp registered/logged-in user, removed after) and via `npm test` for the algorithm-level edge cases (balanced/skewed/single-artist/null-artist/empty-input/randomization) that aren't practical to construct from the real library alone.

---

## Resolved decisions (were flagged in the original plan)

- **Access scope:** no per-track ownership model exists anywhere in this API (every track is visible to every authenticated user via `GET /tracks`/search/browse) — `/shuffle` just requires auth, same as browsing, not a new ownership layer.
- **Schema:** confirmed `tracks.artist_id` is a single nullable FK (`migrations/0002_create_library.sql`) — no many-to-many artist credit table exists, so grouping is a direct 1:1 keyed by `artist_id`.
- **Response shape:** the existing lean `TrackSummary` (`src/db/browse.ts`) already carries `artist` (name), so no shape extension was needed — reused as-is, same as favorites did.
- **Tie-breaking:** left arbitrary/randomized (see Phase 2) — a deterministic tie-break would reduce variety across repeated shuffles for no benefit.
- **`trackIds` request type:** `number[]`, not the plan sketch's `string[]` — matches the existing `PATCH /playlists/:id/tracks/reorder` convention exactly.

## Client-side note: plain repeat & shuffle

Not part of this backend feature — basic repeat-one, repeat-all, and a plain (non-smart) shuffle toggle are pure client-side queue operations (Android, per `.docs/process/android-phased-plan.md`, likely alongside Phase 2's basic queue or Phase 4 polish). No server endpoint needed for those; `/shuffle` here is just one more way the client can populate its local queue.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-03 | Verification (post-hoc) | Added a "Smart Shuffle" button to `library-player.html` wired to `POST /shuffle` | Not in the original plan (backend-only), but requested afterward as a manual-verification aid — matches the existing pattern of every feature getting a manual test-harness hook | Yes — endpoint/response shape from Phase 3 didn't change, only the test harness consuming it |
