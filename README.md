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
| Deployment | Docker (server only, not local dev) · Cloudflare Tunnel + Access for reaching it off the LAN, see below |

Full resolved stack + reasoning: [.docs/reference/tech-stack.md](.docs/reference/tech-stack.md). Why a custom backend instead of Navidrome: [.docs/history/backend-decision-history.md](.docs/history/backend-decision-history.md).

## Repo layout

```
backend/    — Fastify API server (Node.js + TypeScript)
frontend/   — React web app (auth, library management, upload, health)
android/    — Kotlin/Compose app (not yet started)
.docs/      — planning, status, and reference docs (tracked in the repo) — see below
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
| `ENTRY_CODE` | *(unset)* | shared code required to press "enter" on the title screen. **Unset means the guest door is open to anyone who can reach the server** — correct on a LAN, and the backstop to set before exposing it |
| `MAX_GUESTS` | `50` | ceiling on passwordless guest rows. At the cap the server prunes idle guests, then refuses |
| `GUEST_IDLE_DAYS` | `90` | how stale a guest must be before the cap may collect it — with its favorites, playlists, history and resume position |
| `GUEST_MINTS_PER_HOUR` | `10` | new guest sessions one IP address may mint per hour |
| `PASSCODE_ATTEMPTS_PER_MINUTE` | `8` | passcode sign-in attempts one IP address may make per minute |
| `UPLOAD_STAGING_PATH` | `./data/upload-staging` | staging area for `POST /tracks/upload` |
| `MAX_UPLOAD_SIZE_MB` | `1024` | per-file upload limit. Raised from 100 for hi-res FLAC and WAV, which exceed that on their own. The web client uploads 3 at a time, so `UPLOAD_STAGING_PATH` should have room for roughly 3× this; a reverse proxy in front will have its own body limit that must be raised to match |
| `ARTWORK_PATH` | `./data/artwork` | cached cover art — safe to delete, a re-scan rebuilds it |
| `FRONTEND_PATH` | *(unset)* | built web app to serve from the API's own origin. Set in the container; leave unset in dev, where Vite serves it |
| `BACKUP_ENABLED` | `true` | scheduled database backups; `false` turns them off |
| `BACKUP_PATH` | *(beside `DB_PATH`)* | where backups are written — defaults to `<db dir>/backups`, so in the container they land in the `/data` volume |
| `BACKUP_INTERVAL_HOURS` | `24` | how often a backup runs while the server is up |
| `BACKUP_KEEP` | `14` | how many backups to retain; older ones are deleted |
| `LIBRARY_SCAN_ENABLED` | `true` | scheduled library sync; `false` turns it off |
| `LIBRARY_SCAN_INTERVAL_HOURS` | `12` | how often a full scan runs while the server is up. A cheap presence check also runs at boot |
| `LIBRARY_MISSING_ABORT_RATIO` | `0.5` | if more than this share of the library vanishes in one sweep, nothing is flagged — an unmounted library looks exactly like a deleted one |
| `TRANSCODE_PATH` | `./data/transcodes` | converted copies of tracks — safe to delete, each missing entry costs one re-encode |
| `TRANSCODE_CACHE_MAX_MB` | `2048` | cache ceiling. Least-recently-used entries are dropped after a write, the only moment the cache grows. `0` disables the cap |
| `TRANSCODE_MIN_SOURCE_BITRATE_RATIO` | `1.5` | below this multiple of the 64k target, the original is served instead — converting a 121 kbps file to 64k costs a second lossy generation to save about a third |
| `MAX_CONCURRENT_TRANSCODES` | `2` | simultaneous `?quality=low` transcodes; past the cap the request gets `503`, never the full-size original |
| `ALLOW_OPEN_REGISTRATION` | `false` | anyone who can reach the server may create their own (non-admin) account. Defaulted off on 2026-09-11, when guest entry removed the sign-up page that needed it |
| `NODE_ENV` | *(unset)* | `development` / `test` downgrade the `JWT_SECRET` check to a warning. Anything else — including unset — is treated as a real deployment |

### Data saver, and why converted copies are kept

In the player it is the **Data saver** button on the desktop bar, and the pill beside shuffle and repeat in the phone view. It takes effect on the track already playing — the position, the play/pause state and the part-finished scrobble all carry across the swap — and the readout on the bar reports what the server actually sent, which is not always what was asked for. The choice is remembered per device, not per account: the phone on mobile data and the desktop on the LAN share a login and rarely want the same answer.

`?quality=low` converts a track to Opus at a 64 kbps target. (In practice libopus overshoots that by about 16% — see Q13 in `.docs/QUESTIONS.md`.) The conversion is **written to disk and served from there**, not streamed as it encodes — which is what makes the difference: a finished file has a length, so it gets byte ranges, an `ETag`, a `304` on revalidation, and a scrubber that works. A stream being encoded has none of those.

The cost is a wait on the *first* play of a track, and it is small: measured here, a 7:12 FLAC converts in 4.5 seconds, roughly 96x faster than playing it. Every play after that is served from the cache in milliseconds.

Converting is skipped when it cannot pay. A source already below `TRANSCODE_MIN_SOURCE_BITRATE_RATIO` x 64k is served as-is, because re-encoding an already-small file spends a second lossy generation to save very little. Lossless sources are where this earns its place: a FLAC here went from 3.32 MB to 0.24 MB, a 93% saving.

One conversion happens whether you ask for it or not. A raw `.aac` file has no container and therefore no reliable duration — measured here, a 25.0-second file reports 37.9 s to both ffprobe and Chrome, which scales the seek bar by half again. Those are remuxed into `.m4a`, copying the audio frames untouched into a container that states the real length.

The cache directory is disposable. Delete it and each track re-converts on next request.

### Picking up where you left off

The queue and the position are saved to the server, so closing a tab and opening
the app somewhere else carries on mid-song. One saved queue per account, not per
device — whichever screen you touched last is the one that is right, which is the
whole point when the screens are a desktop and a phone.

It comes back **paused**. Browsers refuse to start audio without a click, so a
player that promised to resume-and-play would simply sit there silently on a
phone; better to restore the queue, show it, and let the play button work. The
position is written every ten seconds while playing, when you pause, when the
track changes, and when the page is hidden.

A queue saved today may not all be playable tomorrow. Tracks that have been
deleted or that have gone missing from disk are dropped when the state is read
back, and the place in the queue is worked out again around the survivors — if
the track you were on is the one that vanished, you land on the next one rather
than back at the start.

Pressing **✕** on the player clears the saved position; it means "I'm done".
Logging out does not — that position is waiting for you next time.

### Keeping the library in sync

The database and the disk drift apart: files get moved, a library root changes, an external drive doesn't mount. A track row pointing at a file that isn't there is invisible until someone presses play and gets a `500`.

So the server checks. **At boot it stats every known track path** — cheap, one syscall per track — and **every `LIBRARY_SCAN_INTERVAL_HOURS` it also walks the library off disk** for new and changed files. The full walk is deliberately not run at startup: in development the server restarts on every file save, and a full library scan per keystroke helps nobody.

Files that have gone are **flagged, never deleted**. `missing_since` records when a file was first observed absent, and it clears itself the moment the file comes back, so a library on a mount that comes and goes heals rather than accumulating damage. Deleting the row would take favorites and playlist entries with it, for a file that may still be in a backup or on another disk — that stays a per-track decision through `DELETE /api/tracks/:id`.

Flagged tracks also **drop out of the browse listings** — the library table, album and artist pages, search, and the most-played chart — along with any artist or album left with nothing playable under it. Nothing offers you a track that can't play. `GET /api/tracks?missing=only` (or `?missing=all`) brings them back into view.

Playlists, favorites and play history are deliberately *not* filtered: a list you curated by hand quietly losing a song is a worse surprise than one that won't play, and history is a record of what actually happened.

`GET /api/library/missing` (admin) is the worklist, and `GET /api/admin/health` carries the count.

**The guard matters more than the sweep.** A library root that hasn't mounted yet is indistinguishable from one that was deleted, and this project has already lost its music once to that ambiguity. So if the root is unreadable, or if more than `LIBRARY_MISSING_ABORT_RATIO` of the library newly vanishes at once (and at least three tracks are involved — otherwise a two-track library could never record a single deletion), the sweep marks nothing and says why. The next sweep, once the disk is back, is a no-op.

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

### How anyone gets in

There are two doors, and they are not the same door.

**The guest door — `POST /auth/guest`.** No account, no password, no form: it mints a passwordless `users` row (`kind = 'guest'`) and returns the ordinary session token. One identity per device, deliberately, so nobody shares a queue, a favorites list or a resume position with anybody else. Losing the token — clearing site data — loses that row's listening history for good, because nothing can ever authenticate as it again.

Say the consequence out loud: **anyone who can reach this server can press the button and listen.** That is correct on a LAN and is the whole reason the LAN is the boundary. Before the server is reachable from outside, put a gate at the network edge (roadmap box 13); `ENTRY_CODE` is the backstop for a genuinely public URL, not a replacement for that.

**Signing in — `POST /auth/login`.** A username and password, on the account-select screen alongside the guest card. `POST /auth/passcode-login` is the same door with a shorter key: a username and a 4-8 digit numeric passcode, set per-account from Options (`POST /auth/passcode`, self-service only), for a faster return trip once an account exists. Passcode attempts are rate-limited far more tightly than password ones (`PASSCODE_ATTEMPTS_PER_MINUTE`) — a short numeric code has nothing like a password's keyspace, so the limit does the work the code's own length can't.

Accounts themselves are made by an admin from the `/users` page, or by `POST /auth/register` with an admin's token. One exception: while there are **no accounts** (guests do not count — the first visitor to a fresh server mints one), the first account is allowed through and is made an admin. Without that, an admin-only server could never get its first admin.

### The `JWT_SECRET` check

Anyone who knows the signing secret can mint a valid token for any account, admin included, without a password. So the server refuses to start on a weak one rather than running quietly:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the result in `backend/.env` as `JWT_SECRET`. Changing it invalidates every existing session, so everyone signs in once more.

The check runs at server boot, not at config load, so `npm run migrate` and the admin scripts keep working regardless — they never sign a token. `npm run dev` and `npm test` set `NODE_ENV` themselves, so local work is unaffected; you get a warning instead of a refusal.

## Getting started (frontend)

```bash
cd frontend
npm install
npm run dev             # starts on :5180, bound to every interface
```

The port is pinned (`strictPort`) rather than left to Vite's fallback, so the URL
stays put between restarts. The dev server proxies `/api` to the backend on
`:3000`, which keeps both halves on one origin — `VITE_API_BASE_URL` only needs
setting if the backend lives somewhere other than `:3000`.

### Testing on a phone

The dev server binds every interface, but under WSL2 that alone isn't enough:
WSL sits behind a NAT, so the `172.x` address Vite prints means nothing to
another device. The Windows host has to hand the port over. Two ways:

**Mirrored networking — permanent, needs a restart.** Windows 11 22H2+. Create
`%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

