# brainlessmusic

Home-made, self-hosted music streaming server — built from scratch as a learning project. Personal use, small scale: for me and a couple of friends, including on-the-road/bike-trip listening. Centerpiece feature (not yet built): a Spotify-Jam-style synced "room" listening session.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + TypeScript · Fastify |
| Backend libs | `music-metadata` (tags) · `fluent-ffmpeg` (transcoding) · `better-sqlite3` · JWT + bcrypt (auth) |
| Database | SQLite (WAL mode) |
| Frontend | React + TypeScript · Vite · Tailwind · TanStack Query |
| Mobile | Kotlin + Jetpack Compose (not yet started) |
| Deployment | Docker (server only, not local dev) |

Full resolved stack + reasoning: [.docs/reference/tech-stack.md](.docs/reference/tech-stack.md). Why a custom backend instead of Navidrome: [.docs/history/backend-decision-history.md](.docs/history/backend-decision-history.md).

## Repo layout

```
backend/    — Fastify API server (Node.js + TypeScript)
frontend/   — React web app (auth, library management, upload, health)
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
| `JWT_SECRET` | `change-me` | **the server refuses to boot** on the default, an empty value, or anything under 32 characters, unless `NODE_ENV` is `development` or `test` |
| `JWT_EXPIRES_IN` | `7d` | session token lifetime |
| `MEDIA_TOKEN_TTL` | `2h` | lifetime of the scoped tokens that ride in `<audio src>` URLs |
| `UPLOAD_STAGING_PATH` | `./data/upload-staging` | staging area for `POST /tracks/upload` |
| `MAX_UPLOAD_SIZE_MB` | `100` | upload size limit |
| `ARTWORK_PATH` | `./data/artwork` | cached cover art — safe to delete, a re-scan rebuilds it |
| `FRONTEND_PATH` | *(unset)* | built web app to serve from the API's own origin. Set in the container; leave unset in dev, where Vite serves it |
| `BACKUP_ENABLED` | `true` | scheduled database backups; `false` turns them off |
| `BACKUP_PATH` | *(beside `DB_PATH`)* | where backups are written — defaults to `<db dir>/backups`, so in the container they land in the `/data` volume |
| `BACKUP_INTERVAL_HOURS` | `24` | how often a backup runs while the server is up |
| `BACKUP_KEEP` | `14` | how many backups to retain; older ones are deleted |
| `ALLOW_OPEN_REGISTRATION` | `true` | anyone who can reach the server may create their own (non-admin) account. Set to `false` for admin-only registration — **do this before the server is reachable from outside** |
| `NODE_ENV` | *(unset)* | `development` / `test` downgrade the `JWT_SECRET` check to a warning. Anything else — including unset — is treated as a real deployment |

### Backups and restoring

Playlists, favorites and play history are the only irreplaceable rows here — tracks, artists, albums and cover art are all derived from your audio files, and a re-scan rebuilds them.

The server backs the database up **when it starts and every 24 hours after**, into `<db dir>/backups/`. Backups use SQLite's online backup API rather than a file copy: the database runs in WAL mode, where `cp` can capture a file whose committed pages are still in the `-wal` sidecar, producing a database that opens fine and is quietly missing recent writes. Each backup is reopened and `PRAGMA integrity_check`-ed before it counts, and is written as a single self-contained file with no sidecars of its own.

To restore, stop the server and put the backup where the database goes:

```bash
docker compose down                     # or stop `npm start`
cd backend/data
rm -f brainlessmusic.db-wal brainlessmusic.db-shm   # stale sidecars corrupt a restored file
cp backups/brainlessmusic-<timestamp>.db brainlessmusic.db
docker compose up -d
```

Deleting the old `-wal`/`-shm` is the step people miss: leaving one from a *different* database next to a restored file is a well-known way to corrupt it.

### Who can create an account

Two postures, chosen with `ALLOW_OPEN_REGISTRATION`:

- **Open (the default).** Anyone who can reach the login page can sign up at `/signup`. They get a listener account — self-serve never grants admin. Fine on a LAN; a real exposure on a public server, so the backend prints a warning at every boot while it's on.
- **Admin-only (`ALLOW_OPEN_REGISTRATION=false`).** `POST /auth/register` requires an admin's token, and accounts are made from the `/users` page.

One exception applies either way: while the user table is empty, the first account is always allowed through and is made an admin. Without it, an admin-only server could never get its first admin.

### The `JWT_SECRET` check

Anyone who knows the signing secret can mint a valid token for any account, admin included, without a password. So the server refuses to start on a weak one rather than running quietly:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the result in `backend/.env` as `JWT_SECRET`. Changing it invalidates every existing session, so everyone signs in once more.

The check runs at server boot, not at config load, so `npm run migrate` and the admin scripts keep working regardless — they never sign a token. `npm run dev` and `npm test` set `NODE_ENV` themselves, so local work is unaffected; you get a warning instead of a refusal.

## Running with Docker

One image serves both the API and the web app, so there is nothing else to host.

```bash
# 1. A secret. The server refuses to start without a real one.
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > .env

# 2. Point it at your music (default: ./library).
echo "LIBRARY_DIR=/path/to/your/music" >> .env

# 3. Go.
docker compose up -d
```

Then open `http://<host>:3000`. Migrations run automatically on every start; they're idempotent.

