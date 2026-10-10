# brainlessmusic

> a music server. for me. and like two friends. that's the whole market.

Spotify kept moving my songs around, so I wrote my own streaming server from scratch, with a web app and an
Android app on top. It's a learning project that got out of hand. It runs on a friend's PC, it plays my music,
and it plays it on bike trips. That's the pitch.

**What it does:** you point it at a folder of audio files, and it gives you a library, a player, playlists,
favorites, search, cover art, a waveform scrubber, and a data-saver mode for when you're on mobile data in the
middle of nowhere.

**What it will do eventually:** a Spotify-Jam-style "room" where everyone hears the same song at the same time.
Not built yet. Not even specced yet. It's the reason this whole thing exists and I haven't started it. Classic.

**Why not just use Navidrome:** fair question. [Here's the long answer](.docs/history/backend-decision-history.md).
The short answer is "I wanted to build it."

## ⚠️ please do not take this seriously

This repo is vibe coded. Most of the code was written by AI coding agents (Claude Code, and Antigravity
sometimes) while I described what I wanted, read what came back, and pressed play to see if it worked. I'm a
Laravel dev, not a Node/Kotlin person. I learned a lot doing it, but I did not hand-write most of this.

So:

- It is not production software. It's not a product. It's not a portfolio piece pretending to be one.
- It's built for one specific setup (my WSL2 box, my friend's PC, my library). Yours will probably break it.
- Every doc in `.docs/` exists because the AI needs notes to remember what happened yesterday. That's why there
  are so many of them.
- No issues, no PRs, no roadmap promises, no support. If it works for you, cool. If it doesn't, also cool.

If you're here to learn how to build a music server properly, close the tab and go read Navidrome's source.

## the stack (aka the dependencies I chose to suffer with)

| Layer | Tech |
|---|---|
| Backend | Node.js + TypeScript · Fastify |
| Backend libs | `music-metadata` (tags) · `fluent-ffmpeg` (transcoding) · `better-sqlite3` · JWT + bcrypt (auth) |
| Database | SQLite (WAL mode). Yes, SQLite. It's three users. |
| Frontend | React + TypeScript · Vite · Tailwind · TanStack Query |
| Mobile | Kotlin + Jetpack Compose |
| Deployment | Docker (server only, not local dev) · Cloudflare Tunnel for reaching it off the LAN, see below |

Every decision and why I made it: [.docs/reference/tech-stack.md](.docs/reference/tech-stack.md).

## what's in the box

```
backend/    — Fastify API server (Node.js + TypeScript)
frontend/   — React web app (the control room: player, library management, upload, health)
android/    — Kotlin/Compose app (the actual listening client)
.docs/      — planning, status and reference docs. there are a LOT of them. see below
scripts/    — deploy.sh and friends
*.html      — ancient no-build test pages from before the React app existed (see "fossils")
```

## running the backend

I develop inside **WSL2 (Ubuntu)**. Not Docker, not native Windows Node. You need `ffmpeg` and `ffprobe` on
your `PATH` or transcoding will just sit there looking at you.

```bash
cd backend
npm install
cp .env.example .env   # then set LIBRARY_PATH to a real folder of audio files
npm run migrate
npm run dev             # starts on :3000 by default
```

