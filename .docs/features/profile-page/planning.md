# Profile page

## Goal

A page per person that everyone signed in can open: picture, bio, pinned favourites, what they listen to most, their
liked and disliked songs and public playlists (owner request 2026-10-13; A167-A170). Builds on the "You" tab (A61) and
the per-user stats (`getUserStats`, `backend/src/db/listeningStats.ts:136`), and on public playlists
(`.docs/features/public-playlists/planning.md`).

## Decisions

- **Everyone signed in sees everyone's profile** (A167). Guests can look, but get no profile of their own.
- **Others see**: picture, bio, pinned favourites, top songs, artists and genres, listening totals, public playlists,
  **liked and disliked songs** (A168). Private playlists stay the owner's.
- **Favourites**: worked out from listening, plus an optional pinned favourite song and favourite artist (A169).
- **Getting there**: tap a name wherever it shows (a playlist's "by" line, a room's members), plus a People page (A170).
- Web and Android together, as A164. Android's "You" tab becomes your own profile with Edit; the web has no profile
  page today and gets one.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Decisions above, API shape | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Migration, profile and people endpoints, picture upload, top genres, tests | Done | [Phase 2](#phase-2-structure) |
| 3. Interior (web) | People page, profile page, edit your own, names link to profiles | Done (pins from song menus left out) | [Phase 3](#phase-3-interior-web) |
| 4. Interior (Android) | Same, in every skin; "You" becomes your profile | Not started | [Phase 4](#phase-4-interior-android) |
| 5. Walkthrough | Two accounts and a guest, web and phone | Not started | [Phase 5](#phase-5-walkthrough) |

## Phase 1: Plan

- [x] API shape:
  - `GET /people`: everyone with a profile (accounts, not guests): id, name, picture, last listened.
  - `GET /users/:id/profile?range=`: name, picture, bio, pinned song and artist, member since, totals, top songs,
    artists and genres for the range, public playlists (all playlists when it's you), first page of liked and disliked.
  - `GET /users/:id/liked`, `GET /users/:id/disliked`: paged, for "See all".
  - `PUT /me/profile`: bio (up to 300 characters), `favoriteTrackId`, `favoriteArtistId` (null clears).
  - `PUT /me/avatar` (one image, up to 5 MB), `DELETE /me/avatar`; `GET /users/:id/avatar` serves it.
- [x] Picture: cropped square and scaled to 512 px JPEG with ffmpeg, as cover thumbnails are
  (`backend/src/services/artwork.ts:79`), stored by content hash under `AVATAR_PATH` (default `avatars/` next to the
  database, so it sits on the same volume). The writer takes its root as a parameter (hard rule).
- [x] `npm test` must point `AVATAR_PATH` into `.test-tmp/` and the harness must refuse a run that doesn't.

## Phase 2: Structure

- [x] Migration `0035`: `users.bio`, `users.avatar_id`, `users.favorite_track_id`, `users.favorite_artist_id`;
      `database-schema.md` in the same change. Deleting a user or a track clears what points at it.
- [x] Top genres per person and range, from `track_genres` joined to their plays.
- [x] The endpoints above; guests can read profiles, not have one; hidden tracks follow A34.
- [x] Picture upload: type and size checked, ffmpeg crop, old file removed when replaced.
- [x] Tests through `npm test`.

## Phase 3: Interior (web)

- [x] `/people` and `/people/:id`; your own has Edit (picture, bio, pinned favourites).
- [x] Your picture in the header beside Options opens your profile (A171).
- [x] People in the More menu; "See everyone" on your own profile; a People group in search (needs the server's
      search to return people) (A172).
- [x] Names link to profiles: a playlist's "by" line and "From others", Listen together members, the Control
      Center's On air rows and Users panel (A172).
- [x] In a room, playing from a profile asks first, since it adds to the room for everyone (A173).
- [ ] Pin a favourite from a song's or artist's menu. (Not built: Edit's picker covers it for now.)

## Phase 4: Interior (Android)

- [ ] Your picture at the left of Home's top bar opens your profile, with Edit (A171).
- [ ] People on Home, a People group in search, names as links in playlists and rooms (A172); the room keeps
      playing and playing from a profile asks first (A173).
- [ ] Picture from the phone's photo picker.
- [ ] Every skin's existing styling for headers, avatars and lists.

## Phase 5: Walkthrough

- [ ] Account A sets a picture, bio and pins; B opens A's profile from People and from a playlist's "by" line.
- [ ] A guest opens A's profile; has no profile of its own.
- [ ] Web and phone.

## Change log

| Date | Change |
|---|---|
| 2026-10-13 | Plan written from A167-A170. |
| 2026-10-13 | Server done. Pins carry no foreign key, so a scan's deletes are never blocked; a stale pin just isn't shown. |
| 2026-10-13 | Web pages built. Pins are chosen in Edit from your top and liked songs and top artists, not from song menus. Where the entry points go is open (owner request). |

| 2026-10-13 | Entry points decided (A171-A173). |
| 2026-10-13 | Web entry points built. Others' profiles carry the display name only (A174). |
