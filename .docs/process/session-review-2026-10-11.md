# Review of the 2026-10-11 session's code

The work reviewed is the six commits that closed A51, A52, A54, A55 and A56 (A71 to A73):
65c0d12, 67cf7a1, 091a3ff, fe0608f, 9a8d781 and 3248c01. Four read-only review passes ran, one each for the backend, the
web pages, the web player and Android. "Checked" means the line was read again by hand after the review.
Line numbers are from `main` at b4910e5. Tick each box when it is fixed, and name the commit that fixed it.

Results at review time:
- The backend tests passed, 412 of 412.
- `npm run build` passed. `npm run lint` gave only warnings, all in files this session didn't touch.
- Android was not built or run.

## Fix first: data loss, or audio where it shouldn't be

- [x] **R1. A path typo can wipe user data.** Fixed in ca945ba. Adding the same folder with a trailing slash slips past the
      duplicate check. Removing it then deletes every track and all user data tied to them. Checked.
      - `findLibraryRootByPath` compares raw strings (`backend/src/routes/library.ts:92`), so `/music/` is accepted
        next to `/music`.
      - The scanner joins paths, which normalises them. `upsertTrack` then moves every track to the new root
        (`backend/src/db/library.ts:111-121`).
      - Removing the "duplicate" deletes all the tracks (A51), together with everyone's favorites, playlist entries,
        play history and less-often marks.
      - Fix: `resolve()` the path, and refuse a folder that overlaps an existing one. That also covers the
        nested-root case already noted in QUESTIONS.md.
- [x] **R2. A folder can be removed during its own scan.** Fixed in ca945ba. Scanning refuses with a 409 while a scan is running; removing
      doesn't (`backend/src/routes/library.ts:141-151`). The scan's later writes point at a root id that no longer
      exists, so the scan fails partway through.
- [x] **R3. Android: unplugging headphones mid-crossfade can leave the old song on the speaker.** Fixed in 6ded2eb. It plays for up to
      12 s (`PlaybackController.kt:623-634`).
      - The tail player is stopped only from `onIsPlayingChanged`. Just after the hand-off the main player is often
        buffering, so that callback doesn't fire again.
      - The tail has no audio-focus or noisy handling of its own, and it is never ducked.
      - Fix: also react in `onPlayWhenReadyChanged` and `onPlaybackSuppressionReasonChanged`.
- [x] **R4. Web: an aborted handoff can reload the old queue.** Fixed in 6ded2eb. Starting a new album right at a gapless join can
      restart the old queue (`frontend/src/components/PlayerBar.tsx:1138-1141`). Checked.
      - The old `incoming.play()` rejects with `AbortError`. The catch then runs `load(oldTracks, nextAt)`, which
        replaces the user's load.
      - The UI shows the new queue while the old one plays.
      - A pause with "Fade on pause" off can hit the same path.
      - Fix: ignore `AbortError`.
- [x] **R5. A theme can carry over to the next person.** Fixed in ca945ba. `logout()` leaves `brainlessmusic.theme` in localStorage, so
      the next account to sign in on that browser gets it (`frontend/src/auth/AuthContext.tsx:30-35`). Checked.
      - The theme is saved to that account's profile for good, or to the guest's.
      - The login screen also keeps the previous user's theme.

## "Keep albums gapless" (A72) mostly doesn't apply

- [x] **R6. Web album page.** Fixed in 6ded2eb. It builds its queue without `albumId` or `trackNumber`
      (`frontend/src/pages/AlbumDetailPage.tsx:25-32`). With crossfade on, every join on an album crossfades.
      Checked.
- [x] **R7. Playlists and favorites, on both clients.** Fixed in 6ded2eb.
      - The backend queries don't select the two fields (`backend/src/db/playlists.ts:61`, `favorites.ts:44`).
      - `FavoriteTrack` claims to be a full `TrackSummary`, which it isn't.
      - Android playlists build `QueueItem` without the fields (`ui/profile/PlaylistDetailScreen.kt:127`).
- [x] **R8. Disc boundaries.** Fixed in 6ded2eb. Albums that restart track numbers on disc 2 crossfade at the disc change, because
      `isNextOnAlbum` only checks `trackNumber + 1`.

## Web player: actions that overlap a fade or a join

- [x] **R9. Next and then Space within 150 ms leaves the index and the audio out of step.** Fixed in 6ded2eb.
      - `jumpTo` sets the index before its 150 ms fade, and a newer action then drops the `load()`
        (`PlayerBar.tsx:813-823`).
      - `stop()` (`:946`) doesn't bump `fadeActionRef`. So Next followed quickly by closing the player still starts
        audio.
- [x] **R10. A skip in the last ~0.4 s jumps two tracks.** Fixed in 6ded2eb. `jumpTo` doesn't clear `transitionRef`, so the gapless
      timer fires during the skip's fade (`:1175`).
- [x] **R11. Pausing in the last ~0.4 s doesn't pause.** Fixed in 6ded2eb. `checkBoundary` only checks `audio.paused` (`:1154`), so the
      next song starts anyway.
- [x] **R12. Repeat-one has no gap only on the first loop.** Fixed in 6ded2eb. The preload effect (`:1343-1351`) doesn't re-run when the
      ids stay the same.

## Android player: actions that overlap a fade