Other scripts: `npm run build` (typecheck + compile), `npm start` (run compiled output), `npm test` (unit tests,
Node's built-in test runner).

> **Run tests with `npm test` and nothing else.** Not `tsx --test`, not `node --test`. A direct run once picked
> up the real `LIBRARY_PATH` and deleted my actual music library. I am still not over it. There's a hook that
> blocks the direct forms now.

### config (`backend/.env`)

Yes, there are this many knobs. Most of them you will never touch.

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

### data saver, or: how I stopped eating my mobile data

In the player it's the **Data saver** button on the desktop bar, and the pill next to shuffle and repeat in the
phone view. It kicks in on the track that's already playing. Position, play/pause and the half-finished scrobble
all survive the swap. The readout on the bar shows what the server actually sent, which is not always what you
asked for. The setting is remembered per device, not per account, because the phone on mobile data and the
desktop on the LAN share a login and never want the same answer.

`?quality=low` converts a track to Opus at a 64 kbps target. (libopus overshoots that by about 16%, see Q13 in
`.docs/QUESTIONS.md`. Thanks libopus.) The converted file is **written to disk and served from there**, not
streamed while it encodes. That's the trick: a finished file has a length, so it gets byte ranges, an `ETag`, a
`304` on revalidation, and a scrubber that works. A stream that's still encoding has none of that.

The cost is a wait on the *first* play of a track, and it's small. Measured here: a 7:12 FLAC converts in 4.5
seconds, roughly 96x faster than playing it. After that it comes out of the cache in milliseconds.

It skips converting when there's nothing to gain. A source already below `TRANSCODE_MIN_SOURCE_BITRATE_RATIO` x
64k is served as-is, because re-encoding a small file costs a second lossy generation to save very little.
Lossless is where it pays off: a FLAC here went from 3.32 MB to 0.24 MB, a 93% saving.

One conversion happens whether you ask or not. A raw `.aac` file has no container, so no reliable duration.
Measured here: a 25.0-second file reports 37.9 s to both ffprobe and Chrome, and the seek bar is off by half
again. Those get remuxed into `.m4a`, copying the audio frames untouched into a container that knows its own
length.

The cache folder is disposable. Delete it and each track re-converts on next play.

### picking up where you left off

The queue and the position are saved on the server, so you can close a tab, open the app somewhere else, and
carry on mid-song. One saved queue per account, not per device. Whatever screen you touched last wins, which is
exactly what you want when the screens are a desktop and a phone.

It comes back **paused**. Browsers won't start audio without a click, so a player that promised
resume-and-play would just sit there in silence on a phone. Better to restore the queue, show it, and let the
play button do its job. The position gets saved every ten seconds while playing, on pause, on track change, and
when the page is hidden.

A queue from today might not all be playable tomorrow. Tracks that were deleted or went missing from disk are
dropped when the state is read back, and your place in the queue is recalculated around whatever survived. If
the track you were on is the one that vanished, you land on the next one, not back at the start.

Pressing **✕** on the player clears the saved position. It means "I'm done". Logging out doesn't. Your position
is waiting for you next time.

### keeping the library in sync

The database and the disk drift apart. Files get moved, a library folder changes, an external drive doesn't
mount. A track row pointing at a file that isn't there is invisible until someone presses play and gets a `500`.

So the server checks. **At boot it stats every known track path** (cheap, one syscall per track) and **every
`LIBRARY_SCAN_INTERVAL_HOURS` it also walks the library on disk** for new and changed files. The full walk
doesn't run at startup on purpose: in dev the server restarts on every file save, and a full library scan per
keystroke helps nobody.

Missing files are **flagged, never deleted**. `missing_since` records when a file was first seen gone, and it
clears itself when the file comes back, so a library on a flaky mount heals instead of slowly rotting. Deleting
the row would take favorites and playlist entries with it, for a file that might still be in a backup or on
another disk. That stays a per-track decision through `DELETE /api/tracks/:id`.

Flagged tracks also **drop out of the browse listings**: the library table, album and artist pages, search, and
the most-played chart, plus any artist or album left with nothing playable. Nothing offers you a track that
can't play. `GET /api/tracks?missing=only` (or `?missing=all`) brings them back.

Playlists, favorites and play history are *not* filtered, on purpose. A hand-curated playlist quietly losing a
song is a worse surprise than one that won't play, and history is a record of what actually happened.

`GET /api/library/missing` (admin) is the to-do list, and `GET /api/admin/health` has the count.

**The guard matters more than the sweep.** A library folder that hasn't mounted yet looks exactly like one that
was deleted, and this project has already lost its music once to that exact confusion. So if the folder is
unreadable, or more than `LIBRARY_MISSING_ABORT_RATIO` of the library vanishes at once (and at least three
tracks are involved, otherwise a two-track library could never record a single deletion), the sweep marks
nothing and says why. The next sweep, once the disk is back, does nothing.

### backups, because see above

Playlists, favorites and play history are the only rows you can't get back. Tracks, artists, albums and cover
art all come from your audio files, and a re-scan rebuilds them.

The server backs up the database **when it starts and every 24 hours after**, into `<db dir>/backups/`. It uses
SQLite's online backup API, not a file copy. The database runs in WAL mode, where `cp` can grab a file whose
latest committed pages are still in the `-wal` sidecar, giving you a database that opens fine and is quietly
missing recent writes. Each backup is reopened and `PRAGMA integrity_check`-ed before it counts, and it's
written as one self-contained file with no sidecars.

To restore, stop the server and put the backup where the database goes:

```bash
docker compose down                     # or stop `npm start`
cd backend/data
rm -f brainlessmusic.db-wal brainlessmusic.db-shm   # stale sidecars corrupt a restored file
cp backups/brainlessmusic-<timestamp>.db brainlessmusic.db
docker compose up -d
```

Deleting the old `-wal`/`-shm` is the step everyone forgets. Leaving one from a *different* database next to a
restored file is a well-known way to corrupt it.

### how people get in

There are two doors, and they are not the same door.

**The guest door: `POST /auth/guest`.** No account, no password, no form. It mints a passwordless `users` row
(`kind = 'guest'`) and returns a normal session token. One identity per device, on purpose. Guests are
listen-only: no playlists, favorites, play counts or history. Clear your site data and that guest is gone for
good, because nothing can ever log in as it again.

To say the quiet part out loud: **anyone who can reach this server can press the button and listen.** That's fine
on a LAN, and it's the whole reason the LAN is the boundary. Before the server is reachable from outside, put a
gate at the network edge (roadmap box 13). `ENTRY_CODE` is the backstop for a truly public URL, not a
replacement for that.

**Signing in: `POST /auth/login`.** Username and password, on the account-select screen next to the guest card.
`POST /auth/passcode-login` is the same door with a shorter key: a username and a 4-8 digit passcode, set per
account from Options (`POST /auth/passcode`, self-service only). Passcode attempts are rate-limited much harder
than passwords (`PASSCODE_ATTEMPTS_PER_MINUTE`), because a short number is easy to guess and the limit has to
make up for it.

Accounts are made by an admin from the `/users` page, or by `POST /auth/register` with an admin's token. One
exception: while there are **no accounts** (guests don't count, since the first visitor to a fresh server mints
one), the first account gets through and is made admin. Otherwise an admin-only server could never get its first
admin.

### the `JWT_SECRET` check

Anyone who knows the signing secret can mint a valid token for any account, admin included, no password needed.
So the server refuses to start on a weak one instead of running quietly:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the result in `backend/.env` as `JWT_SECRET`. Changing it logs everyone out, so everyone signs in once more.

The check runs at server boot, not at config load, so `npm run migrate` and the admin scripts keep working
either way, since they never sign a token. `npm run dev` and `npm test` set `NODE_ENV` themselves, so local work
gets a warning instead of a refusal.

## running the frontend

```bash
cd frontend
npm install
npm run dev             # starts on :5180, bound to every interface
```

The port is pinned (`strictPort`), so the URL doesn't wander off between restarts. The dev server proxies `/api`
to the backend on `:3000`, which keeps both halves on one origin. You only need `VITE_API_BASE_URL` if the
backend lives somewhere other than `:3000`.

### testing on a phone (WSL2 edition, pain included)

The dev server binds every interface, but under WSL2 that's not enough. WSL sits behind a NAT, so the `172.x`
address Vite prints means nothing to your phone. Windows has to hand the port over. Two ways:

**Mirrored networking: permanent, needs a restart.** Windows 11 22H2+. Create `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

Then `wsl --shutdown` and reopen. WSL now shares the Windows network stack, so `http://<windows-lan-ip>:5180`
reaches it directly. This is machine-wide: every distro gets it, and a Windows process on `:5180` will now
actually collide with the dev server instead of quietly coexisting.

**Port forwarding: per port, works immediately.** From an elevated PowerShell:

```powershell
netsh interface portproxy add v4tov4 listenport=5180 listenaddress=0.0.0.0 `
  connectport=5180 connectaddress=$((wsl hostname -I).Trim().Split()[0])
New-NetFirewallRule -DisplayName "WSL dev 5180" -Direction Inbound `
  -LocalPort 5180 -Protocol TCP -Action Allow
```

WSL's IP changes every time it restarts, so re-run the `portproxy` line after each `wsl --shutdown` (the
firewall rule sticks).

