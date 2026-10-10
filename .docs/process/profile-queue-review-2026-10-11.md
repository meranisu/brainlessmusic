# Review of the 2026-10-11 queue, listening-time and profile work

This review covers the code that shipped Android v0.3.5 to v0.3.10 and its backend side. That's six commits:
- c3184d9: the blank screen after closing the player
- cd5d91a: the swipe-away setting
- ec76854: Settings pages
- 9ff0300: the queue sheet and "play less often"
- 247e9c4: listening stats and real listening time
- 34fbad4: the You tab, likes and playlists

Four read-only review passes ran, one each for navigation and Settings, the queue and playback controller, the
backend, and the profile UI. "Checked" means the line was read again by hand after the review. Line numbers are from `main` at c7e0152. Tick each
box when it is fixed, and name the commit that fixed it.

Nothing was built, run or tested for this review. The other review file from the same day,
[session-review-2026-10-11.md](session-review-2026-10-11.md) (R numbers), covers other commits. Here the IDs are P1 to P16.

## Fix first

- [x] **P1. Marking a song "less often" mid-shuffle scrambles the rest of that shuffle.** Fixed in ca945ba. Checked.
      - `backend/src/routes/shuffledTracks.ts:24-25` filters the less-often songs out first, then runs
        `seededShuffle` on what's left. Fisher-Yates over a shorter array gives a completely different order for the
        same seed.
      - Android pages through one shuffle by seed and offset (`QueueSource.Shuffled`, `PlaybackController.kt:247-251`).
        After a swipe-right in the queue (the whole point of A60), the next refill comes from a different order. Songs
        repeat, and others are never reached that pass. Unmarking a song mid-shuffle does the same.
      - Fix: shuffle the full `listPlayableTrackIds()` first, then filter. A mark then moves later positions by one
        at most. Add a test where the same seed and offset gives a stable order after a mark.
- [x] **P2. The queue's Undo snackbar never goes away.** Fixed in ca945ba. Checked. `QueueSheet.kt:138-142` calls `showSnackbar` with an
      `actionLabel`, `withDismissAction = false` and no `duration`. M3 defaults that to `Indefinite`, so the snackbar
      covers the bottom rows until Undo is tapped, another row is swiped, or the sheet closes.
      Fix: `duration = SnackbarDuration.Long` (or `withDismissAction = true`).
- [x] **P3. A late Undo puts the song behind the one playing, so it never plays.** Fixed in ca945ba. Checked. `restore`
      (`PlaybackController.kt:368-391`) puts it back at the old `RemovedEntry.playPosition`. Remove the next song, let
      two songs play, then tap Undo. The song lands before the current one, in both the shuffle order and the list
      order, and with repeat off it never plays. P2 makes this much more likely. Fix: clamp to at least the current
      play position + 1.
- [x] **P4. Stats responses for the You tab can land under the wrong range.** Fixed in 6ded2eb. Checked. `YouViewModel.kt:56-73`: neither
      `load()` nor `refresh()` cancels the previous request. Pull to refresh on Month, then tap Week. If the Month
      refresh returns last, Month's numbers show under the Week chip. Fix: keep one `Job` and cancel it, or drop a
      response whose range isn't the current one.
- [x] **P5. A refill from an old queue overwrites the new queue's source.** Fixed in 6ded2eb. Checked. This is older code (677c732), not
      these commits. `nextChunk` (`PlaybackController.kt:240-251`) writes `source` after its network call, so the
      write lands even when the `generation` check at `:220` later throws the items away. Play All Songs, then play an
      album before the refill returns. The All Songs cursor comes back, and when the album runs low it gets topped up
      with library songs. `stop()` brings a cleared source back the same way. `refilling = true` also blocks the new
      queue's first top-up while the stale request is out. Fix: return the next source along with the items, and
      only assign it when `startedFor == generation`.

## Smaller

- [x] **P6. `/me/favorites` sends fewer fields than Android expects.** Fixed in 6ded2eb. `backend/src/db/favorites.ts:44-51` returns
      `id, title, artist, album, duration, format, favoritedAt`. Android reads each entry as `TrackSummaryDto`
      (`ProfileDtos.kt:26`, `LibraryDtos.kt:54-70`), which also has `albumId`, `missing`, `hidden`, `playCount`, and
      `dateAdded: String` (non-null). Gson fills the gaps with zero or null values. Liked songs therefore have no `albumId`
      (no gapless), and `dateAdded` is null despite its non-null type. That's an NPE waiting for the first reader;
      nothing reads it today. Fix: return full `TrackSummary` rows (`getTrackSummariesByIds`), or give Android a DTO
      of its own.
- [x] **P7. `PATCH /me/history/:id` has no upper limit when the song's length is unknown.** Fixed in 6ded2eb. `routes/history.ts:25`
      checks only `>= 0` and finite. `finishPlay` (`db/listeningStats.ts:174`) caps at the song's length only when
      `tracks.duration` isn't NULL. Something like `1e300` is stored, `SUM` overflows a `Long`, and that user's
      `/me/stats?range=all` fails to parse on Android from then on. Fix: reject anything over 24 h in ms.
- [x] **P8. You-tab counts go stale.** Fixed in 6ded2eb. `YouViewModel.kt:66`'s KDoc says `refresh()` runs "coming back to the tab". Only
      pull to refresh calls it (`YouScreen.kt:93`). Unlike three songs in Liked songs and go back, and the count is
      unchanged. Creating or deleting a playlist does the same. Fix: refresh when the screen resumes.
