# Project Status

_Last updated: 2026-10-18 (smart playlists, library letter jump) — live snapshot; full history frozen in [history/status-archive.md](history/status-archive.md)._

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
| Auth (JWT + bcrypt, guest entry, admin role, user management) | Built, verified; guest accounts (A67–A70) live on smol and in Android v0.3.11 (2026-10-11); review fixes (6ded2eb) on smol since the 97ba069 deploy | archive; A13–A16, A41–A43, A67–A70 in QUESTIONS; [features/guest-accounts](features/guest-accounts/planning.md#open-issues-from-review-2026-10-11) |
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
| Android Phase 1 — browse | Done, owner-confirmed on the phone 2026-10-11 (box 16) | [features/android-phase-1-browse](features/android-phase-1-browse/planning.md) |
| Android Phase 2 — playback (Media3, queue, Now Playing, scrobble) | Done, owner-confirmed on the phone 2026-10-11 (box 17) | [features/android-phase-2-playback](features/android-phase-2-playback/planning.md) |
| Android Phase 3 — background (MediaSession, foreground service, notification/lock-screen controls) | Done, owner-confirmed on the phone 2026-10-11 (box 18) | [features/android-phase-3-background](features/android-phase-3-background/planning.md) |
| Reach it from outside (roadmap box 13) | Done, owner-confirmed 2026-10-11 (box 13); Cloudflare Access still off pending Q77/Q78 | [ops/cloudflare-tunnel-deployment.md](ops/cloudflare-tunnel-deployment.md) |
| Room sync (v0.3) | **Done, owner-confirmed 2026-10-12** (boxes 22, 23): Listen together works, playback stays in sync. Spec agreed (box 21, A100–A103); backend, web and Android built 2026-10-11 (`/together`, Listen together screen on Android); web checked in headless Chromium, Android socket client checked against a scratch server, not on a phone yet; smol answers the room routes and socket (checked 2026-10-11); Android v0.3.28 released with it | [specs/room-sync.md](specs/room-sync.md) |
| Headset buttons (Android, web) | Built and pushed 2026-10-18 (A202, A203), Android v0.4.20. Not tried on a phone: Android ignored presses before and the cause was never found. Next: owner tries a wired and a Bluetooth headset, screen off; if still silent, read `adb logcat -s PlaybackService` | [features/headset-buttons/planning.md](features/headset-buttons/planning.md) |
| Sleep timer (Android) | Built 2026-10-18 (A204 to A206), 11 unit tests pass, not phone-tested. Next: release v0.4.21, owner tries it with the screen off | [features/sleep-timer/planning.md](features/sleep-timer/planning.md) |
| Smart playlists | Built on backend (migrations 0038, 0039), web and Android; steady daily Random, kept list summaries and a covering index added. Backend 684 tests pass, Android `assembleDebug` and 175 unit tests pass, web walked through in a browser (12 of 12) on a throwaway library. Phone never seen running. Not committed. A207 to A211 decided. Next: phone walkthrough, then version bump, web "What's new", v0.4.22 tag (its notes assume v0.4.21, the untagged sleep timer, ships too) | [features/smart-playlists/planning.md](features/smart-playlists/planning.md) |
| Library letter jump (web) | Built (A212, A213; Q205 answered, A215): the letter rail jumps anywhere and only nearby pages load. Checked in a browser on a throwaway library (10 of 10) and on a copy of the real local database, 12,759 songs (jumps 26 to 300 ms; 22 pending migrations applied cleanly to the copy). Not committed, not tried by hand yet. Next: release with smart playlists | [features/library-letter-jump/planning.md](features/library-letter-jump/planning.md) |
| In-app updates (Android) | Built 2026-10-11 (A104–A106), first shipped in v0.3.29; untested on a phone until a v0.3.29 install sees the next release | [features/app-self-update/planning.md](features/app-self-update/planning.md) |
| Account invites | Built 2026-10-12 (A107–A112). 2026-10-13: sign-up page with typed 8-character codes, email (required) and optional passcode, sign-in by email, invite links open the Android app (A187–A192); committed locally, not pushed. Next: push, then a walkthrough on smol and the phone (a real invite, a guest upgrade, email sign-in) | [features/account-invites/planning.md](features/account-invites/planning.md) |

## Resolved decisions (one line each; reasoning is in the linked doc)

- **Backend:** custom Node.js/TypeScript (Fastify), not Navidrome — [history/backend-decision-history.md](history/backend-decision-history.md).
- **Database:** SQLite, own schema, FTS5 + WAL.
- **Auth:** JWT + bcrypt; guest entry replaces the login form, `/login` kept but unadvertised, `ENTRY_CODE` ships unset, `/signup` removed (A13–A16). Guests are listen-only since 2026-10-09: no playlists, favorites, play counts or history, enforced by `requireAccount` (A37; on smol since the 2026-10-10 deploy).
- **Deployment:** Docker on a friend's Arch Linux PC (`smol`), reached via Cloudflare Tunnel at `music.nobrainmusic.my` since 2026-09-21; deploys itself from `main` once CI passes (`scripts/auto-deploy.sh` timer on smol, A120; `deploy.sh` by hand still works); Cloudflare Access is decided on (A74) but not switched on yet: it waits on Q77 and Q78 (A20/A21).
- **Dev environment:** WSL2 for the backend, native Windows / Android Studio for the app — [process/dev-environment.md](process/dev-environment.md).
- **Web vs Android:** Android is the listening client; web is the control room (management parity and beyond).

## Open questions

The list is [QUESTIONS.md](QUESTIONS.md) — check it before asking anything. Blocking now: **Q77** and **Q78**
(how the Android app and guests get past Cloudflare Access, before it is switched on; A74). Open, non-blocking: **Q5**.

## Next

1. v0.2 is done: box 19 (offline downloads) passed the phone checklist 2026-10-11.
2. Cloudflare Access (A74): switch on once Q77 and Q78 are answered.
3. v0.3 is done: Listen together owner-confirmed 2026-10-12 (boxes 22, 23).
4. v0.4, "The library makes sense" (A147): album artist, compilations, disc numbers, genres. Box 24 done ([features/metadata-model/planning.md](features/metadata-model/planning.md)): smol measured, 14,123 albums today, about 2,900 after. Boxes 25-27 live on smol 2026-10-12: 14,123 albums → 3,404, disc numbers and 359 genres (backup in `/data/backups/pre-v0.4/`). Stray songs joining the big album (A154) built, ships with the next push and applies at the next scan. v0.4 is done: box 28 owner-confirmed on the phone (Android v0.4.0) and the web 2026-10-12. Stray songs (A154) join their albums at smol's next scheduled scan.
5. Backend commits after 97ba069 (3724daa, 8fe408e, 920cd50) are not confirmed on smol yet.
6. The 2026-10-11 review findings are fixed (ca945ba, 6ded2eb, and F2/F5/G2 after; on smol). Left: G3 (closed by
   Access, A74, once it is on), and the unconfirmed "plausible" items in
   [process/session-review-2026-10-11.md](process/session-review-2026-10-11.md), mostly crossfade edge cases.

The current unticked boxes are authoritative in the roadmap; if this list disagrees with it, the roadmap wins.
