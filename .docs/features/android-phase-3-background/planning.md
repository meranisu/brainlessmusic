# Phase Plan — Android Phase 3 (Background & system integration)

Roadmap box 18; detail in `.docs/process/android-phased-plan.md` "Phase 3".

## Goal

Playback survives leaving the app or locking the phone, and is controllable from the notification, the lock screen and
headset/Bluetooth buttons.

## Phase Overview

| Phase | What it covers | Status |
|---|---|---|
| 1. Plan | Where the player lives, how the service starts, permissions | Done |
| 2. Structure | `media3-session`, manifest, `PlaybackService` | Done |
| 3. Interior | Artwork behind the bearer token, notification permission, task removal | Done |
| 4. Walkthrough | Build, lint, release check; **on-device check pending** | Build verified 2026-09-28 |

## Decisions

- **The player stays owned by `PlaybackController`** (a Hilt singleton), not by the service. `PlaybackService` only lends
  it to a `MediaSession` (`sessionPlayer`). The alternative — moving the player into the service and driving it from the UI
  through a `MediaController` — is the textbook shape but would have rewritten all of Phase 2 blind, with no device here.
  The cost: if the system kills the process the music stops with it, same as any player; if it kills only the service,
  the queue survives.
- **How the service starts.** On the first queue load the controller connects a `MediaController` to the session and holds
  it for the process's life. That binds the service, and Media3 promotes it to a foreground service (and posts the
  notification) whenever the player is playing. Nothing calls `startForegroundService` by hand.
- **Manifest:** `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (required at targetSdk 34), `POST_NOTIFICATIONS`;
  the service is `foregroundServiceType="mediaPlayback"` and exported, as `MediaSessionService` requires.
- **Notification permission** (Android 13+) is requested the first time something is queued, not at launch. Denied means
  the audio still plays in the background but the notification and its controls are hidden.
- **Artwork.** The default bitmap loader fetches covers without the bearer token, so every cover would 401. The session
  uses `DataSourceBitmapLoader` over the app's authenticated OkHttp client.
- **Swiping the app away** stops the service unless something is playing.
- **Already done in Phase 2:** audio focus (pause on calls / other audio) and auto-pause when headphones or Bluetooth
  disconnect (`setHandleAudioBecomingNoisy`).

## Walkthrough

- [x] `./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug :app:assembleRelease` — BUILD SUCCESSFUL; 14/14
  unit tests; lint 0 errors, 42 warnings (new: the exported service, which is by design; the two ABI/cleartext notes).
  Release APK 2.5 MB (`media3-session` added ~0.5 MB), signature and manifest checked.
- [ ] **Not verified: anything on a device.** Only a phone can confirm:
  - start an album, press Home / lock the screen → music keeps playing;
  - the notification shows title, artist and **cover art**, and play/pause/next/previous work from it and from the lock screen;
  - first play on Android 13+ shows the notification-permission prompt; denying it still leaves audio playing;
  - unplug wired headphones / disconnect Bluetooth → pauses; a headset button toggles play/pause;
  - a phone call or another app's audio pauses it and it does not restart by itself unexpectedly;
  - swipe the app from recents while paused → notification goes; while playing → music continues;
  - logout removes the notification and stops the music;
  - scrobbling still lands with the screen off (play count rises on the web after a full listen);
  - the release APK (R8) shows the same behaviour as debug.

## Not built, on purpose

- Any session client other than the system's: the default `onConnect` accepts every controller. Fine for a personal app;
  worth restricting before it is ever distributed.
- Android Auto / Wear (out of scope in the phased plan), shuffle/repeat, gapless/crossfade tuning (Phase 4).

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-28 | All | Written and built | Owner asked to proceed with Phase 3 | n/a |
