# Project Status

_Last updated: 2026-09-28 (Android Phase 2 built) — live snapshot; full history frozen in [history/status-archive.md](history/status-archive.md)._

**Keep this file short (target: under 150 lines).** It answers "where are we and what is next" and nothing else.
When a feature ships, change its row in the table below and, if the next step moved, the *Next* section.
Do **not** append per-endpoint detail, verification narratives or dated logs here — they go in
[CHANGELOG.md](CHANGELOG.md), [FUNCTIONLOG.md](FUNCTIONLOG.md) and the feature's `planning.md`.
Open owner questions live only in [QUESTIONS.md](QUESTIONS.md).

## Where things stand

Personal self-hosted music streamer: `backend/` (Fastify + SQLite), `frontend/` (React web app, the control room),
`android/` (Kotlin/Compose, the listening client). Scope is three releases — v0.1 works for me, v0.2 works away from
home, v0.3 works with friends — ordered in [process/development-roadmap.md](process/development-roadmap.md).
Work the first unticked box there.

| Area | State | Detail |
|---|---|---|
| Auth (JWT + bcrypt, guest entry, admin role, user management) | Built, verified; guest accounts (A67–A70) live on smol and in Android v0.3.11 (2026-10-11), **10 review issues open, one live on production** | archive; A13–A16, A41–A43, A67–A70 in QUESTIONS; [features/guest-accounts](features/guest-accounts/planning.md#open-issues-from-review-2026-10-11) |
| Library scanner, multi-root library, scheduled sync | Built, verified | [features/multi-root-library](features/multi-root-library/planning.md) |
| Streaming (byte ranges, ETag caching, signed URLs) | Built, verified | archive |
| Formats and transcoding (7 formats; `?quality=low` serves a cached converted copy) | Built, verified — roadmap box 24 | [features/formats-and-transcoding](features/formats-and-transcoding/planning.md) |
| Browse, FTS5 search, cover art | Built, verified | archive |
| Playlists, favorites, scrobble/history, smart shuffle, resume-where-you-left-off | Built server-side; web UI surfaces them | archive |
| Track upload, tag editing, admin track management, `/admin/health` | Built, verified | [features/library-management-interface](features/library-management-interface/planning.md) |
| DB backups (start + every 24 h) | Built, verified — box 14 | archive |
| Web frontend (arcade title screen, music select, themes, transitions, `/manage`) | Feature-complete for planned scope | [features/](features/) |
| Docker image | Built, verified — box 12 | [ops/docker-local-build.md](ops/docker-local-build.md) |
| Android Phase 0 — connect + auth | Confirmed on a real device 2026-09-18 | [features/android-phase-0-connect](features/android-phase-0-connect/planning.md) |
| Android Phase 1 — browse | Built; first on-device look 2026-09-28 led to padding/search fixes and Material You (dynamic color) | [features/android-phase-1-browse](features/android-phase-1-browse/planning.md) |
| Android Phase 2 — playback (Media3, queue, Now Playing, scrobble) | Built; **playback confirmed on a phone over Wi-Fi and mobile data (2026-09-28)**; seek, Opus, play-count-on-web, Play next and error paths not yet reported — checklist in the plan | [features/android-phase-2-playback](features/android-phase-2-playback/planning.md) |
| Android Phase 3 — background (MediaSession, foreground service, notification/lock-screen controls) | Built; **screen-off playback and the notification confirmed on a phone (2026-09-28)**; lock-screen buttons, artwork, headset pause not yet reported | [features/android-phase-3-background](features/android-phase-3-background/planning.md) |
| Reach it from outside (roadmap box 13) | **Not done — the critical path for v0.2** | [ops/cloudflare-tunnel-deployment.md](ops/cloudflare-tunnel-deployment.md) |
| Room sync (v0.3) | Not started; spec first (box 21) | Q4 |

## In the working tree, not yet committed (as of 2026-09-28)

Playback-failure and scan-failure logging: migrations `0015_create_playback_failures.sql` and
`0016_create_scan_failures.sql`, `db/playbackFailures.ts`, and edits to `routes/health.ts`, `routes/tracks.ts`,
`services/streamMonitor.ts`, `services/librarySync.ts` and the web health page (`HealthPage` → `ControlCenterPage` rename in progress). Run `git status` for the current list —
this section is a hint, not the source of truth. When these land, update the schema doc
([reference/database-schema.md](reference/database-schema.md)) and add CHANGELOG/FUNCTIONLOG entries in the same change.

## Resolved decisions (one line each; reasoning is in the linked doc)

- **Backend:** custom Node.js/TypeScript (Fastify), not Navidrome — [history/backend-decision-history.md](history/backend-decision-history.md).
- **Database:** SQLite, own schema, FTS5 + WAL.
- **Auth:** JWT + bcrypt; guest entry replaces the login form, `/login` kept but unadvertised, `ENTRY_CODE` ships unset, `/signup` removed (A13–A16). Guests are listen-only since 2026-10-09: no playlists, favorites, play counts or history, enforced by `requireAccount` (A37; on smol since the 2026-10-10 deploy).
- **Deployment:** Docker on a friend's Arch Linux PC (`smol`), reached via Cloudflare Tunnel at `music.nobrainmusic.my` since 2026-09-21; updated by the owner running `./scripts/deploy.sh` on smol (A47); Cloudflare Access is decided on (A74) but not switched on yet: it waits on Q77 and Q78 (A20/A21).
- **Dev environment:** WSL2 for the backend, native Windows / Android Studio for the app — [process/dev-environment.md](process/dev-environment.md).
- **Web vs Android:** Android is the listening client; web is the control room (management parity and beyond).

## Open questions

The list is [QUESTIONS.md](QUESTIONS.md) — check it before asking anything. Blocking now: **Q77** and **Q78**
(how the Android app and guests get past Cloudflare Access, before it is switched on; A74).

## Next

1. **Box 13 — reach it from outside** (ops): the tunnel + Access gate; nothing else in v0.2 gets music onto a phone away from home.
2. **Android Phase 2 — on-device check** (box 17): run the checklist on the POCO F5. Phase 3 (box 18) is built too and needs the same phone check; Home + playlists come next (A22).
3. Commit or finish the failure-logging work above.
4. v0.3 starts with the room-sync spec (box 21) — spec before code.
5. Fix the rest of the 2026-10-11 review findings. The worst batch is done (ca945ba, not yet on smol); R3 and R4 are
   next: [process/session-review-2026-10-11.md](process/session-review-2026-10-11.md), and the other `review-*` files
   in `process/`.

The current unticked boxes are authoritative in the roadmap; if this list disagrees with it, the roadmap wins.
