# Security audit, 2026-10-13

Whole codebase, read only, at `192f4e0` (live on smol and in Android v0.4.9). Four parallel passes: sign-in and
accounts; authorization on every route and the room WebSocket; files, uploads and ffmpeg; web, Android and deployment.
Every finding below was confirmed in the code by a reviewer. The ones marked **(checked)** were also re-read by the
session that wrote this file. Nothing was run against production, and no `.env` file was read.

**Overall:** no Critical findings. Admin routes all go through `requireAdmin`, guest-forbidden writes through
`requireAccount`, both re-read the user row (`backend/src/plugins/auth.ts:80-94`), SQL is parameterised, no
IDOR was found, and there are no XSS sinks or open redirects. The real risks are password and passcode guessing,
and a few ways one user can overload smol.

Status column: open until fixed; fill in the commit.

## High

| ID | Finding | Where | Attacker | Fix | Status |
|---|---|---|---|---|---|
| S1 | **Passcode sign-in can be brute-forced by sending guesses in parallel (checked).** The limit only peeks before the bcrypt check and counts the failure after it, so a burst all passes the peek. All 10,000 four-digit codes take roughly 10 minutes at bcrypt cost 12. | `backend/src/routes/auth.ts:94-103`, `:364-378` (same shape for passwords, `:339-347`) | Anonymous, knowing a username | Count the attempt before the await and refund it on success, or allow one attempt in flight per username. | open |

## Medium

| ID | Finding | Where | Attacker | Fix | Status |
|---|---|---|---|---|---|
| S2 | Per-account sign-in limit is keyed on the raw username, while lookup ignores case (A111), so `imran`, `Imran`, `iMran`... each get 20 failures an hour. | `auth.ts:97,102`; `db/users.ts:53` | Anonymous | Key on the lower-cased name, or the user id when it exists. | open |
| S3 | A 4-digit passcode is guessable online even with the limit (about 10 days), and 20 bad passcodes an hour also lock the owner out of **password** sign-in, since both share one limiter. Owner decision: Q175. | `auth.ts:60`, `:84-102`; `config.ts:29` | Anonymous | Longer passcodes, or lock passcode sign-in after N failures until the next password sign-in; separate counters. | open |
| S4 | A passcode survives an admin password reset, and setting one needs no current password, so a stolen 7-day token becomes permanent access. | `auth.ts:386-398`; `db/users.ts:221,227` | Anyone holding a stolen token | Ask for the current password to set a passcode; clear `passcode_hash` on a password reset. | open |
| S5 | `backend/.env.example` (public repo) is reported to hold a real-looking 64-hex `JWT_SECRET`, and the boot check accepts it. Not seen by this session (reading it is denied). Production uses its own secret per the deploy doc; not verified. | `backend/.env.example:3`; `utils/secretPolicy.ts:32-43` | Anyone, against a server set up from the example | Placeholder in the example; add the old value to `describeProblem`'s refusals. | open |
| S6 | Cover thumbnails: every uncached cover starts its own ffmpeg, with no slot limit, timeout, pixel cap or memory of failures, so a failing cover re-runs ffmpeg on every request. | `services/artwork.ts:79-106`; `routes/tracks.ts:617-627`, `albums.ts:49` | Guest | A small semaphore with in-flight dedupe and a failure cache; pin `-f`, `-protocol_whitelist file`, `-max_pixels`, timeout. | open |
| S7 | Picture uploads have no rate limit or concurrency cap: ten parallel 50 MP uploads can use about 2 GB. | `routes/profile.ts:153-171`; `services/avatars.ts` | Listener | One or two crops at a time (503 when busy), plus a per-user rate limit. | open |
| S8 | Room WebSocket: no per-socket command limit, and a 60-byte `move` makes the server re-send a 500-song queue to every member. Unauthenticated sockets are not capped. | `routes/rooms.ts:145,205-233`; `services/rooms.ts:155-160,460-469` | Guest | Token bucket per socket (close on abuse); cap sockets waiting for their first message. | open |
| S9 | Android release job uses a third-party action pinned by tag next to the release keystore, and the in-app updater installs whatever that job signs. | `.github/workflows/android-release.yml:25,46` | Upstream compromise | Pin every action by commit SHA (Dependabot keeps them current); pin `cloudflared` by digest. | open |

## Low

