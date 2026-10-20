# Smart auto-mixes

## Goal

Play songs from the library that sound like the one you're on: start a radio from any song, keep the music going when the queue runs out, and get a few fresh mixes on Home every day.

**Done when:** on the phone, the owner taps Start radio on a song, hears 20 songs that fit with it, lets the queue run out without the music stopping, and sees new mixes on Home the next day.

## Not doing

- ML audio models (Essentia, CLAP) or any new native audio dependency
- Mixes from songs outside the library, or any external recommendation service
- Mixes in listen-together rooms
- Sharing mixes outside the server (sharing links are out of scope)

## Decisions

- A234 (hybrid similarity; song radio, endless queue, daily mixes)
- A235 (endless queue on by default), A236 (up to 6 daily mixes), A237 (mixes not on profiles), A238 (audio pass in Phase 1)

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Structure: audio features | Migration 0042, ffmpeg background pass | Done | [Phase 1](#phase-1-structure-audio-features) |
| 2. Structure: similarity | Candidate SQL, scoring, `/mix/radio`, `/mix/daily` | Done | [Phase 2](#phase-2-structure-similarity-and-endpoints) |
| 3. Interior (web) | Start radio, endless queue, Mixes menu | Done | [Phase 3](#phase-3-interior-web) |
| 4. Interior (Android) | Same on Android | Built, release not tagged | [Phase 4](#phase-4-interior-android) |
| 5. Walkthrough | Real-library run, by-ear check, phone, docs | In progress | [Phase 5](#phase-5-walkthrough) |

---

## Phase 1: Structure (audio features)

- [x] Migration `0042_create_track_features.sql`: `track_features(track_id PK, version, tempo, energy, dynamics, brightness, analyzed_at)`, cascade on track delete; `database-schema.md` updated
- [x] `services/audioFeatures.ts` built like `services/loudness.ts`:
  - one track at a time, in batches of 50
  - `renice(10)`
  - failed set in memory
  - rerun flag
  - `FEATURES_VERSION`: a missing row or an old version means pending
- [x] Measure a 60 s mono 11 kHz PCM slice starting 30 % in, computed in TS:
  - energy: mean RMS
  - dynamics: RMS p90 minus p10
  - brightness: zero-crossing rate
  - tempo: autocorrelation of the onset envelope, 60 to 180 BPM
- [x] Started from `index.ts` after loudness. A row stops counting when the track's file size changes, so the scanner needs no change. The Control Center shows progress.
- [x] Tests on synthetic PCM (`cd backend && npm test`)

## Phase 2: Structure (similarity and endpoints)

- [x] `db/similarity.ts` finds candidates. A song is a candidate if any of these hold:
  - shared genre
  - same artist or album artist
  - played next to the seed song (consecutive plays within 30 min, any user)
  - within 5 years of it

  At most 1500 candidates. Leaves out the user's less-often and hidden songs.
- [x] `services/mix.ts` scores each candidate:
  - genre overlap 0.30
  - played next to each other 0.25
  - audio distance 0.25
  - same artist 0.10
  - year 0.05
  - liked 0.05

  Then a seeded weighted pick (`seededWeightedOrder`), then `smartShuffle`.
- [x] `GET /mix/radio?seedTrackId=&seed=&exclude=&limit=`
- [x] `GET /mix/daily`: up to 6 mixes of 30 songs, one per top genre from the last 30 days' top genres. Seeded by user and date, cached per day.
- [x] Tests:
  - scoring order
  - exclude paging never repeats a song
  - daily mixes stay the same within a day

## Phase 3: Interior (web)

- [x] Start radio on the song menu and in Now Playing, using `playQueue(tracks, 0, loadMore)` paging `/mix/radio`
- [x] Endless queue in `PlayerBar.tsx` when there is no `loadMore` or it is done. Settings toggle, on by default (A235). Off in rooms.
- [x] A "Mixes" menu in the library toolbar. The web has no Home page, and a row would break the Simple view's fixed layout
- [x] `npm run build`, `npm run lint`, Playwright check

## Phase 4: Interior (Android)

- [x] API: `getRadio`, `getDailyMixes`
- [x] Radio source in `PlaybackController.maybeRefill`, plus endless queue and a Settings toggle
- [x] Start radio in the song menu (Now Playing opens the same menu); "Mixes for you" row on Home
- [x] `./gradlew assembleDebug`
- [ ] Release notes, tag

## Phase 5: Walkthrough

- [x] Time the audio pass on a copy of the real DB: 1.05 s a song, 141 MB RSS, over 40 files; about 3.7 h for 12,759 songs at local speed
- [ ] By ear: radios from 5 seed songs
- [ ] Phone walkthrough
- [x] CHANGELOG, FUNCTIONLOG, STATUS, brainstorm row

## Change log

| Date | Change | Why |
|---|---|---|
| 2026-10-20 | Plan written | Owner picked the idea from the brainstorm list (A234) |
| 2026-10-20 | Web mixes moved from a Home row to a toolbar menu; endless radio waits until music plays; pick weight score⁴ instead of score² | The web has no Home page; a restored paused queue fetched a radio on page load; with score², tied tags drowned out the audio difference |
