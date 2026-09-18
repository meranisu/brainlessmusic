# Phase Plan — Android Phase 1 (Browse)

Roadmap box 16 (`.docs/process/development-roadmap.md`), full detail in
`.docs/process/android-phased-plan.md`'s "Phase 1 — Library Browsing".

## Goal

Let the app show the real library — artists down to individual tracks, with
cover art and search — on top of the connection Phase 0 built. No playback
yet; that's Phase 2.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Confirm backend shapes, scope pagination/refresh, cover-art auth strategy | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | DTOs, `ApiService` additions, `LibraryRepository`, Coil wiring | Done | [Phase 2](#phase-2-structure) |
| 3. Interior | Artists/Artist-detail/Album-detail/Search screens, bottom nav | Done | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Build-verify, lint, on-device browse test | Build+lint verified 2026-09-18; on-device test pending the owner | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

- [x] **The phased-plan doc's own note ("backend library-scan endpoints not yet built") is stale** — corrected there in the same change as this doc. The backend has been fully built since 2026-09-08/09; confirmed by reading `backend/src/routes/artists.ts`, `albums.ts`, `search.ts`, and `backend/src/db/browse.ts` directly rather than trusting the older doc.
- [x] **Navigation hierarchy resolved from what the API actually returns, not assumed.** `GET /artists/:id` already embeds `albums: AlbumSummary[]`, and `GET /albums/:id` already embeds `tracks: AlbumTrack[]` — so "Artists list → Album grid → Track list" from the phased-plan doc is three screens, not four: `ArtistsListScreen` → `ArtistDetailScreen` (that artist's albums, as a grid) → `AlbumDetailScreen` (that album's tracks, inline, no extra fetch). No separate top-level "all albums" screen was built — nothing in Phase 1's done-when asks for one, and every album is reachable through its artist or through search.
- [x] **Cover art needs no media-token exchange.** Read `backend/src/plugins/auth.ts`'s `authenticateMedia` closely: it accepts a normal `Authorization: Bearer` header first, falling back to `?token=` only for browser `<img>`/`<audio>` elements that can't set headers — and its own comment says "that's what the Android client and curl use." So Coil just needs the same authenticated `OkHttpClient` Retrofit already uses (via `AuthInterceptor`), wired in through `BrainlessMusicApp implements ImageLoaderFactory`. No separate `POST /auth/media-token` flow needed for Android, unlike the web app.
- [x] **Pagination scoped down, on purpose.** `GET /artists` fetches one page at `limit=200` — the server's own hard cap (`backend/src/utils/pagination.ts`) — rather than building real offset-based infinite scroll. Every library size mentioned anywhere in `.docs/STATUS.md` is under 30 tracks / 1-2 artists; real paging is a follow-up if a library ever needs it, not a corner quietly cut — logged here rather than in `QUESTIONS.md` since it's a scoping call within an already-scoped phase, not something waiting on an owner decision.
- [x] **"Pull-to-refresh" built as a manual refresh action, not a swipe gesture.** Material3's `PullToRefreshBox` was new enough around this project's pinned Compose BOM (2024.09.00) that wiring it blind risked repeating Phase 0's "assumed-but-unverified API" mistake — and unlike Phase 0, this was written *with* a working build/lint loop, so there was no reason to guess. A refresh `IconButton` next to Logout (Artists list) and in the top bar (Artist detail, Album detail) calls the same `load()` each screen already had for its error-state retry button — same effect as a swipe gesture, one fewer moving part.

## Phase 2: Structure

