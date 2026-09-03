# brainlessmusic

Home-made, self-hosted music streaming server — built from scratch as a learning project. Personal use, small scale: for me and a couple of friends, including on-the-road/bike-trip listening. Centerpiece feature (not yet built): a Spotify-Jam-style synced "room" listening session.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + TypeScript · Fastify |
| Backend libs | `music-metadata` (tags) · `fluent-ffmpeg` (transcoding) · `better-sqlite3` · JWT + bcrypt (auth) |
| Database | SQLite (WAL mode) |
| Frontend | React + TypeScript (not yet started) |
| Mobile | Kotlin + Jetpack Compose (not yet started) |
| Deployment | Docker (server only, not local dev) |

Full resolved stack + reasoning: [.docs/reference/tech-stack.md](.docs/reference/tech-stack.md). Why a custom backend instead of Navidrome: [.docs/history/backend-decision-history.md](.docs/history/backend-decision-history.md).

## Repo layout

```
backend/    — Fastify API server (Node.js + TypeScript)
frontend/   — React web app (not yet started)
android/    — Kotlin/Compose app (not yet started)
.docs/      — planning, status, and reference docs — see below
*.html      — standalone, no-build-step manual test pages (see Manual test pages)
```

## Getting started (backend)

Developed inside **WSL2 (Ubuntu)** — not Docker, not native Windows Node. Requires system `ffmpeg`/`ffprobe` on `PATH` for transcoding.

```bash
cd backend
npm install
cp .env.example .env   # then set LIBRARY_PATH to a real folder of audio files
npm run migrate
npm run dev             # starts on :3000 by default
```

Other scripts: `npm run build` (typecheck + compile), `npm start` (run compiled output), `npm test` (unit tests, Node's built-in test runner).

### Config (`backend/.env`)

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | server port |
| `DB_PATH` | `./data/brainlessmusic.db` | SQLite file location |
| `LIBRARY_PATH` | `./library` | folder scanned for audio files — **set this to a real path** |
| `JWT_SECRET` | `change-me` | **set a real value** outside local dev |
| `JWT_EXPIRES_IN` | `7d` | token lifetime |
| `UPLOAD_STAGING_PATH` | `./data/upload-staging` | staging area for `POST /tracks/upload` |
| `MAX_UPLOAD_SIZE_MB` | `100` | upload size limit |

## API overview

All routes except `/health`, `/auth/register`, `/auth/login` require `Authorization: Bearer <jwt>`.

- **Auth** — `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- **Library** — `POST /library/scan`, `GET /artists[/:id]`, `GET /albums[/:id]`, `GET /tracks`, `GET /search?q=`
- **Streaming** — `GET /tracks/:id/stream` (byte-range support, `?quality=low` for transcoded audio)
- **Upload** — `POST /tracks/upload` (multipart)
- **Playlists** — `POST /playlists`, `GET /playlists`, `GET /playlists/:id`, `PATCH /playlists/:id`, `DELETE /playlists/:id`, `POST /playlists/:id/tracks`, `DELETE /playlists/:id/tracks/:trackId`, `PATCH /playlists/:id/tracks/reorder`
- **Play tracking** — `POST /tracks/:id/scrobble`, `GET /me/history`, `GET /tracks/:id/history`, `GET /stats/top-tracks`
- **Favorites** — `PUT /tracks/:id/favorite`, `DELETE /tracks/:id/favorite`, `GET /me/favorites`
- **Shuffle** — `POST /shuffle` (artist-adjacency-avoiding reorder)

Full behavior, edge cases, and verification detail for every endpoint: [.docs/STATUS.md](.docs/STATUS.md).

## Manual test pages

No frontend exists yet, so these standalone HTML files (repo root, no build step — open directly in a browser against a running `npm run dev` backend) are the way to poke at the API by hand:

- **`login.html`** — sign in, hands off to `library-player.html` with the token pre-filled.
- **`library-player.html`** — library browser + player: track list, search, upload, favorites, smart shuffle, mini player.
- **`test-player.html`** — minimal login + stream + request-log page, for quickly checking a single endpoint.

## Docs

Start at [.docs/STATUS.md](.docs/STATUS.md) for current project state and next steps. See [.docs/CLAUDE.md](.docs/CLAUDE.md) for the full docs folder map, conventions, and workflow.

- [.docs/CHANGELOG.md](.docs/CHANGELOG.md) — dated log of every backend/frontend change
- [.docs/FUNCTIONLOG.md](.docs/FUNCTIONLOG.md) — per-function log of what was added/changed and why
- [.docs/features/](.docs/features/) — per-feature planning docs
- [.docs/process/android-phased-plan.md](.docs/process/android-phased-plan.md) — Android build order

## Status

Backend: auth, library scan, streaming (with transcoding), browsing/search, playlists, play tracking, upload, favorites, and smart shuffle are all built and manually verified. Frontend and Android app: not yet started. See [.docs/STATUS.md](.docs/STATUS.md) for the full picture.

## License

See [LICENSE](LICENSE).