Find the address to type on the phone with `ipconfig` on the Windows side: the Wi-Fi adapter's IPv4, not WSL's.
If neither works, blame the network before the config. Guest and corporate Wi-Fi often turn on client isolation,
which blocks phone-to-laptop traffic no matter what you do.

## running the Android app

```bash
cd android && ./gradlew assembleDebug
```

The server address is baked in (`SERVER_URL` in `android/app/build.gradle.kts`), so the login screen has no
address field. Point it at a dev backend with `-PserverUrl=`. Build order and what each phase covers:
[.docs/process/android-phased-plan.md](.docs/process/android-phased-plan.md).

## running it with Docker

One image serves both the API and the web app. Nothing else to host.

Never touched Docker and just want it running (plus how to reach it from another device on your network)? Read
[.docs/ops/docker-local-build.md](.docs/ops/docker-local-build.md) instead. What follows is the short version for
people who already know what they're doing.

```bash
# 1. A secret. The server refuses to start without a real one.
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > .env

# 2. Point it at your music (default: ./library).
echo "LIBRARY_DIR=/path/to/your/music" >> .env

# 3. Go.
docker compose up -d
```

Then open `http://<host>:3000`. Migrations run on every start; they're idempotent.

One container, `brainless-app`. Fastify serves the built web app from its own origin, so no separate frontend
service, no reverse proxy, no CORS. The compose file sets an explicit project `name`, so everything it creates
is prefixed `brainlessmusic` and another project's `docker compose down` can't take it out.