- [x] DTOs matching the backend exactly (`data/remote/dto/LibraryDtos.kt`): `ArtistSummaryDto`/`ArtistDetailDto`/`ArtistsPageDto`, `AlbumSummaryDto`/`AlbumTrackDto`/`AlbumDetailDto`, `TrackSummaryDto` (search's lean shape — distinct from `AlbumTrackDto`, which is leaner still), `SearchResultsDto`.
- [x] `ApiService` gained `artists()`, `artistDetail(id)`, `albumDetail(id)`, `search(query)`.
- [x] `LibraryRepository`: one `callApi` helper reusing `classifyError` (pulled out of `AuthRepository` into `ConnectionError.kt` so both repositories share one error-classification function instead of two copies), plus `albumCoverUrl(id)`/`trackCoverUrl(id)` building absolute URLs from a new `MediaUrlProvider` (mirrors `TokenProvider`'s in-memory-`StateFlow` pattern) that `AuthRepository` keeps in sync alongside the token on login/restore/logout.
- [x] Coil wired via `BrainlessMusicApp : Application(), ImageLoaderFactory` — field-injects the same `OkHttpClient` Retrofit uses, so every `AsyncImage` in the app carries the session's bearer token automatically.

## Phase 3: Interior

- [x] `ArtistsListScreen` — the first bottom-nav tab. List of artists (name, album/track counts), tap → artist detail. Top bar: refresh, log out (moved here from the now-deleted Phase-0 `HomeScreen` placeholder, which this phase supersedes entirely).
- [x] `ArtistDetailScreen` — artist name in the top bar, adaptive-grid of that artist's albums with cover thumbnails, tap → album detail.
- [x] `AlbumDetailScreen` — header (cover, title, artist, year) plus the track list (number, title, duration) inline — no separate fetch, see Phase 1's navigation-hierarchy note above.
- [x] `SearchScreen` — the second bottom-nav tab. A live search field (300ms-debounced, `FlowPreview`-gated `Flow.debounce`), results grouped into Artists/Albums/Tracks sections matching the backend's own grouping. Artist/album results navigate into the same detail screens above; track results are informational only (no `albumId` in the search response to deep-link from, and no playback exists yet regardless).
- [x] `CoverImage` (shared) — a disc-icon placeholder on a `null` URL, a load error, or before the first frame decodes, so nothing in the browsing UI ever shows blank space where art belongs.
- [x] `LoadState`/`LoadStateContent` (shared) — one loading/error/empty-state implementation reused by all four screens instead of four copies.

## Phase 4: Walkthrough

- [x] **`./gradlew :app:assembleDebug :app:lintDebug` — BUILD SUCCESSFUL, lint unchanged at 33 warnings** (Phase 0's clean baseline — the same 4 pre-existing/accepted findings, nothing new from Phase 1's own code). Two real compiler warnings caught and fixed before the clean run: a deprecated `Icons.Filled.Logout` (→ `Icons.AutoMirrored.Filled.Logout`) and an unguarded use of `Flow.debounce`, a `@FlowPreview` API (`@OptIn` added). A messier moment along the way: an early draft of a `Modifier.clickable` helper in two screens came out genuinely broken (calling an extension function without its receiver) — caught by re-reading the diff before it ever reached the compiler, not by a build failure.
- [x] **The gap this walkthrough is really for: refresh only worked from the error state at first.** `LoadStateContent`'s `onRetry` covered the "couldn't load" case, but a successfully-loaded, non-empty list had no way to pick up new content added on the web app without restarting the whole Android app — while Phase 1's own done-when literally asks for "pull-to-refresh." Fixed by adding a manual refresh action to all three list/detail screens, wired to the same `load()` each already had.
- [ ] **Not yet run anywhere.** Same constraint as Phase 0 — no emulator, no device in this environment. The built APK (`android/app/build/outputs/apk/debug/app-debug.apk`) is handed off for the owner to install and test against the same tunnel Phase 0 was confirmed against.
- [ ] Once tested on-device: confirm the artist list loads and shows real data, tapping an artist shows its albums with cover art (or the disc placeholder if none exists), tapping an album shows its tracks, search returns grouped results for a real query, and the refresh actions actually pick up a change made from the web app in the same session.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-18 | Phase 1 (Interior) | Added manual refresh `IconButton`s to Artists/Artist-detail/Album-detail after first-pass review found refresh only worked from the error path | Phase 1's stated done-when includes "pull-to-refresh"; the first pass only half-delivered it | Yes — additive, no API or navigation shape changed |