| ID | Finding | Where | Fix | Status |
|---|---|---|---|---|
| S10 | Hidden songs (A34) leak: `/shuffle` returns hidden tracks to anyone signed in, guests included **(checked)**; cover, waveform and `/prepare` skip the hidden check; your own favorites, playlists, less-often and pin still list them. | `routes/shuffle.ts:16-27`; `tracks.ts:529-558,617-650`; `favorites.ts:18` | One `findVisibleTrack(id, isAdmin)` helper used in each. | open |
| S11 | A song's play history shows every listener's login name, against A174 **(checked)**. | `db/plays.ts:184`; `routes/tracks.ts:715-731` | Return the display name, or only the caller's own plays. | open |
| S12 | `main` is unprotected and smol deploys it within 5 minutes as a docker-group user; the CI lookup doesn't filter on `event=push&branch=main`. Owner decision: Q176. | GitHub settings; `scripts/auto-deploy.sh:43-44` | Protect `main` (require CI, no force-push); add the filter. | open |
| S13 | Port 3000 is published on all interfaces and `cf-connecting-ip` is trusted from anyone, so a LAN or tailnet peer can dodge every per-IP limit. | `docker-compose.yml:22,36`; `utils/clientIp.ts:7-10` | Bind to `127.0.0.1` plus the Tailscale address; trust the header only from cloudflared. | open |
| S14 | `docker-compose.yml` defaults `ALLOW_OPEN_REGISTRATION` to `true`; production relies on smol's `.env` saying `false`. | `docker-compose.yml:31` | Default to `false`, matching `config.ts:224`. | open |
| S15 | Unhandled errors send their message to the client (paths, SQL text); transcode errors with ffmpeg's stderr reach every signed-in user via the 500 body and `/admin/health`. | no `setErrorHandler`; `tracks.ts:448-458`; `health.ts:19` | Generic 5xx body; keep detail in logs. | open |
| S16 | No CSP or other security headers; tokens live in `localStorage`, so any future XSS or bad npm package can read them. | `plugins/spa.ts:21`; `frontend/src/lib/apiClient.ts:17-28` | CSP (self + Google Fonts), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`. | open |
| S17 | Invite tokens are in the URL path, and log redaction only covers `?token=`. | `utils/redactUrl.ts:3`; `routes/invites.ts:48,54` | Redact `/invites?/<token>` too. | open |
| S18 | Unknown usernames answer about 250 ms faster than wrong passwords, so names can be confirmed by timing. | `auth.ts:345,371-375` | Compare against a dummy hash when there is no user. | open |
| S19 | No "sign out everywhere"; tokens last 7 days and guests can't revoke theirs. | no route; `config.ts:180` | `POST /auth/logout-all` bumping `session_version`. | open |
| S20 | Anyone, guests included, can take an account's display name and look like the owner in a room. Not decided before (A68 is about guest sign-in). Owner decision: Q177. | `auth.ts:440-450` | Refuse a name matching another account's, case-insensitive. | open |
| S21 | Playlist names aren't type- or length-checked (500 on a non-string; up to 1 MB shown to others when public). | `routes/playlists.ts:77,139` | Check it's a string and cap the length. | open |
| S22 | Audio ffmpeg calls (stream, loudness, waveform, artwork) don't pin a protocol whitelist; only admin-added files reach them. | `streaming.ts:246`, `loudness.ts:48`, `waveform.ts:72`, `artwork.ts:91` | Add `-protocol_whitelist file`. | open |
| S23 | Three filesystem writers read their root from config (hard rule). | `artwork.ts:60-101`; `transcodeCache.ts:41,88,155`; `tracks.ts:200` | Pass the root from the call sites. | open |
| S24 | Smaller items: transcode cache key omits the path (`transcodeCache.ts:17-23`); orphaned `.partial` transcodes never swept (`:91`); admin user PATCH can apply the role then fail on the password (`users.ts:43-48`); `${{ inputs.version }}` straight in a `run:` step (`android-release.yml:52`); handoff `#t=` link adopts any token after one tap (`TitleScreenPage.tsx:29-32,120-131`). | as listed | as each says | open |

## Checked and fine

- JWT: boot refuses an empty, default or short secret outside dev/test; `alg: none` rejected; media and session tokens
  can't stand in for each other; media tokens last 2 h and die with a password change; `?token=` redacted in logs.
- Revocation: deleting, pruning, resetting a password and demoting all take effect at once; user ids never reused.
- Invites and guest codes: random, stored hashed, claimed in one transaction; `ENTRY_CODE` compared in constant time.
- Uploads: admin only, extension allowlist, UUID staging names, staging always removed, size capped; filing strips path
  characters; deletes limited to files inside a registered root; scanner doesn't follow symlinks; no shell anywhere.
- Streaming: ids are numbers, paths only from the database, query values pick from fixed variants, Range parsing safe,
  transcodes capped and killed after 15 minutes.
- Web: no `dangerouslySetInnerHTML`/`innerHTML`/`javascript:` URLs, no open redirects, CORS off, WebSocket auth by
  first message (no cross-site hijacking), 64 KB WebSocket messages, no SVG/HTML served as artwork.
- Android: cleartext off in release, token Keystore-encrypted and kept out of backups, no WebView, FileProvider not
  exported, `/join` links need a tap, updater never sends the session token to GitHub.
- CI and Docker: no `pull_request_target`, read-only default token, secrets only via `env:`, container runs as `node`,
  deploy scripts refuse dirty trees, merge ff-only and back up the database before migrating. No keystores or real
  `.env` files in git history.