| Path | What it is |
|---|---|
| `/library` | your music, bind-mounted read-write (uploads are filed into it) |
| `/data` | named volume `brainlessmusic_brainless-data`: database, cover-art cache, upload staging — **this is the one to back up** |
| `/api/health` | what the container healthcheck polls |

The image is Debian, not Alpine, on purpose: `better-sqlite3` and `bcrypt` ship prebuilt binaries for glibc, and
on musl they'd compile from source at install time. Nobody wants that.

## reaching it from outside the house

Everything above runs it on your own network. To reach it from anywhere (phone on mobile data, laptop at a
friend's) without opening a port on the router or fighting CGNAT: a **Cloudflare Tunnel**, an outbound-only
connection to Cloudflare's edge with free TLS. A **Cloudflare Access** login gate in front of it is the plan,
because the app's own auth (guest entry + JWT) was built for a LAN, not the open internet.

The live one runs on a friend's Arch Linux PC (`smol`) at `music.nobrainmusic.my`. Rebuilding on your own
machine doesn't touch it. Updates are `./scripts/deploy.sh`, run on that box.

Full walkthrough (Docker on a dedicated Linux box, the tunnel, the Access gate, running `cloudflared` next to the
app): [.docs/ops/cloudflare-tunnel-deployment.md](.docs/ops/cloudflare-tunnel-deployment.md).

Why a tunnel and not port forwarding: [A20 and A21 in .docs/QUESTIONS.md](.docs/QUESTIONS.md#answered).

## the API, briefly

**Every API route lives under `/api`**: `/api/tracks`, `/api/auth/login`, and so on. The prefix is not
decoration. The web app has its own `/albums`, `/artists`, `/playlists`, `/search` and `/health` routes, and
without the prefix a browser going to `/albums` gets a wall of JSON instead of the page.

Everything except `/api/health` and `/api/auth/login` needs `Authorization: Bearer <jwt>`.

**`POST /api/auth/register` is admin-only.** The one exception is a brand-new install: while the user table is
empty the endpoint is open, and the account it creates is made admin. Without that, admin-only registration plus
an empty user table means nobody can ever get in. Once the first account exists, anonymous registration gets 401
and a signed-in non-admin gets 403.

**Paths below are relative to `/api`**, so `POST /auth/login` is `POST /api/auth/login`.

- **Auth**: `POST /auth/register` (admin-only; open only while no users exist), `POST /auth/login`, `GET /auth/me`, `POST /auth/media-token`
- **Library**: `POST /library/scan`, `GET /artists[/:id]`, `GET /albums[/:id]`, `GET /tracks`, `GET /search?q=`
- **Streaming**: `GET /tracks/:id/stream` (byte-range support, `?quality=low` for transcoded audio; takes a bearer header or a `?token=` media token so `<audio src>` can point straight at it)
- **Waveform**: `GET /tracks/:id/waveform` (peak amplitudes for the player's scrubber; decoded from the file on first request and cached on the row)
- **Cover art**: `GET /tracks/:id/cover`, `GET /albums/:id/cover` (`?size=thumb` for ~256px; bearer header or `?token=` media token, `ETag`/`If-None-Match` supported)
- **Upload**: `POST /tracks/upload` (multipart)
- **Playlists**: `POST /playlists`, `GET /playlists`, `GET /playlists/:id`, `PATCH /playlists/:id`, `DELETE /playlists/:id`, `POST /playlists/:id/tracks`, `DELETE /playlists/:id/tracks/:trackId`, `PATCH /playlists/:id/tracks/reorder`
- **Play tracking**: `POST /tracks/:id/scrobble`, `GET /me/history`, `GET /tracks/:id/history`, `GET /stats/top-tracks`
- **Favorites**: `PUT /tracks/:id/favorite`, `DELETE /tracks/:id/favorite`, `GET /me/favorites`, `GET /me/favorites/ids`
- **Shuffle**: `POST /shuffle` (a shuffle that tries not to play the same artist twice in a row, because real random is annoying)

Full behavior and edge cases for every endpoint: [.docs/history/status-archive.md](.docs/history/status-archive.md)
(frozen 2026-09-28). Anything newer is in [.docs/CHANGELOG.md](.docs/CHANGELOG.md).

## fossils

These are from before the React frontend existed. Standalone HTML files in the repo root, no build step: open
them in a browser against a running `npm run dev` backend. Still handy for poking the API by hand.

- **`login.html`**: sign in, then hands off to `library-player.html` with the token filled in.
- **`library-player.html`**: library browser + player: track list, search, upload, favorites, smart shuffle, mini player.
- **`test-player.html`**: minimal login + stream + request log, for checking one endpoint quickly.

## the docs folder (it's big, I know)

Start at [.docs/STATUS.md](.docs/STATUS.md) for where things are and what's next.
[.docs/CLAUDE.md](.docs/CLAUDE.md) has the full map of the folder and how it's organized.

- **[.docs/process/development-roadmap.md](.docs/process/development-roadmap.md): what to build next, as an ordered checklist split into three releases**
- [.docs/ops/cloudflare-tunnel-deployment.md](.docs/ops/cloudflare-tunnel-deployment.md): deploying on a dedicated Linux box and reaching it from outside via Cloudflare Tunnel
- [.docs/reference/capability-map.md](.docs/reference/capability-map.md): every feature, per-layer status
- [.docs/CHANGELOG.md](.docs/CHANGELOG.md): dated log of every backend/frontend change
- [.docs/FUNCTIONLOG.md](.docs/FUNCTIONLOG.md): per-function log of what changed and why
- [.docs/features/](.docs/features/): per-feature planning docs, plus the pile of ideas I haven't gotten to
- [.docs/process/android-phased-plan.md](.docs/process/android-phased-plan.md): Android build order

## where it's at

Three releases, each with a very low bar:

- **v0.1, "it works for me":** a full evening of listening in the browser, on the LAN, without opening a file manager. **Done.**
- **v0.2, "it works away from home":** in progress.
- **v0.3, "it works with friends":** the room-sync thing. Not started.

Right now:

- **Backend:** auth, library scan and scheduled sync, streaming (byte ranges + transcoding + media tokens), FTS5 search, browsing, playlists, play tracking, upload, favorites, smart shuffle, cover art, waveform peaks, and verified scheduled backups. Built and tested.
- **Web:** a real player with a queue, seeking, shuffle, repeat and keyboard controls, plus album/artist browsing, playlists, favorites, search, upload, user management and a health dashboard. On a phone the bar opens a full-screen Now Playing view with a waveform scrubber.
- **Android:** login, browsing, playback and background playback with notification controls all built. Played music on an actual phone over Wi-Fi and mobile data on 2026-09-28, which felt great.
- **Out in the world:** live at `music.nobrainmusic.my` through a Cloudflare Tunnel.

Details: [.docs/STATUS.md](.docs/STATUS.md). What's next:
[.docs/process/development-roadmap.md](.docs/process/development-roadmap.md).

## things this will never do

Subsonic compatibility, multiple tenants, "Sign in with Google", share links, jukebox mode, plugins. Decided. It's
a music server for three people, not a platform.

## license

See [LICENSE](LICENSE).
