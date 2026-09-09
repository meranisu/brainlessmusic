## Goal

Let a user star/unstar any track and see their full list of favorites — simple, self-contained, pairs naturally with what's already built (playlists, scrobble/play tracking). Favorites are inherently "mine," so no ownership-check complexity like playlists.

Out of scope: favoriting albums/artists (tracks only, for now), any "favorites influence shuffle/radio" logic (a discovery feature, separate from storing the favorite itself).

## Phase Overview

| Phase | What it covers | Status | Est. Duration | Checklist |
|---|---|---|---|---|
| 1. Schema | `favorites` table, composite PK | Done | — | [Phase 1](#phase-1-schema) |
| 2. Star / Unstar Endpoints | `PUT`/`DELETE /tracks/:id/favorite` | Done | — | [Phase 2](#phase-2-star--unstar-endpoints) |
| 3. Read Endpoints | `GET /me/favorites` | Done | — | [Phase 3](#phase-3-read-endpoints) |
| 4. Verification | Manual end-to-end against real library, `STATUS.md` update | Done | — | [Phase 4](#phase-4-verification) |

**Status values:** `Not started` → `In progress` → `Blocked` → `Done`.

---

## Phase 1: Schema

- [x] Migration `0005_create_favorites.sql`: `favorites` table — `user_id` (FK → users), `track_id` (FK → tracks), `created_at`
- [x] Composite primary key `(user_id, track_id)` — mirrors `playlist_tracks`; DB-level rejection of a duplicate insert
- [x] Index on `user_id` for "list my favorites" queries

**Done when:** migration applies cleanly, composite PK correctly rejects a duplicate insert at the DB level.

## Phase 2: Star / Unstar Endpoints

- [x] `PUT /tracks/:id/favorite` (auth required) — idempotent (`INSERT OR IGNORE`), starring an already-starred track succeeds silently
- [x] `DELETE /tracks/:id/favorite` (auth required) — idempotent, unstarring a non-favorited track succeeds silently (204), no 404
- [x] 404 only for a genuinely unknown track ID, 401 unauthenticated

**Done when:** starring, re-starring, unstarring, and re-unstarring a real track all behave correctly with no errors on the idempotent cases.

## Phase 3: Read Endpoints

- [x] `GET /me/favorites` (auth required) — paginated, most-recently-favorited-first, caller's own favorites only
- [x] Reuse the shared pagination helper's existing defaults — same as `/tracks`, `/me/history` (resolved open item, see below)
- [x] Reuse the existing lean track summary shape as-is (same one `GET /tracks` and the upload response use) — no favorites-specific fields (resolved open item, see below)

**Done when:** `/me/favorites` returns correctly ordered, correctly paginated results for a real user with several starred tracks.

Verified manually against the real library with two real registered users (created and removed after): starring 3 tracks (one re-starred to confirm idempotency, no duplicate row) returned them from `/me/favorites` in correct most-recent-first order with correct `total`; a `limit=2&offset=1` page correctly returned the middle+last rows; unstarring one track (then unstarring it again) both returned `204` and the list correctly dropped to 2 entries; the second user starring the same track and the first user unstarring it confirmed full per-user isolation (each user's list only ever reflected their own actions); unknown track id and non-numeric id both returned `404` on both star and unstar, all three endpoints returned `401` with no bearer token; re-running `POST /library/scan` after starring left the favorites list completely unchanged. Test users and favorite rows cleaned up afterward.

## Phase 4: Verification

- [x] Star several real tracks from the test library, confirm they appear in `/me/favorites` in the right order
- [x] Re-star an already-starred track — confirm no error, no duplicate row
- [x] Unstar, then unstar again — confirm no error both times
- [x] Confirm two users' favorites are fully independent (star the same track as both users, unstar as one, confirm the other's is untouched)
- [x] Confirm unknown track ID → 404, unauthenticated → 401
- [x] Re-run `POST /library/scan`, confirm existing favorites untouched (upsert-by-path shouldn't touch `favorites` at all)
- [x] `.docs/STATUS.md` updated

---

## Resolved open items (were flagged in the original plan)

- **`isFavorited` inline on browse endpoints (`GET /tracks`, `GET /albums/:id`, etc.):** deferred, not built in this pass. Ship `/me/favorites` alone first — matches this project's pattern (scrobble, upload, playlists) of smallest-correct-thing-first rather than optimizing up front. Adding the join later is additive to existing endpoints, not a redesign, so there's no real cost to waiting until a client (Android) actually needs it to avoid an extra round-trip.
- **Track summary shape for `/me/favorites`:** reuse the existing lean track summary as-is (same one `GET /tracks` and upload use) — it already carries title/artist/album/duration, and a favorites list has the same rendering needs as any other track list. No favorites-specific fields added to the shared shape; only extend it later if it's missing something that blocks basic UI use.
- **Pagination defaults:** reuse the shared pagination helper's existing defaults, same as `/tracks`/`/me/history` — no favorites-specific tuning.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
