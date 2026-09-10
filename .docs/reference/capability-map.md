# Capability Map

**What this is:** every capability the system could have, grouped by what a *user* would call it, with per-layer status. This is the inventory. `.docs/process/development-roadmap.md` is the plan for what to build next; `.docs/features/feature-brainstorm.md` is the unranked idea pool.

**Why it's organized this way:** the brainstorm doc groups ideas by theme ("road/bike-trip", "privacy") because that's how they surfaced in conversation. That's a good way to *collect* ideas and a bad way to *build* from them — it mixes design principles, platform extras, and load-bearing fundamentals into the same list, which is what made the project feel shapeless. The nine capabilities below are ordered by dependency: you cannot do **Curation** before **Catalog**, or **Together** before **Playback**. Anything that doesn't fit one of these nine is almost certainly not fundamental.

Status: ✅ built · 🟡 partial (see note) · ⬜ not started · — not applicable

_Last checked against the code: 2026-09-09._

---

## 1. Access — who you are and what you may do

| Layer | Status | Detail |
|---|---|---|
| Backend | ✅ | `POST /auth/register`, `/auth/login`, `GET /auth/me`; JWT + bcrypt; `is_admin` role; `set-admin` / `set-password` CLI scripts |
| Web | ✅ | Login, sign-up, `RequireAuth`, `RequireAdmin`, and a `/users` admin page for creating accounts, roles, password resets and deletion |
| Mobile | ⬜ | |

## 2. Ingest — getting music into the system

| Layer | Status | Detail |
|---|---|---|
| Backend | 🟡 | Folder scan with tag extraction (5 formats, filename fallbacks, idempotent upsert) ✅; multipart upload ✅; cover art extracted into a content-addressed cache ✅; **scheduled sync** — presence check at boot, full scan every 12h, missing files flagged not deleted, with a guard that refuses when a root is unreadable or too much vanishes at once ✅. Tag edits are still **DB-side only** — no write-back to files; no dedupe, no "Various Artists" handling |
| Web | 🟡 | Upload page ✅, per-track edit drawer ✅ (with a "File on disk" diagnostic), library filter for missing tracks ✅. No way to trigger a scan from the UI |
| Mobile | — | Not a mobile concern |

## 3. Catalog — finding what's in the library

| Layer | Status | Detail |
|---|---|---|
| Backend | ✅ | `/artists`, `/artists/:id`, `/albums`, `/albums/:id`, `/tracks`; FTS5 search on a trigram tokenizer (queries under 3 characters fall back to LIKE, which matters for 2-character CJK); cover art served with thumbnails and ETags |
| Web | ✅ | Sortable, filterable track table plus album grid, album detail, artist list and artist detail pages, a header search box and a grouped results page |
| Mobile | ⬜ | |

## 4. Playback — turning a row into sound

| Layer | Status | Detail |
|---|---|---|
| Backend | ✅ | Byte-range streaming (206/416, verified byte-identical), `?quality=low` served from a content-addressed disk cache so the converted copy range-serves and revalidates like any other file (raw `.aac` remuxed to `.m4a` regardless, since ADTS has no reliable duration), short-lived media-scoped `?token=` so an `<audio>`/`<img>` element can point straight at a URL, and waveform peaks decoded once and cached on the row |
| Web | ✅ | Real queue, native seeking, transport, repeat, shuffle and keyboard control. Below `md` the bar opens a full-screen Now Playing view with a waveform scrubber and a jump-to-track queue. A per-device data-saver toggle on both surfaces swaps quality on the playing track without losing the position or the scrobble, and reports what was *served* rather than what was requested. Queue and position are saved server-side and restored (paused) in a new tab. No gapless |
| Mobile | ⬜ | |

## 5. Curation — organizing what you listen to

| Layer | Status | Detail |
|---|---|---|
| Backend | ✅ | Playlists (CRUD + add/remove/reorder, ownership-enforced), favorites, artist-adjacency-avoiding shuffle |
| Web | ✅ | Playlist CRUD, add-to-playlist from the track menu, drag-to-reorder, hearts on rows and in the player, a favorites page, and smart shuffle from the player |
| Mobile | ⬜ | |

## 6. Memory — what the system remembers about you

| Layer | Status | Detail |
|---|---|---|
| Backend | ✅ | Scrobble endpoint, play history, denormalized play counts, top-tracks stats |
| Web | 🟡 | The player scrobbles — time actually heard, accumulated from `timeupdate` deltas with seeks discarded, recorded past half the track or four minutes. Play count is a visible column. No history or top-tracks page yet |
| Mobile | ⬜ | |

## 7. Together — shared listening (the centerpiece)

| Layer | Status | Detail |
|---|---|---|
| Backend | ⬜ | Not designed yet. Decided: in-memory room state, WebSocket transport |
| Web | ⬜ | |
| Mobile | ⬜ | |

## 8. Offline — listening without the server

| Layer | Status | Detail |
|---|---|---|
| Backend | ✅ | Nothing more needed — it already serves original files |
| Web | — | Not a web concern |
| Mobile | ⬜ | Downloads, pre-caching, offline-first fallback, data-saver mode |

## 9. Operate — running it for real

| Layer | Status | Detail |
|---|---|---|
| Backend | ✅ | `/health` + stream diagnostics; the server refuses to boot on a weak `JWT_SECRET`; verified database backups at start and every 24h; 139 tests across 25 suites |
| Web | ✅ | Health dashboard page |
| Hosting | 🟡 | One Docker image serves the API and the web app from a single origin, with a healthcheck and migrations on start; scheduled DB backups ✅. Still no off-LAN access, no TLS, no CI |

---

## Reading the map

Two patterns stand out, and they point in the same direction:

1. **The backend is far ahead of the clients.** Curation and Memory are 100% built server-side and 0% visible to a user. The highest-value work right now is *surfacing what already exists*, not writing new endpoints.
2. **The gaps are concentrated in two blockers**, not spread thin: no cover art anywhere (blocks Catalog + Playback UI on both clients), and header-only stream auth (blocks real playback on both clients). Fix those two and a large share of the ⬜ cells become straightforward UI work.

## Adding to this map

A new idea belongs in `.docs/features/feature-brainstorm.md` — the pool — until it earns a place in a release. It only gets a row here once it's clear which of the nine capabilities it extends. If it doesn't extend one of them, that's a strong signal it isn't fundamental and shouldn't be scheduled yet.
