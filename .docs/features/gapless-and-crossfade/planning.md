# Gapless playback and fades

## Goal

Tracks play back to back with no gap (A56), and the owner asked on 2026-10-11 for fades as well ("gapless playback and
fade in, fade out"). Web player and Android are planned separately, because they start from very different places.
Not on the roadmap: v0.2 is still open (box 13), and the owner asked for this directly.

## Where it starts (2026-10-11)

- **Web:** one `<audio>` element, created once (`frontend/src/components/PlayerBar.tsx:288-294`). The next track
  starts only from the `ended` handler (`:843-860`) by swapping `src` (`:430-456`), so there is always a gap: fetch,
  decode, then play. Nothing buffers the next track in the browser; `/prepare` only warms the server's transcode cache
  (`:980-989`). No Web Audio, gain or fade code exists. Media Session handlers and position state act on that one
  element (`:864-958`).
- **Server:** originals are served as-is; transcodes are 64k Opus in Ogg (data saver), AAC in MP4 for Safari/iOS, and
  an MP4 remux for raw `.aac` (`backend/src/services/streaming.ts:20-32`, `:179-221`). No ffmpeg flag touches encoder
  delay or padding.
- **Android:** the whole queue is already an ExoPlayer playlist (`playback/PlaybackController.kt:137`), so Media3's
  built-in gapless applies. Android always requests the original file (`data/repository/LibraryRepository.kt:88`).
  No fade or volume code. Media3 has no crossfade.

Encoder delay is the hard part of "no gap": MP3 and AAC files carry padding at both ends, Opus a pre-skip. A player
that ignores it plays tens of milliseconds of silence at each boundary even when the switch itself is instant.
ExoPlayer reads the LAME and iTunes gapless tags and Opus pre-skip; browsers vary. Phase 2 measures instead of
assuming.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | This doc; A71 to A73 | Done | [Phase 1](#phase-1-plan) |
| 2. Measure | A generated test album; what each player does at the boundary today | In progress: web decoders done; Android and Safari need a device | [Phase 2](#phase-2-measure) |
| 3. Android gapless | Confirm or fix Media3 gapless; nothing to build if Phase 2 says it's clean | Not started | [Phase 3](#phase-3-android-gapless) |
| 4. Web engine | Two elements; preload the next track; Media Session follows the playing one | Done | [Phase 4](#phase-4-web-engine) |
| 5. Web gapless and fades | Handoff at the boundary; fades per A71 and A72; settings in Options | Done, except listening to the join | [Phase 5](#phase-5-web-gapless-and-fades) |
| 6. Android fades | Fades per A71 and A72 on Android; settings in Settings → Playback | Built, not run on a device | [Phase 6](#phase-6-android-fades) |
| 7. Walkthrough | Listen to real albums on both clients; done checklist | Not started | [Phase 7](#phase-7-walkthrough) |

---

## Phase 1: Plan

- [x] Map today's playback on web, server and Android (above)
- [x] A71: all three fades, each optional. "Between songs" is one choice: Gapless (default), Crossfade, or Fade out,
      then in (3, 6, 9 or 12 s). "Fade on pause, play and skip" is its own switch, on by default
- [x] A72: "Keep albums gapless" switch, on by default: no fade between back-to-back tracks of one album
- [x] A73: two elements first, measured; MSE only if the seam is audible

## Phase 2: Measure

- [x] Generate a test album in a temp dir (never the library): one continuous tone or count-in split into 4 tracks,
      encoded as MP3 (LAME), AAC (M4A), Opus and FLAC. A gap or click at a boundary is then audible and visible.
      Done 2026-10-11: 440 Hz, 44.1 kHz, cut into four 5 s WAVs (220,500 samples each), then encoded with ffmpeg 6.1:
      `libmp3lame` 192k, `aac` 192k in MP4 with `+faststart` (the server's WebKit recipe), `libopus` 64k
      `-vbr constrained` in Ogg (the data-saver recipe), and FLAC
- [x] Web decoders, 2026-10-11, `decodeAudioData` in headless Playwright browsers: **Chromium 153 and Firefox 155
      decode every format to 220,500 samples (Chromium's Opus: 220,499), with the same edge samples as the WAV.** Both
      already cut MP3 and AAC encoder padding and Opus pre-skip, so on the web the seam is the element switch, not the
      files. Caveats: this is the decode path, not `<audio>` playback (same demuxers in both engines, not measured
      separately); WebKit would not launch here, so Safari/iOS is unmeasured; files from encoders that write no
      gapless tag (old MP3s without a LAME header) will still carry padding, and nothing client-side can know how much
- [ ] Android: play each format through the app (a dev backend pointed at the temp dir); record whether boundaries
      are clean
- [ ] Web: Chrome, Firefox and Safari/iOS if available; current single-element player as the baseline
- [ ] Web: how much of the seam is decoder delay vs. the element switch (check by switching two preloaded elements
      in a scratch page)

## Phase 3: Android gapless

- [ ] If Phase 2 is clean: nothing to build; note it in the CHANGELOG
- [ ] If not: per format, fix the cause (missing gapless tags, an extractor flag, or a server variant)

## Phase 4: Web engine

- [x] Two `<audio>` elements, one playing, the other holding the next track. Fades are `audio.volume` ramps, not Web
      Audio gain nodes (see the change log)
- [x] Preload the next track into the idle element 15 s into each song, alongside `/prepare`
- [x] Everything that touches `audioRef` follows "the playing element": controls, seek, position state, Media
      Session, the data-saver swap, the compat retry. Listeners act only for the playing element
- [x] `crossOrigin`: not needed, no Web Audio
- [ ] ~~No behaviour change yet; ship before Phase 5~~: built together with Phase 5 (change log)

## Phase 5: Web gapless and fades

- [x] Gapless: start the preloaded element ~10 ms before the end (`timeupdate` plus a timer), then release the old one
- [ ] Listen to the join on real albums in Chrome, Firefox and Safari (headless measurement was unstable)
- [x] Fades per A71 and A72: linear `audio.volume` ramps every 20 ms, times the volume slider
- [x] Settings in Options → Playback: "Between songs" (three-way choice plus length), "Fade on pause, play and
      skip", "Keep albums gapless". Stored per device, like data saver
- [x] Repeat-one (always gapless), last track (no boundary), skip and pause mid-fade (the fade-out stops, a newer
      action wins), seek after a planned boundary (re-planned). A queue edit after the preload falls back to the
      normal load

## Phase 6: Android fades

- [x] Per A71 and A72, same settings. Fade out then in: `player.volume` ramps on the one ExoPlayer. Crossfade: a
      short-lived second ExoPlayer plays the *old* song out while the main one (which keeps the MediaSession) moves to
      the next song, so no session hand-over is needed. Dropped back to gapless if anything doesn't line up
- [x] Pause, play and skip fade from the notification and headset too (`ForwardingPlayer` on the session)
- [ ] On a phone: fades, the crossfade join (`TAIL_START_LEAD_MS` 60 ms is a guess), notification controls, a call
      or unplugged headphones mid-crossfade
- [x] Settings in Settings → Playback (`SettingsScreen.kt`, `PlaybackSettings.transitions`)

## Phase 7: Walkthrough

- [ ] A continuous album (live or DJ mix) end to end on both clients, crossfade off: no gap
- [ ] A shuffled playlist with fades on: fades as chosen, and the A72 album switch holds both ways
- [ ] Lock screen, notification, headphones unplugged, data-saver swap mid-track
- [ ] `npm test`, `npm run build`, `npm run lint`, `./gradlew assembleDebug`
- [ ] CHANGELOG and FUNCTIONLOG; A56 marked built

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-10-11 | Plan | Plan written; fades added to the scope | Owner asked for "gapless playback and fade in, fade out" | Yes |
| 2026-10-11 | Plan, 5, 6 | A71 to A73: all three fades, each optional; album switch | Owner answers | Yes |
| 2026-10-11 | 4, 5 | Fades use `audio.volume` ramps, not Web Audio gain nodes; Phases 4 and 5 built together | Routing playback through an `AudioContext` makes it silent whenever the context is suspended or the stream is cross-origin, for no gain: iOS ignores volume either way, so fades there are off regardless | Yes |
| 2026-10-11 | 6 | Crossfade keeps the session on the main player and moves the *old* song to a tail player | Handing the MediaSession between players mid-song is what made this the bulk of the work; this way the session never changes player | Yes |
| 2026-10-11 | 5, 6 | Review found join and fade races, and that A72 mostly doesn't apply: R3, R4 and R6 to R16 in [the review](../../process/session-review-2026-10-11.md) | Code review of 9a8d781 and 3248c01 | Yes; fix before Phase 7 |
| 2026-10-11 | 2 | Measured decoders in headless Chromium and Firefox; the join itself could not be measured headless | Fake audio output gave unstable stall numbers (17 to 170 ms) | Yes; Phase 7 listening decides |