One container, `brainless-app`: Fastify serves the built web app from its own origin, so there's no separate frontend service, no reverse proxy and no CORS. The compose file sets an explicit project `name`, so everything it creates is prefixed `brainlessmusic` and can't be caught by another project's `docker compose down`.

| Path | What it is |
|---|---|
| `/library` | your music, bind-mounted read-write (uploads are filed into it) |
| `/data` | named volume `brainlessmusic_brainless-data`: database, cover-art cache, upload staging — **this is the one to back up** |
| `/api/health` | what the container healthcheck polls |

The image is Debian-based rather than Alpine on purpose: `better-sqlite3` and `bcrypt` ship prebuilt binaries for glibc, and on musl they'd be compiled from source at install time.

## API overview

**All API routes live under `/api`** — `/api/tracks`, `/api/auth/login`, and so on. The prefix isn't decoration: the web app has its own `/albums`, `/artists`, `/playlists`, `/search` and `/health` routes, so without it the API answers first and a browser navigating to `/albums` gets JSON instead of the page.

All routes except `/api/health` and `/api/auth/login` require `Authorization: Bearer <jwt>`.

**`POST /api/auth/register` is admin-only.** The one exception is a brand-new installation: while the user table is empty the endpoint is open, and the account it creates is made an admin. That bootstrap is what stops a fresh install deadlocking — admin-only registration and an empty user table would otherwise leave no way in. Once that first account exists, anonymous registration returns 401 and a signed-in non-admin gets 403.

**Paths below are relative to `/api`** — `POST /auth/login` is `POST /api/auth/login`.

- **Auth** — `POST /auth/register` (admin-only; open only while no users exist), `POST /auth/login`, `GET /auth/me`, `POST /auth/media-token`
- **Library** — `POST /library/scan`, `GET /artists[/:id]`, `GET /albums[/:id]`, `GET /tracks`, `GET /search?q=`
- **Streaming** — `GET /tracks/:id/stream` (byte-range support, `?quality=low` for transcoded audio; accepts a bearer header or a `?token=` media token so `<audio src>` can point straight at it)
- **Cover art** — `GET /tracks/:id/cover`, `GET /albums/:id/cover` (`?size=thumb` for ~256px; bearer header or `?token=` media token, `ETag`/`If-None-Match` supported)
- **Upload** — `POST /tracks/upload` (multipart)
- **Playlists** — `POST /playlists`, `GET /playlists`, `GET /playlists/:id`, `PATCH /playlists/:id`, `DELETE /playlists/:id`, `POST /playlists/:id/tracks`, `DELETE /playlists/:id/tracks/:trackId`, `PATCH /playlists/:id/tracks/reorder`
- **Play tracking** — `POST /tracks/:id/scrobble`, `GET /me/history`, `GET /tracks/:id/history`, `GET /stats/top-tracks`
- **Favorites** — `PUT /tracks/:id/favorite`, `DELETE /tracks/:id/favorite`, `GET /me/favorites`, `GET /me/favorites/ids`
- **Shuffle** — `POST /shuffle` (artist-adjacency-avoiding reorder)

Full behavior, edge cases, and verification detail for every endpoint: [.docs/STATUS.md](.docs/STATUS.md).

## Manual test pages

Predate the React frontend. These standalone HTML files (repo root, no build step — open directly in a browser against a running `npm run dev` backend) are still handy for poking at the API by hand:

- **`login.html`** — sign in, hands off to `library-player.html` with the token pre-filled.
- **`library-player.html`** — library browser + player: track list, search, upload, favorites, smart shuffle, mini player.
- **`test-player.html`** — minimal login + stream + request-log page, for quickly checking a single endpoint.

## Docs

Start at [.docs/STATUS.md](.docs/STATUS.md) for current project state and next steps. See [.docs/CLAUDE.md](.docs/CLAUDE.md) for the full docs folder map, conventions, and workflow.

- **[.docs/process/development-roadmap.md](.docs/process/development-roadmap.md) — what to build next: ordered checklist, grouped into three releases**
- [.docs/reference/capability-map.md](.docs/reference/capability-map.md) — every capability, per-layer status
- [.docs/CHANGELOG.md](.docs/CHANGELOG.md) — dated log of every backend/frontend change
- [.docs/FUNCTIONLOG.md](.docs/FUNCTIONLOG.md) — per-function log of what was added/changed and why
- [.docs/features/](.docs/features/) — per-feature planning docs, plus the unranked idea pool
- [.docs/process/android-phased-plan.md](.docs/process/android-phased-plan.md) — Android build order

## Status

Working toward **v0.1 — "it works for me"**: a full evening of listening in the browser, on the LAN, without reaching for a file manager.

- **Backend** — auth, library scan, streaming (with transcoding), browsing/search, playlists, play tracking, upload, favorites, and smart shuffle are built and manually verified. Missing: cover art, FTS5 search, tag write-back.
- **Frontend** — auth, library management, upload, and a health dashboard work. Playback is a preview-grade blob player; playlists and favorites have no UI yet.
- **Android** — not started.

See [.docs/STATUS.md](.docs/STATUS.md) for detail, [.docs/reference/capability-map.md](.docs/reference/capability-map.md) for per-layer status, and [.docs/process/development-roadmap.md](.docs/process/development-roadmap.md) for what's next.

## License

See [LICENSE](LICENSE).
