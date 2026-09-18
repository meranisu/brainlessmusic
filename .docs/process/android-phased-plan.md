# Android Client — Phased Implementation Plan

**Target:** Android client (Kotlin + Jetpack Compose)
**Backend:** Custom Fastify backend (see `.docs/reference/tech-stack.md`) — JWT auth, not Navidrome/Subsonic.
**Out of scope for this doc:** Room sync, offline downloads, tag editing, smart playlists, Android Auto/Wear OS. Tracked separately in `.docs/specs/` once designed; build on top of this once it's stable.

Goal: connect → browse → stream → control. Each phase should be independently testable and shippable before moving to the next.

---

## Phase 0 — Project & Connection Foundation

**Goal:** App can be configured to point at the backend and authenticate successfully.

- Scaffold Kotlin + Jetpack Compose project, Material3 theming
- Set up Hilt for dependency injection
- Set up Retrofit + OkHttp client for REST calls, base URL configurable at runtime
- Auth against the custom backend:
  - `POST /auth/login` with username/password → JWT
  - Store JWT securely (encrypted DataStore, not SharedPreferences)
  - OkHttp interceptor attaches `Authorization: Bearer <token>` to authenticated requests
- Server config screen: URL, username, password — persisted locally
- Test connection flow: `GET /health` (no auth) to confirm reachability, then login to confirm credentials
- Error states: unreachable host, invalid credentials (401), TLS/cert issues, malformed URL — each surfaced distinctly

**Done when:** user can enter server details once, app confirms a working connection, and credentials persist across app restarts.

**Status:** scaffolded and build-verified 2026-09-18 — Gradle project, DI graph, networking, encrypted session storage, and all three screens (server-config, home placeholder, splash/restore) are written, and `./gradlew :app:assembleDebug` succeeds (JDK/Android SDK/Gradle installed user-space in WSL2, no Android Studio needed to build — see `android/README.md`). **Not yet run anywhere** — no emulator or device in this environment; the built APK is pending an on-device install/test. Full detail: `.docs/features/android-phase-0-connect/planning.md`.

---

## Phase 1 — Library Browsing

**Goal:** User can see and navigate their library.

- Fetch artists, albums, tracks from backend endpoints (TBD — backend library-scan endpoints not yet built)
- Compose screens: Artists list → Album grid → Track list (detail)
- Cover art loading with a Compose image loader (Coil recommended), placeholder/fallback art
- Basic search — artist/album/track results
- Loading states, empty states, pull-to-refresh

**Done when:** user can browse from artist down to individual tracks, see cover art, and search the library.

---

## Phase 2 — Core Playback Engine

**Goal:** Tapping a track actually plays audio, with basic transport controls.

- Integrate Media3 (`androidx.media3`) / ExoPlayer
- Build stream URLs against backend's stream endpoint (respects byte-range for seeking)
- Playback controls: play, pause, seek (scrub bar), skip next/previous
- Basic queue: "play now" (replaces queue), "play next" (insert after current)
- Now Playing UI: track/album/artist name, cover art, progress bar, transport buttons
- Playback state exposed via ViewModel (StateFlow) so UI reacts to player state changes

**Done when:** user can tap any track, hear it play, seek within it, and skip to the next/previous track in queue.

---

## Phase 3 — Background & System Integration

**Goal:** Playback survives backgrounding and is controllable from outside the app.

- Wire Media3 `MediaSession` to the player
- Foreground service so playback continues when app is backgrounded/screen off
- Lock-screen and notification media controls (play/pause/skip, artwork)
- Handle audio focus (pause on call/other app audio, duck if appropriate)
- Handle headphone/Bluetooth disconnect → auto-pause

**Done when:** user can start playback, leave the app or lock the phone, and control playback from the notification/lock screen without it stopping unexpectedly.

---

## Phase 4 — Polish

**Goal:** Playback feels smooth and adapts to network conditions.

- Gapless / crossfade playback between tracks (Media3 supports gapless natively; crossfade needs custom handling)
- Data-saver mode: switch to transcoded/lower-bitrate stream on mobile data, full quality on Wi-Fi
- Bit-depth/sample-rate indicator in Now Playing UI (lossless vs. transcoded status)
- Retry/backoff on network drop mid-stream; graceful error messaging instead of silent failure
- Basic playback stats logging hook (play count tracking)

**Done when:** playback handles flaky mobile network gracefully, respects data-saver preference, and shows quality info to the user.

---

## Notes for implementation

- Auth token should be cached and reused per session rather than regenerated on every request, refreshed/re-logged-in on 401
- Keep the API client as its own module/package — when room-sync WebSocket and other features land later, this playback module should be reusable largely as-is
- Media3 was chosen specifically because it handles gapless/crossfade, background audio, and lock-screen controls, and has first-class Android Auto support for later