Then `wsl --shutdown` and reopen. WSL now shares the Windows network stack, so
`http://<windows-lan-ip>:5180` reaches it directly. This is machine-wide: every
distro gets it, and a Windows process on `:5180` will now genuinely collide with
the dev server rather than quietly coexisting.

**Port forwarding — per-port, takes effect immediately.** From an elevated
PowerShell:

```powershell
netsh interface portproxy add v4tov4 listenport=5180 listenaddress=0.0.0.0 `
  connectport=5180 connectaddress=$((wsl hostname -I).Trim().Split()[0])
New-NetFirewallRule -DisplayName "WSL dev 5180" -Direction Inbound `
  -LocalPort 5180 -Protocol TCP -Action Allow
```

WSL's IP changes whenever it restarts, so the `portproxy` line has to be re-run
after each `wsl --shutdown` (the firewall rule persists).

Find the address to type on the phone with `ipconfig` on the Windows side — the
Wi-Fi adapter's IPv4, not WSL's. If neither approach works, suspect the network
before the config: guest and corporate Wi-Fi often enable client isolation,
which blocks phone-to-laptop traffic no matter how the host is set up.

## Running with Docker

One image serves both the API and the web app, so there is nothing else to host.

New to this and just want it running (no assumed Docker/Node knowledge, plus
how to reach it from another device on the same network)? Use
[.docs/ops/docker-local-build.md](.docs/ops/docker-local-build.md) instead —
this section below is the terse version for anyone already comfortable with
Docker.

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

