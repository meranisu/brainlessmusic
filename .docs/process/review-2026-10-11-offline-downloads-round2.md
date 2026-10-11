# Review: offline downloads, round 2 (2026-10-11)

Range `26953ea..a942fe2`: the fixes from the first review (`2e5329d`) and the cover-grid Downloads tab (`a942fe2`).
Every finding below was checked against the code. All fixed: D1, D2 and D4 by the codebase review, the rest in the commit that ticks them.
IDs are `D1`–`D8`. Tick each with its commit when fixed.

## Bugs

- [x] **D1. The timed retry runs once.** Fixed in 87f2978 (codebase review C17). `PendingPlays.scheduleRetry()` is called from inside the running retry job,
  sees `retry?.isActive == true` (itself) and returns, so a second retry is never scheduled. With smol down for 20
  minutes on unchanged Wi-Fi, waiting plays sit until the network changes or a new scrobble succeeds.
  `android/.../playback/PendingPlays.kt:108`. Fix: clear `retry` before calling `send()` in the job, or check
  `retry !== currentJob`.
- [x] **D2. A 401 from the online recheck leaves the account's waiting plays.** Fixed in 3ee0161 (codebase review C5). `AuthRepository.recheckWhenOnline()`
  clears credentials but not `pending_play`; the next account to sign in has them flushed under its name. `logout()`
  already does `sendThenClear()`. `android/.../data/repository/AuthRepository.kt:278`. Fix: clear pending plays (they
  can no longer be sent as that account) and reset `isGuest`.
- [x] **D3. The offline-start re-check can still miss.** `DownloadRepository` sets `_downloads` before
  `loaded.complete()`, so the `PlaybackController` collector can run while `isLoaded` is false; and with nothing
  downloaded the done-set doesn't change, so `distinctUntilChanged` emits nothing. A restored queue then streams and
  errors instead of skipping or saying nothing is downloaded. `android/.../downloads/DownloadRepository.kt:117`. Fix: a
  `StateFlow<Boolean>` for loaded, set before the map, and key the collector on `(loaded, doneSet)`.
- [x] **D4. A play can still count twice.** Fixed in d966018 (codebase review C10: a client id per play). Since `2e5329d` any failure but 400/404 stores a pending play stamped
  `Instant.now()`; if the server already committed it (response timed out), the resend's `played_at` differs from the
  server's `datetime('now')` and the dedupe misses. `parsePlayedAt()` clamping a fast clock to `now` causes the same miss
  on resend. `android/.../playback/PlaybackController.kt:1064`, `backend/src/routes/tracks.ts:693`. Fix: the phone sends
  `playedAt` on every scrobble, stores that same value when it fails, and the server keeps a within-skew time as sent
  (no clamp), so a resend always matches. Does not need `plays.ts` (another agent has it open).
- [x] **D5. Networks that never validate count as offline.** Requiring `NET_CAPABILITY_VALIDATED` marks a network that
  blocks Android's check (some VPNs, Private DNS, workplaces) as offline even with smol reachable.
  `android/.../data/remote/NetworkMonitor.kt:45`. Fix: offline only when `NET_CAPABILITY_CAPTIVE_PORTAL` is set (a
  dead-uplink router then falls back to per-song errors).
- [x] **D6. The recheck can write over a different account.** The token is compared only before `/auth/me`; if the
  user logs out and in as someone else while it runs, `onSuccess` saves the old account's guest flag and name.
  `android/.../data/repository/AuthRepository.kt:271`. Fix: compare the token again in `onSuccess`.

## Cleanup

- [x] **D7. Dead code from the grid rewrite:** `DownloadsViewModel.retry()`, `remove()` and
  `DownloadRepository.queueOf()` have no callers. `android/.../ui/downloads/DownloadsViewModel.kt:170`.
- [x] **D8. One mapping written three times:** downloaded song to `QueueItem` in `DownloadsViewModel`,
  `DownloadGroupScreen` and `DownloadRepository.queueOf()`. One `DownloadedTrack.toQueueItem(coverUrl)` beside the
  entity. `android/.../ui/downloads/DownloadsViewModel.kt:177`.

## Not from this work

- The other agent's uncommitted listening-stats change (`previousRank`, A91) has no CHANGELOG/FUNCTIONLOG entry yet
  and is why `backend` doesn't type-check (`src/db/listeningStats.ts:185`). It is still in progress.
