# Review: shuffle fix and shuffle modes (2026-10-11)

Covers commits `b450e12` (a tapped song's shuffle covers the whole library) and `2431cd0` (Rediscover and Albums
modes, A77), shipped in Android v0.3.12 and v0.3.13. Nothing crashes or loses data; these are open to fix. Line numbers
are as of `2431cd0`, so check them before editing.

## Worth fixing

- [ ] **S1. Albums mode leaves a hole in the album you tapped from.** With Albums on, tapping a song in Songs plays
  that song, then random albums: the rest of its album does not follow, and the tapped song is left out of the first
  pass, so its album later plays without it. Cause: the redirect in `loadQueue()`
  (`android/.../playback/PlaybackController.kt:157-162`) builds a fresh library source with `skipTrackId`, and
  `nextChunk()` filters that id out (`PlaybackController.kt:268`). Fix: in Albums mode, queue the rest of the tapped
  song's album after it (the album's tracks are one `GET /albums/:id` away) and do not set `skipTrackId`.
- [ ] **S2. `GET /browse/shuffled` answers 500 for a huge `asOf`.** Above about 8.64e12 seconds, `toSqliteUtc()`'s
  `toISOString()` throws (`backend/src/routes/shuffledTracks.ts:40-43`, `:15-17`). `asOf=` (empty) reads as 0, so
  every play is ignored. The app sends neither. Fix: reject an empty value and anything past the `Date` range with a
  400, and add both to the "rejects an unknown mode or a malformed asOf" test.

## Minor

- [ ] **S3. The queue sheet says "· rediscover" on a fixed queue** (album, playlist, search), where Rediscover plays as
  plain shuffle (`android/.../ui/playback/QueueSheet.kt:170-175`). Say "· shuffled" there, or say why.
- [ ] **S4. Cycling modes during a library shuffle refetches on every press.** Off → Albums passes Shuffle and
  Rediscover, and each press drops what was coming and fetches a new batch (`cycleShuffle()` →
  `continueWithLibraryShuffle()`). Safe, just wasted requests. A short debounce before re-sourcing would do.
- [ ] **S5. A tap with shuffle on still fetches 200 title-order songs, then discards them**
  (`android/.../ui/library/LibraryViewModel.kt:130-142`). Fetch one row, or skip the fetch when shuffle is on.

## Not from this session

- **S6.** Shuffle turned on from the notification, Bluetooth or the lock screen sets `player.shuffleModeEnabled`
  directly, bypassing `wantMode`: it uses ExoPlayer's plain random order, not the chosen mode. True before A77 too.

## Checked and fine

Rediscover's order holds between pages (`asOf`); old app ↔ new server and new app ↔ old server both fall back to plain
shuffle; the old `shuffle` boolean setting migrates to Shuffle; an in-flight top-up is dropped on a mode switch, and
the new source still gets its first fetch.
