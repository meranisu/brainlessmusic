# Spec: Offline downloads

**Status:** Built, awaiting the phone checklist (2026-10-11)
**Layers:** 📱 Android, with one small 🔧 Backend change (A87)

Roadmap box 19. *Done when:* you play a downloaded album in airplane mode, including opening the app from cold in
airplane mode.

## Problem

v0.2's done-when is "music from your own server, on your phone, on a bike ride". On a ride the signal drops, so
streaming alone isn't enough. The whole library fits on a phone
([formats-and-transcoding](../features/formats-and-transcoding/planning.md)), so keeping a copy on the phone is
simpler than any clever caching.

## What exists today (checked 2026-10-11)

- No offline code at all: no Media3 cache, no Room, no WorkManager, no download service.
- The player reads straight from the network: `newExoPlayer()` builds
  `DefaultMediaSourceFactory(OkHttpDataSource.Factory(okHttpClient))` (`PlaybackController.kt:840-842`). The crossfade
  tail player uses the same function.
- Auth is a Bearer header added by `AuthInterceptor` (`data/remote/AuthInterceptor.kt:19`). Stream URLs carry no
  token (`LibraryRepository.kt:94-95`).
- Data saver (fa403a9) is a DataStore boolean that rewrites queued URIs to `?quality=low`
  (`PlaybackController.kt:189-205`).
- Backend `GET /tracks/:id/stream` (`backend/src/routes/tracks.ts:350`) serves the original file with full Range
  support and an ETag from size + mtime. `GET /tracks/:id` gives `fileSize`. `GET /albums/:id` and
  `GET /playlists/:id` give track lists (playlists need an account, not a guest).
- **Blocker:** a cold start with no network logs you out. `restoreSession()` treats any `/auth/me` failure as an
  invalid session and calls `clearCredentials()` (`AuthRepository.kt:222-234`). For a guest this loses the identity
  for good.

## Scope

**In:**
1. Opening the app with no network keeps you signed in and lands on your downloads.
2. Download an album, a playlist, or a single song at original quality (A86), on any network (A85).
3. A download queue with progress, pause/resume, cancel, and retry. It survives the app being closed.
4. A Downloads screen that works with no network: list, play, delete, space used, and an optional storage limit (A88).
5. Playback prefers the downloaded copy, online or not. With no signal, songs that aren't downloaded are skipped
   instead of stopping the queue.
6. Plays made offline are counted once you're back online (A87).

**Out (stays in [feature-brainstorm](../features/feature-brainstorm.md)):**
- Smart pre-caching and automatic downloads ("download my favourites").
- A general streaming cache for songs that aren't downloaded.
- Re-downloading automatically when a file changes on the server. A changed file just keeps its old copy until you
  delete it and download again.
- Downloads on the web app.

## Design

### 1. Offline-safe start (do first, ships on its own)

- `restoreSession()` splits failures with the existing `ConnectionError` mapping (`ConnectionError.kt:24`):
  - **401/403:** the session really is invalid. Clear credentials and go to login, as today.
  - **Unreachable / timeout:** keep the token, mark the app offline, and open on Downloads (or Artists if nothing is
    downloaded, which then shows an offline state).
- When the network comes back, re-run `/auth/me` quietly. Only a 401 sends you to login.

### 2. Download engine: Media3 `DownloadManager`

Use Media3's own downloader rather than building one on WorkManager. It already handles resuming partial downloads,
retries, network rules, and a foreground notification, and the player can read its files directly.

- **Storage:** one `SimpleCache` in app-private storage (`filesDir/downloads`) with `NoOpCacheEvictor`, so nothing is
  ever evicted behind your back. Deleted on uninstall.
- **Requests:** `DownloadRequest(id = "track:<id>", uri = <stream URL with no quality param>)`. The network side goes
  through the same `OkHttpDataSource.Factory(okHttpClient)`, so the Bearer header and user-agent match playback.
- **Cache key:** `track:<id>:orig`. The quality is part of the key because the low copy is different bytes from the
  original.
- **Service:** a `DownloadService` subclass with a progress notification. With targetSdk 34 that needs
  `FOREGROUND_SERVICE_DATA_SYNC` in the manifest (only `..._MEDIA_PLAYBACK` is there now).
- **Network rule:** `Requirements.NETWORK`, so any connection, Wi-Fi or mobile data (A85). No setting for it.
- **Storage limit (A88):** off by default. When set, a download that would go over it isn't started; it shows
  "Storage limit reached" with a link to settings. Checked against `fileSize` from `GET /tracks/:id` before queueing.
  Nothing already downloaded is deleted to make room.
- **401 while downloading:** stop the queue and show "Sign in again to keep downloading". A session token lasts 7 days
  (`JWT_EXPIRES_IN`), so this can happen on a long trip. Songs already downloaded keep playing.
