# Public playlists

## Goal

Let people on this server see and play each other's playlists when the owner makes them public, find playlists in
search, and save a copy of one to make their own (owner request 2026-10-13; A162-A164). Groundwork for the profile
page in `.docs/features/feature-brainstorm.md`.

## Decisions

- Every playlist is **private until its owner makes it public**; existing playlists stay private (A162).
- Someone else's public playlist is **read-only**: play, shuffle, add to queue, **Save a copy** (A162).
- **Guests see and play** public playlists; a guest's own playlists **can't be made public** (A163).
- **Web and Android together**, one server change (A164).
- "Public" means signed-in people on this server. No sharing link (out of scope).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Decisions above, API shape | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Migration, queries, endpoints, access rules, tests | Not started | [Phase 2](#phase-2-structure) |
| 3. Interior | Web and Android: the switch, "From others", search, Save a copy | Not started | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Two accounts and a guest on a phone and a browser | Not started | [Phase 4](#phase-4-walkthrough) |

## Phase 1: Plan

- [x] Today: playlists are `id, name, owner_id, created_at` (`0003_create_playlists.sql`); every route refuses a
      non-owner (`backend/src/routes/playlists.ts:40`); search covers the library only (`backend/src/db/browse.ts:473`).
- [x] API shape:
  - `PATCH /playlists/:id` takes `isPublic` (owner only; refused for a guest owner).
  - `GET /playlists` stays "mine"; each playlist gains `isPublic`.
  - `GET /playlists/public`: other people's public playlists, with owner name, track count and a cover.
  - `GET /playlists/:id`: the owner, or anyone signed in when public; the response says `isOwner` and the owner's name.
  - `POST /playlists/:id/copy`: a new private playlist owned by the caller, same tracks and order, named
    "<name> (copy)".
  - `GET /search` gains `playlists`: the caller's own plus public ones, by name.
  - Every write route (rename, delete, add, remove, reorder) stays owner-only.

## Phase 2: Structure

- [ ] Migration `0034`: `playlists.is_public INTEGER NOT NULL DEFAULT 0`, index for the public list;
      `database-schema.md` updated in the same change.
- [ ] Queries: list public (not the caller's), copy in one transaction, search by name.
- [ ] Access: read allowed for public; writes owner-only; `isPublic` refused for a guest owner.
- [ ] Hidden tracks: a non-admin viewer doesn't see hidden tracks in someone else's playlist, as elsewhere (A34).
- [ ] Deleting a user or pruning a guest still clears their playlists (`guestDataCleanup.test.ts` covers it today).
- [ ] Tests: each rule above, through `npm test`.

## Phase 3: Interior

- [ ] Web `PlaylistsPage`: "Mine" and "From others" (owner shown on each); a Public switch on your own playlists
      (not shown to guests).
- [ ] Web `PlaylistDetailPage`: read-only for others, with owner, Play, Shuffle, Save a copy.
- [ ] Web `SearchPage`: a Playlists group.
- [ ] Android `ui/profile/PlaylistsScreen.kt`, `PlaylistDetailScreen.kt`, `ui/search/SearchScreen.kt`: the same, in
      every skin's existing playlist styling.
- [ ] Offline downloads: a downloaded copy of someone else's playlist, decided when building (see questions).

## Phase 4: Walkthrough

- [ ] Account A makes a playlist public; account B sees it under "From others" and in search, plays it, saves a copy,
      edits the copy; A's original is unchanged.
- [ ] A makes it private again: it leaves B's list; B's copy stays.
- [ ] A guest sees and plays it, and has no Public switch.
- [ ] Web and phone.

## Change log

| Date | Change |
|---|---|
| 2026-10-13 | Plan written from A162-A164. |
