# Review of the whole codebase, 2026-10-11

A full read-only review of `backend/`, `frontend/` and `android/`, plus a second pass over the last five commits
(offline downloads and offline plays, 9ddd870 to 2e5329d). Line numbers are from `main` at 2e5329d.
"Checked" means the line was read again by hand after the review. Everything else comes from a read-only agent pass
and was not reproduced. Tick each box when it is fixed, and name the commit that fixed it.

Results at review time:
- Nothing was edited, built, tested or run in the app.

## Fix first: security, data, or broken sessions

- [x] **C1. The login rate limit can be reset at will.** Fixed in 52cda5d. Checked.
      - A correct login calls `clear(ip)`, which wipes that IP's failed tries (`backend/src/routes/auth.ts:307`, `:347`).
      - Anyone with their own account can guess a victim's passcode about 7 times, sign in as themselves, and repeat.
        A 4-digit passcode falls in hours.
      - The limit is per IP only, with no per-username cap. IPv6 addresses behind Cloudflare give an attacker many keys.
- [x] **C2. Hidden tracks leak to non-admins** Fixed in 52cda5d., against A34 (`.docs/QUESTIONS.md:373`). Search checked; the rest is from the agent.
      - FTS search and LIKE search filter only `missing_since`, not `hidden` (`backend/src/db/browse.ts:438-447`, `:472-479`).
      - Also reported unfiltered: album detail (`browse.ts:298-303`), track detail (`routes/tracks.ts:239`),
        stream (`routes/tracks.ts:362`), top tracks (`db/plays.ts:167`).
      - Only `GET /tracks` clamps `hidden` for non-admins (`routes/tracks.ts:162`).
- [x] **C3. Any guest can start unlimited parallel ffmpeg waveform decodes.** Fixed in 52cda5d.
      - `services/waveform.ts:92-118`, route `routes/tracks.ts:599`. There is no cap, unlike transcodes, and failed
        decodes aren't cached.
      - A parallel loop over `/tracks/{id}/waveform` runs smol out of CPU and RAM.
      - Cover thumbnails (`services/artwork.ts:79`) are also uncapped, but cached.
- [x] **C4. The playback-failure table grows without limit.** Fixed in 52cda5d.
      - Any guest can POST a `detail` of about 1 MB, with no length cap, rate limit or pruning
        (`routes/tracks.ts:538-581`, `db/playbackFailures.ts:211`).
      - That can fill the disk, and every daily backup (14 kept).
- [x] **C5. Android: queued offline plays go to the wrong account after a 401.** Fixed in 3ee0161. Confirmed in a second pass.
      - Both 401 paths clear credentials but not `PendingPlays` (`AuthRepository.kt:245-249`, `:278-282`). Only
        `logout()` does (`:293`).
      - The next account to sign in sends the old account's plays as its own.
- [x] **C6. Android: an endless error-skip loop with repeat-all.** Fixed in 3ee0161. Checked.
      - `onPlayerError` skips whenever `hasNextMediaItem()` is true, which repeat-all makes always true
        (`PlaybackController.kt:963-973`).
      - With signal but smol down (502/530) or a revoked token, it loops seek, prepare, fail with no end. That drains
        battery and data, and no error is shown. A one-song queue loops on itself.
- [x] **C7. Expired sessions break silently on both clients.** Fixed in bbb6de3.
      - Web: `setToken(null)` clears storage but never tells `AuthContext`, so `user` stays set
        (`frontend/src/lib/apiClient.ts:58-60`). Every page errors and it never goes to login.
      - Android: no 401 handling while the app runs, only in `restoreSession` and `recheckWhenOnline`. After the
        recheck's 401, `streamUrl()` is null, so even downloaded songs silently won't play (`LibraryRepository.kt:96`,
        `PlaybackController.kt:274`).
      - Android, after process death: the restored back stack skips SPLASH, so screens load before the session is
        restored and everything 401s (`BrainlessNavGraph.kt:34-46`, `LibraryViewModel.kt:98-101`,
        `StartViewModel.kt:24-35`).
