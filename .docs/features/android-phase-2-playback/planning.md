# Phase Plan — Android Phase 2 (Playback)

Roadmap box 17 (`.docs/process/development-roadmap.md`); scope from
`.docs/process/android-phased-plan.md` "Phase 2 — Core Playback Engine".
Started first because [A22](../../QUESTIONS.md#a22--home-dashboard-playlists-and-genre-on-android-in-what-order-was-q31)
put playback ahead of Home, playlists and genre.

## Goal

Tapping a track plays it, with seek, next/previous, a queue, a Now Playing
screen, and a play recorded on the server.

## Phase Overview

| Phase | What it covers | Status |
|---|---|---|
| 1. Plan | Player placement, auth for streaming, scrobble rule, scope | Done |
| 2. Structure | `PlaybackController` (ExoPlayer), `ListenTracker`, scrobble API | Done |
| 3. Interior | Tappable tracks, mini player, Now Playing, queue | Done |
| 4. Walkthrough | Build, unit tests, lint, **on-device listening** | Build/tests/lint done 2026-09-28; **nothing has been played yet** |

## Phase 1: Plan

- [x] **One in-process ExoPlayer in a Hilt singleton** (`playback/PlaybackController.kt`). The phased plan puts the
  `MediaSession`/foreground service in Phase 3, so Phase 2 does not build it; Phase 3 wraps this controller rather than
  replacing it. `MediaItem`s already carry title/artist/album/artwork metadata so the session gets it for free.
- [x] **Streaming needs no media token.** `authenticateMedia` accepts a plain bearer header (`backend/src/plugins/auth.ts`),
  so ExoPlayer's `OkHttpDataSource` is built on the same authenticated `OkHttpClient` as Retrofit and Coil. The web app's
  `?token=` exchange exists only because `<audio>` cannot set headers.
- [x] **A play is recorded by the web player's rule** — half the track or four minutes, whichever is less, unknown duration
  falls back to four minutes (`frontend/src/components/PlayerBar.tsx:53-113`) — so a listen on either client moves the same
  counter. Time is counted from wall-clock ticks while actually playing, not from the player's position, so seeking to the
  end does not count as hearing it. Pulled into a pure class (`ListenTracker`) so it could be unit-tested.
- [x] **What "the queue" is:** an album (tap a track → the album plays from there) or the visible track results of a
  search. "Play next" inserts after the current track, from the overflow menu on album tracks.

## Phase 2: Structure

- [x] `POST /tracks/:id/scrobble` in `ApiService`; `LibraryRepository.scrobble()` / `streamUrl()`.
- [x] `PlaybackController`: `playQueue`, `playNext`, `togglePlayPause` (also retries a failed track and restarts an ended
  queue), `seekTo`, `skipToNext/Previous` (previous restarts the track past 3 s), `skipToIndex`, `stop`. State is one
  `StateFlow<PlaybackUiState>`, refreshed on player events and every 500 ms while playing.
- [x] **Errors:** a track that fails to load is skipped if there is a next one (one bad file should not end an album);
  on the last track the error is shown ("Network problem…", "The server refused this track.", "Couldn't play this track.").
- [x] **Logout stops playback** (`ArtistsListViewModel.logout`), so the previous account's music cannot keep playing over
  the sign-in screen — the same bug the web app had and fixed on 2026-09-09.
- [x] Audio focus and pause-on-headphones-unplugged are two ExoPlayer flags (`setAudioAttributes(..., true)`,
  `setHandleAudioBecomingNoisy(true)`), so they are on now rather than waiting for Phase 3. Notification, lock-screen
  controls and background playback are still Phase 3.

## Phase 3: Interior

- [x] Album track rows and search track results are tappable; the playing track is bold/primary-coloured in the album.
- [x] `MiniPlayer` above the navigation bar on both tabs, and alone on artist/album detail; hidden until something is queued.
- [x] `NowPlayingScreen`: cover, title, artist — album, seek slider (thumb follows the finger while dragging, seeks on
  release), elapsed/total, previous / play-pause / next, error line, and the queue (tap to jump).

## Phase 4: Walkthrough

- [x] `./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug` — **BUILD SUCCESSFUL**, no compiler warnings.
  7/7 `ListenTrackerTest` cases pass (threshold for short/long/unknown durations, fires exactly once, paused time earns
  nothing, a stalled ticker cannot credit minutes, non-positive ticks ignored). Lint 38 warnings, all "newer version
  available" or the already-accepted cleartext config, except the two below.
- [x] **Two real problems found by the tools, both fixed:** lint failed the build on `@OptIn(UnstableApi::class)` — Media3's
  marker is an AndroidX experimental annotation, so it needs `androidx.annotation.OptIn`, not Kotlin's (the compiler had
  warned that Kotlin's was being ignored); and a `when` over `playbackState` lacked an `else`.
- [x] **Confirmed by the owner on the POCO F5, 2026-09-28:** audio playback works on both mobile data and Wi-Fi.
- [ ] **Still unconfirmed** (not reported yet): what only a phone can confirm from the list below —
  - a tapped album track starts, and the album continues to the next track on its own;
  - seeking mid-track works (the server sends byte ranges — untested from ExoPlayer);
  - Opus/Ogg files play (ExoPlayer supports them; this library is mostly Opus);
  - **the play count rises on the web** after a full listen — the check that the scrobble actually landed;
  - Play next inserts after the current track; the mini player and Now Playing stay in step;
  - logging out stops the music; airplane mode mid-track shows a sensible message.

## Not built, on purpose

- **Shuffle and repeat** — not in Phase 2's list; the web player has both and `POST /shuffle` exists.
- **Background / lock-screen playback** — Phase 3. Until then playback is only dependable while the app is in front.
- Data-saver (`?quality=low`), queue editing beyond Play next, "add to end of queue" — later phases.

## Resume where you left off (added 2026-09-28)

Owner's call on A9's open item: **a Settings toggle**, not a fixed behavior.

- `PlaybackResume` saves to `PUT /me/playback-state` on a queue/track change, on play/pause, every 10 s while playing
  (`ResumeSavePolicy`, unit-tested) and when the activity stops. An empty queue never overwrites what is saved.
- On the first screen after login or a restored session, `restore()` fetches `GET /me/playback-state` and queues it at the
  saved position — **paused by default**, playing if **Settings → Auto-play on resume** is on
  (`PlaybackSettings.autoPlayOnResume`, DataStore, default off, survives logout).
- If the listener has already started something while the fetch was in flight, the restore does nothing.
- Logout does not clear the saved state (it belongs to the account and follows it across devices).
- Same server row as the web player, so it also picks up a queue started on the web. Last write wins.

Verify on the phone: play, kill the app, reopen → queue and position back, paused; flip the toggle, repeat → it plays;
then start a queue on the web and reopen the app → the web queue appears.

## Now Playing redesign (2026-09-28)

Owner's request after seeing it on the phone.

- **Three lines, left-aligned:** title, artist, album; the cover fills the content width so their left edges line up.
- **Shuffle and repeat** (off / whole queue / this track) beside the transport buttons, lit when on, remembered across launches
  (`PlaybackSettings`). Plain ExoPlayer shuffle of the current queue — the server's smart shuffle (`POST /shuffle`) is not used.
  `hasNext`/`hasPrevious` are now asked of the player, since with shuffle or repeat on "next" is not index + 1.
- **Queue button** opens a bottom sheet with the queue, scrolled to the current track; the inline queue list is gone.
- **Stream readout:** codec (the server's container name, else the MIME type), sample rate, channels and bitrate when the stream
  declares one (FLAC and Opus often don't), plus how far ahead the buffer is and ExoPlayer's running network estimate. Read from
  the player, so a transcoded stream would show what is really arriving. The network figure is an estimate, not a measurement.
- **Progress bar styles** (Settings → Progress bar, each with a live preview): squiggle (default; animates while playing, flat
  when paused), classic Material slider, thin line, pill with a gap around the handle, dots. Drawn by hand
  (`ui/playback/SeekBar.kt`) because Material 3's official wavy slider is only in a pre-release library.
- Known limit: with shuffle on, "Play next" inserts after the current track in list order, not necessarily next in play order.
- Build, unit tests and lint pass; **not seen on a device.**

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-28 | Interior | Added resume-where-you-left-off with an auto-play toggle (Settings screen) | Owner's decision on A9's open item | Yes — additive; no playback API changed |
| 2026-09-28 | Structure | Audio focus and becoming-noisy handling turned on in Phase 2 instead of Phase 3 | Each is one ExoPlayer flag; leaving them off would make Phase 2 playback talk over calls | Yes — Phase 3 keeps everything that needs a service |
