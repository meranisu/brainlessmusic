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

- ~~Fetch artists, albums, tracks from backend endpoints (TBD — backend library-scan endpoints not yet built)~~ **stale as of 2026-09-18 — the backend has been fully built since 2026-09-08/09.** `GET /artists`, `/artists/:id` (embeds albums), `/albums/:id` (embeds tracks), `/search` are all live; see `.docs/features/android-phase-1-browse/planning.md`.
- Compose screens: Artists list → Album grid → Track list (detail)
- Cover art loading with a Compose image loader (Coil recommended), placeholder/fallback art
- Basic search — artist/album/track results
- Loading states, empty states, pull-to-refresh

**Done when:** user can browse from artist down to individual tracks, see cover art, and search the library.

**Status:** scaffolded and build-verified 2026-09-18 — same day as Phase 0. Artists list, artist detail (album grid), album detail (track list), and search are all built against the real backend endpoints, with Coil-loaded cover art and manual refresh actions. `./gradlew :app:assembleDebug :app:lintDebug` succeeds, lint unchanged from Phase 0's clean baseline. **Not yet run anywhere** — see `.docs/features/android-phase-1-browse/planning.md`.

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

**Status:** built 2026-09-28 (Media3 `ExoPlayer` in an app-wide `PlaybackController`, mini player, Now Playing, queue, scrobble by the web rule); build, lint and unit tests pass. **No audio has been played yet** — on-device check pending. Detail and the on-device checklist: `.docs/features/android-phase-2-playback/planning.md`. Background/lock-screen playback remains Phase 3.

---

## Phase 3 — Background & System Integration

**Goal:** Playback survives backgrounding and is controllable from outside the app.

- Wire Media3 `MediaSession` to the player
- Foreground service so playback continues when app is backgrounded/screen off
- Lock-screen and notification media controls (play/pause/skip, artwork)
- Handle audio focus (pause on call/other app audio, duck if appropriate)
- Handle headphone/Bluetooth disconnect → auto-pause

**Done when:** user can start playback, leave the app or lock the phone, and control playback from the notification/lock screen without it stopping unexpectedly.

**Status:** built and build-verified 2026-09-28 (`PlaybackService`, notification permission, authenticated artwork). Audio focus and auto-pause on headphone disconnect were already in Phase 2. Screen-off playback and the notification confirmed on a phone 2026-09-28; the rest of the checklist is in `.docs/features/android-phase-3-background/planning.md`.

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

## Design language — Material You (decided 2026-09-28)

The Android app follows **Material You**: on Android 12+ (API 31) the color
scheme comes from the device wallpaper via Material3's
`dynamicDarkColorScheme`/`dynamicLightColorScheme`, and on Android 13+ the
launcher icon supplies a `<monochrome>` layer so it joins the system's
themed-icons setting. This applies to every phase, not just Phase 1 — new
screens use `MaterialTheme.colorScheme` roles and never hardcode colors.

- **Fallback:** devices below API 31 (minSdk is 26) have no wallpaper-extraction
  API, so they keep the static navy/orange scheme in `ui/theme/Theme.kt`
  unconditionally. `BrainlessMusicTheme(dynamicColor = false)` forces that
  scheme on 12+ as well, if the brand palette is ever wanted there.
- **What this trades away:** on Android 12+ the app no longer matches the web
  app's navy/orange identity — that is the point of dynamic color, and was
  the owner's explicit call. The web palette is untouched.
- **Implication for screens:** avoid `Orange500`/`Navy*` from `Color.kt`
  directly in composables (only `Theme.kt` should read them), or the
  dynamic scheme will be bypassed on those elements.

### Light / dark (2026-09-28)

The scheme always followed the phone's light/dark setting, but there was no way to override it in the app. Settings now has
**Theme: System / Light / Dark** (`AppearanceSettings`, DataStore, default System, survives logout). It picks between the
dynamic (or static fallback) dark and light schemes; Material You wallpaper color still applies in both. The saved choice is
read once synchronously at launch so a forced theme never flashes the other one, the status/navigation bar icon colors follow
the app's choice rather than the phone's, and the pre-Compose window background is now light by day / navy by night
(`values/` and `values-night/`) instead of always navy. Not verified on a device.

### Mini player vs. navigation bar (2026-09-28)

On newer Android the mini player and the navigation bar under it were visibly different tones: the player was `surface`
plus a tonal overlay, the bar is `surfaceContainer`. The player now uses `surfaceContainer` too. On the artist and album
screens the player sits alone and had no system-bar inset, so it drew under the phone's own navigation bar; it now extends
under it (`extendUnderSystemBar`, off when it is stacked on the app's bar, which already does). Not verified on a device.

## App icon (2026-09-28)

An abstract mark: an orange disc with a waveform cut out of it and a small satellite dot, on a deep-navy adaptive
background with one tonal circle (`res/drawable/ic_launcher_*.xml`, all vectors). Shapes stay inside the 66 dp safe
zone. The `<monochrome>` layer is the same shape in one color, so on Android 13+ with "Themed icons" on the system
recolors it from the wallpaper (Material You). Replaces the placeholder play-triangle-in-a-ring.

## Notes for implementation

- Auth token should be cached and reused per session rather than regenerated on every request, refreshed/re-logged-in on 401
- Keep the API client as its own module/package — when room-sync WebSocket and other features land later, this playback module should be reusable largely as-is
- Media3 was chosen specifically because it handles gapless/crossfade, background audio, and lock-screen controls, and has first-class Android Auto support for later