- [ ] **C8. Changing a password doesn't end existing sessions.**
      - JWTs have no version or issued-at check (`routes/users.ts:245-250`, `services/token.ts:209`).
      - Existing sessions keep working for up to `JWT_EXPIRES_IN` (7 days).
- [ ] **C9. A library scan undoes admin tag edits.**
      - `PATCH /tracks/:id` edits the database only, and `upsertTrack`'s `ON CONFLICT(path) DO UPDATE` writes the file's
        tags back (`db/library.ts:108-121` vs `:139`).
      - The 12-hourly scan (`services/librarySync.ts:148`) quietly reverts the edit.
- [ ] **C10. Offline plays can be counted twice.** Confirmed in a second pass.
      - `parsePlayedAt` clamps a future `playedAt` to server now (`backend/src/routes/tracks.ts:693`). A phone clock
        that runs ahead gives each resend a different `played_at`, so the exact-match dedup misses (`db/plays.ts:62-64`).
      - A failed online scrobble is queued with the phone's `Instant.now()` (`PlaybackController.kt:1064`). The server
        stored `datetime('now')`, so a resend after a commit that timed out never matches.
      - Fix at the root: a client-generated id per play (for example the pending row id) as the idempotency key.

## Web player state

- [ ] **C11. The skip after a failed load uses the old queue.**
      - The auto-skip calls the closure `goTo`, which still sees the queue from before (`PlayerBar.tsx:665-676`,
        `goTo` at `:824-828`).
      - When a new album's first track fails, a song from the previous queue plays, or playback stops silently.
      - A failed track during session restore (`:1091`) fails silently, and `repeat` at `:666` is stale the same way.
- [ ] **C12. `reconnect` ignores `loadTokenRef`** (`PlayerBar.tsx:548-585`).
      - Pressing Next during the reconnect's 15 s wait seeks the new song to the old song's position.
      - `swappingRef` stays true, which pauses position updates and play counting.
- [ ] **C13. A data-saver swap overwrites a skip** (`PlayerBar.tsx:698-742`).
      - A skip during the ~6 s probe leaves the old song's low-quality URL playing under the new song's title.
      - After a gapless or crossfade boundary, it rewrites the spare element instead.
- [ ] **C14. A shuffle response overwrites a newer queue** (`PlayerBar.tsx:956-984`).
      - If another album starts before `POST /shuffle` returns, the queue is replaced with the old one, shuffled.
- [x] **C15. The React Query cache is never cleared on logout or login** Fixed in bbb6de3. (`main.tsx:11`, `AuthContext.tsx:125-129`).
      - The next user briefly sees the last user's data.
      - `['favorites','ids']` has no user in its key (`FavoriteButton.tsx:11-16`), so the last user's favorites show
        for up to 30 s.
- [ ] **C16. Unsaved tag edits are wiped on refetch.**
      - The effect resets every form field when `data` changes (`TrackDetailDrawer.tsx:46-54`).
      - Counting a play invalidates `['track', id]` (`PlayerBar.tsx:522`), which triggers it.

## Android offline and downloads

- [ ] **C17. The pending-play retry stops after one try.** Confirmed in a second pass.
      - `scheduleRetry()` sees its own coroutine as `isActive` and returns (`PendingPlays.kt:108`).
- [ ] **C18. The startup flush runs before the token is set**, and the online restore never flushes again.
      Confirmed in a second pass.
      - `PendingPlays.kt:51`, `AuthRepository.kt:229-241`.
- [ ] **C19. Downloads stay paused after signing in again.** Confirmed in a second pass.
      - Only `download()` resumes them, and the sign-in banner stays up (`DownloadRepository.kt:91-94`, `:124-127`).
- [ ] **C20. The storage limit ignores queued downloads.** Confirmed in a second pass.
      - `roomFor` checks `cache.cacheSpace` only (`DownloadRepository.kt:214`), so two big groups started back to back
        both pass.