## Reaching it from outside the LAN

Everything above gets it running on your own network. To reach it from anywhere — a phone on mobile data, a laptop elsewhere — without opening a port on the router or worrying about CGNAT: a **Cloudflare Tunnel** (outbound-only connection to Cloudflare's edge, free TLS) plus a **Cloudflare Access** login gate in front of the tunnel's hostname, since the app's own auth (guest entry + JWT) is designed for a LAN, not the open internet.

Full walkthrough — Docker on a dedicated Linux box, the tunnel, the Access gate, and the `docker-compose.yml` service to run `cloudflared` alongside the app: [.docs/ops/cloudflare-tunnel-deployment.md](.docs/ops/cloudflare-tunnel-deployment.md).

Decision record (why a tunnel over port-forwarding, and the OS/hosting change): [A20 and A21 in .docs/QUESTIONS.md](.docs/QUESTIONS.md#answered).

## API overview

**All API routes live under `/api`** — `/api/tracks`, `/api/auth/login`, and so on. The prefix isn't decoration: the web app has its own `/albums`, `/artists`, `/playlists`, `/search` and `/health` routes, so without it the API answers first and a browser navigating to `/albums` gets JSON instead of the page.

All routes except `/api/health` and `/api/auth/login` require `Authorization: Bearer <jwt>`.

**`POST /api/auth/register` is admin-only.** The one exception is a brand-new installation: while the user table is empty the endpoint is open, and the account it creates is made an admin. That bootstrap is what stops a fresh install deadlocking — admin-only registration and an empty user table would otherwise leave no way in. Once that first account exists, anonymous registration returns 401 and a signed-in non-admin gets 403.

**Paths below are relative to `/api`** — `POST /auth/login` is `POST /api/auth/login`.

- **Auth** — `POST /auth/register` (admin-only; open only while no users exist), `POST /auth/login`, `GET /auth/me`, `POST /auth/media-token`
- **Library** — `POST /library/scan`, `GET /artists[/:id]`, `GET /albums[/:id]`, `GET /tracks`, `GET /search?q=`
- **Streaming** — `GET /tracks/:id/stream` (byte-range support, `?quality=low` for transcoded audio; accepts a bearer header or a `?token=` media token so `<audio src>` can point straight at it)
- **Waveform** — `GET /tracks/:id/waveform` (peak amplitudes for the player's scrubber; decoded from the file on first request and cached on the row)
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
- [.docs/ops/cloudflare-tunnel-deployment.md](.docs/ops/cloudflare-tunnel-deployment.md) — deploying on a dedicated Linux box and reaching it from outside the LAN via Cloudflare Tunnel + Access
- [.docs/reference/capability-map.md](.docs/reference/capability-map.md) — every capability, per-layer status
- [.docs/CHANGELOG.md](.docs/CHANGELOG.md) — dated log of every backend/frontend change
- [.docs/FUNCTIONLOG.md](.docs/FUNCTIONLOG.md) — per-function log of what was added/changed and why
- [.docs/features/](.docs/features/) — per-feature planning docs, plus the unranked idea pool
- [.docs/process/android-phased-plan.md](.docs/process/android-phased-plan.md) — Android build order

## Status

Working toward **v0.1 — "it works for me"**: a full evening of listening in the browser, on the LAN, without reaching for a file manager.

**v0.1 is complete.** Working toward v0.2 — "it works away from home".

- **Backend** — auth, library scan, streaming (byte-range + transcoding + media tokens), FTS5 search, browsing, playlists, play tracking, upload, favorites, smart shuffle, cover art, waveform peaks, and scheduled verified backups are built and tested (139 tests). Missing: tag write-back to files, dedupe/"Various Artists" handling.
- **Frontend** — a real player with a queue, seeking, transport, shuffle, repeat and keyboard control, plus album/artist browsing, playlists, favorites, search, upload, user management and a health dashboard. On a phone the bar opens a full-screen Now Playing view with a waveform scrubber. Missing: gapless, listening history and top-tracks pages.
- **Android** — not started.
- **Ops (roadmap box 13, "reach it from outside")** — hosting/networking decided: Arch Linux on a friend's PC, Cloudflare Tunnel + Access, no port-forwarding. In progress; see [.docs/ops/cloudflare-tunnel-deployment.md](.docs/ops/cloudflare-tunnel-deployment.md).

See [.docs/STATUS.md](.docs/STATUS.md) for detail, [.docs/reference/capability-map.md](.docs/reference/capability-map.md) for per-layer status, and [.docs/process/development-roadmap.md](.docs/process/development-roadmap.md) for what's next.

## License

See [LICENSE](LICENSE).