- [x] **P9. Playlist undo and drag race the remove** Fixed in 6ded2eb. (`PlaylistDetailScreen.kt:155-177`).
      - Undo runs add, then reorder. If the DELETE hasn't reached the server yet, the add gets a 409 (treated as
        success). The DELETE then lands, so the song is gone on the server but shown as restored.
      - Undo sends `orderBefore`, captured when the song was removed. Remove, drag, Undo, and the drag is silently
        reverted.
      - Drag right after a swipe-remove: the server rejects the reorder (400, the track set doesn't match). The client
        calls `load()`, which can bring the removed song back if it returns before the DELETE.
      - Fix: run a playlist's edits one at a time (a queue or a mutex in the ViewModel), and build the undo order from
        the current list.
- [x] **P10. The like toggle races** Fixed in 6ded2eb. (`SongActions.kt:67-70`, `ProfileRepository.kt:62-67`).
      - A double tap sends like and unlike unordered, so the server and the heart can disagree.
      - A `loadLikedIds()` that returns after an early tap overwrites that tap's optimistic change.
      - If `loadLikedIds()` failed, every heart on Liked songs is empty, and tapping one sends "like".
      - Fix: run the toggles one at a time per track, and retry or surface a failed load.
- [x] **P11. Playlist create, rename and delete fail silently.** Fixed in 6ded2eb. See `PlaylistsScreen.kt:65` and
      `PlaylistDetailScreen.kt:137-147`. Separately, `create` navigates from a coroutine after the response, so if the
      user has moved on to Now Playing, the new playlist is pushed on top of it. Fix: show a Toast on failure, and only
      navigate if this screen is still resumed.

## Minor

- [x] **P12. The final listening time is probably lost on logout.** Fixed in 6ded2eb. `SettingsViewModel.kt:131-132` calls `stop()`, which
      starts `finishPlay`, then immediately `logout()` clears the token. The interceptor probably runs after that, so
      the PATCH goes out without auth. Not confirmed by running it.
- [x] **P13. Shuffle All does nothing when every song is "less often" this pass** Fixed in 6ded2eb. (`total: 0`).
      `LibraryViewModel.shuffleAll` (`:150`) returns silently. Show a message, or fall back to the unfiltered pool.
- [x] **P14. Another app's controls can push `keys` out of step with the queue.** Fixed in 6ded2eb. This is older than these commits. The
      `MediaSession` (`PlaybackService.kt:49`) leaves `COMMAND_CHANGE_MEDIA_ITEMS` to controllers. `ForwardingPlayer`
      (`PlaybackController.kt:71-81`) sends `removeMediaItem`, `moveMediaItem` and `replaceMediaItem` straight to
      ExoPlayer, which skips `queue` and `keys`. Android Auto, Wear and other media apps can do this. Fix: drop
      the command in `onConnect`, or override those methods.
- [x] **P15. The swipe-away setting can be missed right after the service starts.** Fixed in 6ded2eb. `PlaybackService.kt` starts the
      field at `true`, and the DataStore value arrives asynchronously. A swipe-away within milliseconds of the start,
      with the setting off, keeps playing. Fix: read it once synchronously in `onCreate`.
- [x] **P16. A double tap on "Log out" can stack two Login screens.** Fixed in 6ded2eb. This is older than these commits.
      `SettingsViewModel.kt:129-135` has no in-flight guard. Fix: ignore a repeat call, or add `launchSingleTop`.

Also noted, not worth a box:
- Back is ignored while a screen is still animating in. That's `popFrom`'s RESUMED check
  (`SafeNavigation.kt:13`), and it's the trade-off that fixes the blank screen.
- When a slow scrobble is followed by pause and then the song's end, two `finishPlay` PATCHes can arrive out of order.

## Checked and fine

- **Navigation:** every back arrow goes through `popFrom(entry)`, so no unguarded `popBackStack`/`navigateUp` is left. An
  unknown settings page falls back to Appearance (`firstOrNull`). Tab navigation still pops to `ARTISTS`.
- **`onTaskRemoved`:** the setting is read and written on the main thread only, and there is one DataStore singleton.
- **Queue `keys`:** they stay in step through `loadQueue`, `appendItems`, `playNext`, `restore`, `move`, `removeAt` and
  `stop`. Moving with shuffle on uses `shuffledSequence()` positions on both sides. Drag is off while searching, and
  swipes look up rows by key. `requireOffset()` is inside `runCatching`. The playing song can't be removed.
- **`playId`:** each final time goes to the right play. `beginTrack` sends the final value and clears `playId` before
  the next tracker exists.
- **Backend ownership:** `finishPlay` filters by `user_id`, and every new route requires an account. Bad ids get 404,
  and a negative `msPlayed` gets 400.
- **Migrations 0019 to 0022** don't collide. `less_often` is cleared on track delete, user delete and guest prune.
- **Playlists:** routes match `ApiService.kt`. A duplicate add gets 409, so a playlist can't hold the same song twice
  and LazyColumn keys stay unique.
- **Guests:** blocked in the UI (`canEdit`, `GuestNote`) and on the server (`requireAccount`).
- **Like rollback:** the optimistic like rolls back on failure. Logout clears the liked set.