- **New dependencies:** `media3-database` (for `StandaloneDatabaseProvider`) and Room, at the versions in
  `libs.versions.toml`. Check whether `media3-datasource` is already pulled in by the exoplayer module.

### 3. What the app remembers: Room

Media3 knows which bytes are on disk. It doesn't know album names or which playlist a song came from. A small Room
database holds that, so the Downloads screen never needs the server:

| Table | Holds |
|---|---|
| `downloaded_track` | track id, title, artist, album, duration, file size, server ETag at download time |
| `download_group` | an album or playlist you tapped download on: id, kind, name, cover file path |
| `download_group_track` | which tracks belong to which group, in order |

- A track in two groups is downloaded once. Deleting a group removes only the tracks no other group still uses.
- Cover art is saved as a file next to the group (Coil's disk cache can be cleared, so it can't be relied on).
- A playlist download is a snapshot. Songs added to the playlist later aren't fetched automatically. The Downloads
  screen offers "Update" when online.

### 4. Playback

- Wrap the player's source factory in `CacheDataSource.Factory` over the download cache, read-only, with the same
  cache key factory. A downloaded song plays from disk, whether or not there's signal.
- Data saver skips downloaded songs: `applyDataSaver` leaves their URIs at original quality, since the local copy is
  free.
- **With no network,** the queue skips songs that aren't downloaded (one quiet "Skipped 3 songs that aren't
  downloaded" message, not one per song). Shuffle includes only downloaded songs.

### 5. UI

- **Download button** on album and playlist pages, and **Download** in the song menu. States: not downloaded,
  queued, % progress, downloaded, failed (tap to retry).
- **Downloads screen** in the nav: groups first, then "All downloaded songs", with total space used at the top.
  Per group: play, shuffle, delete. While downloads are running, a queue section shows them, with pause all.
- **Offline banner** on library screens with no network: "You're offline", with a button to Downloads.
- **Settings:** space used, the storage limit (off, or a size you pick), and "Delete all downloads".

### 6. Offline plays (A87)

- With no network, scrobbles go into a Room table `pending_play(track id, ms played, played at)` instead of the API.
  They're sent in order when back online. Guests skip this, as they do today (A37).
- **Backend:** `POST /tracks/:id/scrobble` (`tracks.ts:620`) takes an optional `playedAt`, accepted only if it's in
  the past and no older than 30 days. Without it, a ride's plays would all be dated to the moment you got signal.
  `recordScrobble` (`db/plays.ts`) gets the timestamp as a parameter.

## Build order

| # | Step | Done when |
|---|---|---|
| 1 | Offline-safe start (section 1) — **built 2026-10-11 except the re-check when signal returns; not tried on a phone** | In airplane mode the app opens and you're still signed in |
| 2 | Download engine + one "Download album" button + player reads from the cache — **built 2026-10-11; not tried on a phone** | An album downloads and plays in airplane mode |
| 3 | Room metadata + Downloads screen + offline banner — **built 2026-10-11; not tried on a phone** | The Downloads screen works from a cold start in airplane mode |
| 4 | Song and playlist downloads, queue controls, delete, settings — **built 2026-10-11; not tried on a phone** | The checklist below passes |
| 5 | Offline plays (backend `playedAt` + pending queue) — **built 2026-10-11; not deployed to smol, not tried on a phone** | Plays from an airplane-mode ride show up with the right times |

Step 1 is a fix worth shipping on its own, even before anything else lands.

## Phone checklist (for step 4)

- Download an album on Wi-Fi, switch to airplane mode, kill the app, reopen it, and play the album.
- Start a download, kill the app, and confirm it resumes.
- Go from Wi-Fi to mobile data mid-download and confirm it carries on.
- Set a limit below what an album needs: the download doesn't start and says why. Already downloaded songs stay.
- Play a queue that mixes downloaded and streamed songs in airplane mode: only downloaded ones play.
- With data saver on, a downloaded song still plays at original quality (check bitrate on Now Playing).
- Delete an album that shares a song with a downloaded playlist: the playlist still plays that song.
- As a guest: an album downloads, and there's no playlist download button.

## Decisions

A85 (any network), A86 (albums, playlists, songs), A87 (offline plays counted), A88 (space used plus an
optional limit), all in [QUESTIONS.md](../QUESTIONS.md#answered).

## Related

- [development-roadmap.md](../process/development-roadmap.md) box 19
- [feature-brainstorm.md](../features/feature-brainstorm.md), "Offline / on-the-road"
- [android-phase-2-playback](../features/android-phase-2-playback/planning.md) for the player this wraps
- [formats-and-transcoding](../features/formats-and-transcoding/planning.md) for `?quality=low` and data saver