- [ ] **C21. Cancellation is reported as an error.** Checked.
      - `callApi`'s `runCatching` catches `CancellationException` (`LibraryRepository.kt:105-108`).
      - In search, a cancelled in-flight query sets `LoadState.Error`, so results flicker as you type, against A83
        (`SearchViewModel.kt:42`, `:66-72`).

## Lower priority

- [ ] **C22. Migrations aren't atomic** (`backend/src/db/migrator.ts:35-36`).
      - There's no transaction around exec plus record. A multi-statement migration that fails partway leaves the
        database stuck.
- [ ] **C23. Concurrent uploads with the same name can overwrite each other** (`services/trackFiling.ts:164-174`).
      - The check, then `rename`, is not atomic.
- [ ] **C24. A hung ffmpeg holds a transcode slot forever** (`services/streaming.ts:232-250`).
      - There is no timeout. With 2 slots, two hangs mean 503 for every low-quality stream.
- [ ] **C25. Two first registrations can both become admin.**
      - `isBootstrap` is read before `await hashPassword` (`routes/auth.ts:268-272`).
      - The same gap turns a duplicate username into a 500 instead of a 409.
- [ ] **C26. The stream-monitor listener map grows without bound.**
      - It's keyed by user id plus User-Agent and swept only when an admin opens the control center
        (`services/streamMonitor.ts:59`, `:70`).
- [ ] **C27. Upload staging files leak on abort or on a filing error** (`routes/tracks.ts:193`, `:221-224`). Admin-only.
- [ ] **C28. Android: `roomFor` fires one GET per missing song with no cap in the code** (`DownloadRepository.kt:211-213`).
      - OkHttp's limit of 5 per host applies, so a big playlist is slow to start rather than a flood.
- [x] **C29. Android: `sendThenClear` timeout race** Fixed in 3ee0161. (`PendingPlays.kt:83`).
      - A `flush()`-started send can keep going through its snapshot after the clear. Narrow.
- [ ] **C30. Android: `Cache` is injected eagerly into `DownloadRepository`** (`DownloadRepository.kt:59`, `:103`,
      `DownloadModule.kt:44-45`).
      - Its init reads `cacheSpace` on the main thread at cold start, which defeats the `dagger.Lazy` in
        `PlaybackController`. That risks an ANR with a large offline library.
- [ ] **C31. Android: `PlaybackService.onCreate` stalls the main thread and leaks a thread** (`PlaybackService.kt:60`, `:80`).
      - It reads DataStore with `runBlocking`.
      - It leaks one executor thread per service recreation.
- [ ] **C32. Android: the queue sheet can keep a stale list after a no-op drag** (`QueueSheet.kt:110-112`, `:240-244`).
- [ ] **C33. Android: `deleteGroup` duplicates `dropUnlinked()`** (`DownloadDatabase.kt:150-166`).
      - `removeFromGroup`'s Boolean result is unused (`:131`, caller `DownloadRepository.kt:179`).
- [x] **C34. Web: the background media-token fetch is stored under whichever session exists when it returns** Fixed in bbb6de3.
      (`apiClient.ts:127-129`). Narrow.
- [ ] **C35. Web: `revokeObjectURL` runs right after `a.click()`** (`guestCodeCard.ts:63-68`).
      - Some older browsers then save nothing.

## Checked and found sound

- **Backend:**
  - Ownership checks on playlists, history, favorites and less-often marks.
  - The admin re-check on every request, and the separation of media-token and session-token scope.
  - The artwork id regex; `deleteTrackAndFile` stays inside the library root.
  - Range parsing and 416 handling.
  - All SQL is parameterised; FTS terms are quoted.
  - The guest-request secret is compared in constant time.
- **Web:**
  - No `dangerouslySetInnerHTML` or `innerHTML` anywhere.
  - React Query keys are per id.
  - Audio listener and Media Session cleanup.
  - The play-count double-count guard.
- **Android:**
  - Room `MIGRATION_1_2`.
  - AES-GCM token storage with backup excluded.
  - The session and player lifecycle, and the crossfade tail release.
  - Queue index bookkeeping, and the refill `generation` counter.
  - FGS types and permissions.
