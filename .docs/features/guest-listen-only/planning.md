# Guest listen-only — planning

## Goal

A guest (the passwordless per-device identity from A13) can browse and listen, and nothing else. The server
enforces this, so a client can't get around it by calling the API directly.

Decided in [A37](../../QUESTIONS.md#answered) and [A29](../../QUESTIONS.md#answered), 2026-10-09.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | What guests keep and lose, and where it's enforced | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Backend `requireAccount` gate, route classification test | Done | [Phase 2](#phase-2-structure) |
| 3. Interior | Web app hides what guests can't use | Done | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Use the app as a guest; docs | Done locally; not deployed | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

**Guests keep:** browsing (songs, albums, artists, letters, shuffled lists), search, streaming, cover art, waveform,
`POST /shuffle`, playback-failure reports, `/auth/me`, the media token, and **resume where they left off**
(`/me/playback-state`). Genre browsing comes along whenever genre exists; it doesn't exist in the backend yet (A22).

**Guests lose:** every playlist route, favorites, play counting (`POST /tracks/:id/scrobble`), history
(`/me/history`, `/tracks/:id/history`), and the top-tracks list (`/stats/top-tracks`). This overrides A13's line
that each guest has their own favorites.

**Settings for a guest:** player design and appearance only.

**Android:** no guest button. The app stays login-only (A29), so nothing changes there.

**What this does not do:** it doesn't stop a stranger with the URL from listening. That's roadmap box 13's job (the
entry code, or a gate at the network edge). This plan limits what a guest can *do*; box 13 decides who can *become* a
guest.

## Phase 2: Structure

- [x] `requireAccount` preHandler in `backend/src/plugins/auth.ts`, next to `requireAdmin` (`:65`). It runs after
      `authenticate` and re-reads the user from the database the same way, then answers
      `403 { error: "Guests can't do that" }` when `kind === 'guest'`.
- [x] Apply it to the routes listed under "Guests lose" (`routes/playlists.ts`, `favorites.ts`, `history.ts`,
      `stats.ts`, and the scrobble and history routes in `tracks.ts`).
- [x] **Route classification test.** It lists every registered route and fails if one isn't in exactly one of four
      lists: public, guest-allowed, account-only or admin-only. A new route then can't quietly open to guests. It
      also fails on a list entry that no longer matches a route.
- [x] Test the gate itself: a guest token gets 403 on every account-only route and success on every guest-allowed
      one, and a normal account is unaffected. Prove both tests work by breaking each once (remove the gate from one
      route, add an unlisted route), watch them fail, then revert.

## Phase 3: Interior

- [x] Hide the Favorites and Playlists links for guests (`components/AppShell.tsx`). `/favorites` and
      `/playlists/*` show an inline "Needs an account" message (`auth/RequireAccount.tsx`), like `RequireAdmin`, rather
      than redirecting.
- [x] Hide `FavoriteButton` and the add-to-playlist entry wherever they render (ArcadeSelect, LibraryFull,
      NowPlaying, PlayerBar, TrackRowMenu, AlbumDetailPage, SearchPage).
- [x] Skip the scrobble call for guests (`components/PlayerBar.tsx:429`), so a guest's console doesn't fill with
      403s.
- [x] Options page: guests see only the player-design and appearance sections (`pages/OptionsPage.tsx` already
      branches on `isGuest` at `:361` and `:391`; check what's left showing).
- [x] `npm run build` and `npm run lint` in `frontend/`.

## Phase 4: Walkthrough

- [x] As a guest in a private window: browse, search, play, seek, reload and resume. Confirm no favourite or
      playlist control appears anywhere and Options shows only appearance and player settings.
- [x] As the admin account: favourites, playlists and history still work.
- [x] CHANGELOG, FUNCTIONLOG, and STATUS if the state moves.
- [ ] Production gets this only when smol is redeployed, which has no repeatable procedure yet. Ask before
      touching it.

## Open

- ~~Guests' pre-existing playlists and favorites~~: resolved by A38 (2026-10-10). Migration `0017` deleted them at
  the 2026-10-10 deploy.
- How this reaches smol: `./scripts/deploy.sh`, first run 2026-10-10 ([A47](../../QUESTIONS.md#a47--a-change-reaches-smol-through-scriptsdeploysh-was-q39)).

## Change Log

| Date | Change |
|---|---|
| 2026-10-09 | Plan written from A37 / A29. |
| 2026-10-09 | Built. Changes from the plan: blocked pages show a message instead of redirecting; `POST`/`DELETE /auth/passcode` also moved onto `requireAccount` (POST already refused guests in its handler); `GET /admin/health` stays guest-allowed because the empty-library screen uses it. 60 routes classified. Verification in CHANGELOG 2026-10-09. |
