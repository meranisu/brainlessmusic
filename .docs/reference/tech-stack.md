# Tech Stack — Resolved Decisions

See `.docs/history/backend-decision-history.md` for how this was arrived at.

## Backend — Node.js + TypeScript (Fastify)

- **Language:** Node.js + TypeScript
- **Framework:** Fastify
- **Libraries:**
  - Tag parsing: `music-metadata`
  - Transcoding: `fluent-ffmpeg` (wraps system ffmpeg)
  - Database: SQLite via `better-sqlite3`
  - Auth: JWT + bcrypt
  - WebSocket: native `ws` library or Fastify's WebSocket plugin (for room sync)

## Database — SQLite

- **SQLite** — relational data (artists/albums/tracks/playlists/users) favors SQL over document-store denormalization; joins are central to core queries (playlist contents, unplayed-in-N-days, artist discographies)
- At ~30,000 tracks, SQLite performs well with no special scaling measures
- Performance plan:
  - Indexing on foreign keys and frequently filtered/sorted columns
  - **FTS5** (SQLite's full-text search virtual tables) for track/artist/album/playlist search, synced via triggers
  - **WAL journal mode** so reads aren't blocked by writes
  - Avoid N+1 query patterns
  - Periodic `ANALYZE`
- Own schema designed from scratch (no inherited schema from any third party)
- Room-sync session state (who's in a room, live playback position/queue) kept **in-memory**, not persisted — a simple in-memory store to start, with Redis as a future option if it needs to survive restarts or scale beyond one process
- DB file lives on the SSD; bulk audio library can move to a separate HDD later

## Frontend (web app) — React + TypeScript

- Own React + TypeScript app — library management, tag editing, room monitoring
- Node/TypeScript backend pairs naturally here — shared types across the stack possible

## Mobile app (Android)

- **Kotlin + Jetpack Compose** for UI — Material3 theming
- **Media3** (`androidx.media3`, ExoPlayer's successor) for playback — gapless/crossfade, background audio, lock-screen/notification controls, first-class Android Auto support
- **Retrofit + OkHttp** for REST calls
- **OkHttp WebSocket** (or Ktor client) for room-sync connection
- **Room (Jetpack Room)** for local storage — offline download tracking, cached metadata, pre-caching queue
- **Hilt** for dependency injection
- Auth: JWT bearer token (not Subsonic-style salt/token — that was a Navidrome-specific scheme, no longer relevant)

## Deployment

- **Docker** for the deployed server (not for local dev — see `.docs/process/dev-environment.md`)

## Networking

- Tailscale / Cloudflare Tunnel, or port forwarding — pending CGNAT check (see `.docs/ops/infrastructure.md`)

## Scoped MVP feature set

Deliberately smaller than a mature server like Navidrome, to keep the build tractable:

| Feature | Scope for MVP | Notes |
|---|---|---|
| Library scanning | Walk a folder, extract tags via `music-metadata`, insert into SQLite | Skip advanced cases (box sets, "Various Artists" merging) initially |
| Streaming | Serve files with HTTP byte-range support (seeking) | |
| Transcoding | On-the-fly via ffmpeg wrapper | |
| Auth | JWT + bcrypt, small fixed user list | Skip external auth providers, sharing links |
| Room sync | Full effort — the core feature | No existing reference to lean on |
| Tag editing | Write-back via a Node tag-writing library | |

**Not in initial scope:** smart auto-mixes, scrobbling, jukebox mode, sharing links, externalized auth.
