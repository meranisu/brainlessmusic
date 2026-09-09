## Goal

Record every completed play (scrobble) per-user with enough data to support "recently played" and "most played" later without a schema change — closes the backend gap ahead of the Android playback plan's Phase 4 polish item ("basic playback stats logging hook").

## Phase Overview

| Phase | What it covers | Status | Est. Duration | Checklist |
|---|---|---|---|---|
| 1. Schema | `play_history` table + denormalized `tracks.play_count`/`last_played_at` | Done | — | [Phase 1](#phase-1-schema) |
| 2. Scrobble Endpoint | `POST /tracks/:id/scrobble` | Done | — | [Phase 2](#phase-2-scrobble-endpoint) |
| 3. Read Endpoints | `GET /me/history`, `GET /tracks/:id/history`, `GET /stats/top-tracks` | Done | — | [Phase 3](#phase-3-read-endpoints) |
| 4. Verification | Manual end-to-end against real library, `STATUS.md` update | Done | — | [Phase 4](#phase-4-verification) |

**Status values:** `Not started` → `In progress` → `Blocked` → `Done`.

---

## Phase 1: Schema

- [x] Migration `0004_create_play_history.sql`: `play_history` (id, user_id FK, track_id FK, played_at, ms_played), indexes on `(user_id, played_at)` and `(track_id)`
- [x] `tracks.play_count` (default 0) and `tracks.last_played_at` (nullable) added via `ALTER TABLE`
- [x] Applied cleanly on top of the playlists migration; existing 19 tracks default to `play_count=0`/`last_played_at=NULL`

## Phase 2: Scrobble Endpoint

- [x] `POST /tracks/:id/scrobble` (auth required), optional `{ msPlayed }` body
- [x] Insert `play_history` row + increment `tracks.play_count` + set `last_played_at = now()` in one `db.transaction`
- [x] 404 unknown track, 401 unauthenticated
- [x] No minimum-listen threshold in v1 — every scrobble call counts, repeats included (resolved open item, see below)

## Phase 3: Read Endpoints

- [x] `GET /me/history` — paginated, most-recent-first, caller's own plays only
- [x] `GET /tracks/:id/history` — **shared across all users** (with `username` attribution), not per-user — resolved open item, see below
- [x] `GET /stats/top-tracks` — dedicated endpoint, reuses denormalized `play_count`, no join needed for the sort
- [x] Same pagination helper/shape as `/tracks` etc. (`{ total, limit, offset, ... }`)

## Phase 4: Verification

- [x] Scrobbled real tracks (from the 19-track library) with two real registered users; `play_count`/`last_played_at` updated correctly after each call, including two scrobbles in a row from the same user (no dedup, as intended)
- [x] `play_history` rows correctly attributed per user; `/me/history` isolated per user, `/tracks/:id/history` showed all three plays across both users
- [x] Unknown track → `404` (scrobble and history), unauthenticated → `401` (both endpoints)
- [x] Re-ran `POST /library/scan` after scrobbling — `play_count`/`last_played_at` on the scrobbled track were unchanged (upsert-by-path only touches the columns it explicitly lists)
- [x] Pagination re-verified on `/me/history`: invalid params fall back to defaults, oversized `limit` clamps to 200, short tail page works
- [x] Test users/rows cleaned up afterward
- [x] `.docs/STATUS.md` updated

---

## Resolved open items (were flagged in the original plan)

- **`ms_played` threshold:** skipped entirely for v1 — every scrobble call records a play regardless of `msPlayed`. Revisit if noisy/accidental scrobbles become a real problem once a client exists.
- **`GET /tracks/:id/history` scope:** shared across all users, not per-caller — this is a small personal + friends project, so a shared listening log per track was judged more useful than a private one (unlike playlists, which stay owner-scoped).
- **Dedup/rate-limiting on repeat scrobbles:** still not built, per the original plan — a user scrobbling the same track twice in a row is treated as a legitimate replay. Flagged again here in case it needs revisiting once a real client is driving traffic.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-03 | Phase 3 | Added a dedicated `GET /stats/top-tracks` (the plan's "optional" item) instead of a `?sort=most_played` query param on `/tracks` | Cheaper to reason about and test as its own route; reuses the same denormalized column | Yes — no schema change, plan already anticipated this endpoint shape |