- [x] **R13. Seeks from the session don't reset fades.** Fixed in 6ded2eb. This covers lock screen, notification and Bluetooth.
      `seekTo`, `seekBack` and `seekForward` aren't intercepted by the `ForwardingPlayer` (`PlaybackController.kt:72-80`).
      - During "fade out, then in", the rest of the song plays silent.
      - During a crossfade, the tail plays from the wrong place.
- [x] **R14. A double-press of Next skips only one track.** Fixed in 6ded2eb. The second `skipWithFade` cancels the first one's jump
      (`:474-486`).
- [x] **R15. A PLAY while already playing dips the volume.** Fixed in 6ded2eb. Car and Bluetooth devices send these on connect.
      `playWithFade` doesn't check whether the player is already playing (`:449-458`).
      - It can also cancel a skip or a fade-out that is in progress.
- [x] **R16. A call in the last seconds of a song leaves the rest silent.** Fixed in 6ded2eb. Ramps run on wall-clock time, and outside
      pauses don't clear `boundary` (`:544`, `VolumeRamps.kt:35-41`).

## Smaller

- [x] **R17. Bulk Hide leaves the hidden rows selected.** Fixed in 6ded2eb. A second click then sends `ids: []` and gets a 400
      (`frontend/src/components/LibraryFull.tsx:402-416`).
- [x] **R18. Ids the server skips as "already gone" stay selected after a bulk delete** Fixed in 6ded2eb. (`LibraryFull.tsx:244-249`).
- [x] **R19. Removing a folder or bulk-deleting doesn't refresh Favorites or playlists.** Fixed in 6ded2eb. They keep listing the
      deleted tracks until a refetch (`frontend/src/pages/OptionsPage.tsx:187-189`).
- [x] **R20. The Options theme picker can mark the old theme** Fixed in 6ded2eb. after a profile theme loads
      (`OptionsPage.tsx:361`).
- [x] **R21. The remove-folder dialog says "its 1 tracks" and "its 0 tracks"** Fixed in 6ded2eb. (`OptionsPage.tsx:224`).

## Plausible, not confirmed

- **Web:**
  - [ ] iOS may block the spare element's first `play()` while the screen is locked. That would skip through the whole
        queue. Needs a device.
  - [ ] A data-saver swap that straddles a song join acts on the wrong element (`PlayerBar.tsx:684`).
  - [ ] Switching from fade out-then-in to gapless mid-fade is ignored.
  - [x] Ramps and the boundary timer aren't cleared on unmount. Fixed in 6ded2eb.
  - [ ] A stale preload costs bandwidth after a skip.
- **Android:**
  - [ ] A new crossfade can cut off a tail that is still fading. This happens with a next song under about 9 s, or
        when `durationSec` is null.
  - [ ] A crossfade that has started ignores a switch to repeat-one or gapless.
  - [x] A session `stop()` isn't intercepted. Fixed in 6ded2eb.
  - [ ] Swiping the app away pauses 150 ms after `stopSelf`.
  - [ ] The tail can start quieter if a fade-in was still running.
  - [ ] 5 ms polling on the main thread for about 3 s per crossfade costs battery.
- **Backend:**
  - [x] Removing a large folder may block the server for seconds, because it prepares 6 statements per track. Set-based Fixed in 6ded2eb.
        deletes would avoid that.
  - [ ] Empty albums and artists can be left behind, and `db/browse.ts:99,113` may list them with 0 tracks. The single
        delete behaves the same, so this is not new.
  - [x] Bulk delete unlinks files without checking that the path is inside a root. The single delete is the same, but Fixed in 6ded2eb.
        up to 5000 files go per request.
- **Web pages:**
  - [x] The stats line isn't refreshed when a background scan ends. Fixed in 6ded2eb.
  - [x] Clicking themes quickly can save an earlier pick. Fixed in 6ded2eb.
  - [x] The stats query isn't keyed by user, so a guest may briefly see an admin's cached counts. Fixed in 6ded2eb.
  - [x] `formatBytes` edge cases: "100.0 KB", and "1024 KB" where "1.0 MB" is meant. Fixed in 6ded2eb.
  - [x] `formatTotalLength(29)` gives "0 min". Fixed in 6ded2eb.
- [x] **Nit:** the "Tracks whose file is gone" comment now sits above the stats route
      (`backend/src/routes/library.ts:172`). Fixed in 6ded2eb.

## Checked and fine

- **Backend:**
  - Bulk routes and stats are behind `authenticate` and `requireAdmin`, or show admin-only counts.
  - Bulk ids are validated, capped at 5000 and de-duplicated. Bulk hide runs in one transaction.
  - On delete, a file that is already gone (`ENOENT`) still removes the row.
  - `deleteTrackRow` covers every foreign key.
  - Stats can't double-count. The theme is validated, and migration 0020 is correct.
- **Web pages:** the theme list in `index.html` matches `THEMES`, and the theme sync doesn't loop.
- **Web player:**
  - Listeners on the element that isn't playing are ignored.
  - The handoff and `ended` can't both advance the queue.
  - Moving the volume slider during a fade works.
- **Android:**
  - The tail player is released on the normal paths.
  - It streams through the same authenticated OkHttp client.
  - Everything runs on the main thread, and settings changes apply live.
