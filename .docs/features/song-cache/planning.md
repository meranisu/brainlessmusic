# Song cache (Android)

## Goal

A song that has streamed stays on the phone, so it plays again without the network and without re-downloading it,
until the cache fills or is cleared (owner idea, 2026-10-14; sizes A198, offline use A199).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Storage, read order, offline rules, settings, Downloads list | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Cache, evictor, data source chain, table, quality choice, offline skip | Done | [Phase 2](#phase-2-structure) |
| 3. Interior | Settings block, "Cached" filter on Downloads | Done | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Build, phone check online and offline | In progress | [Phase 4](#phase-4-walkthrough) |

## Phase 1: Plan

- [x] **Storage:** a second Media3 `SimpleCache` in `cacheDir/songs`, separate from downloads (`filesDir/downloads`,
  never evicted). `cacheDir` because it is a cache: Android's "Clear cache" and low-storage cleanup may empty it (A198).
- [x] **Eviction:** least recently used, with a limit that changes without rebuilding the cache (Media3's LRU evictor
  fixes its size at construction). Sizes 500 MB, 1 GB (default), 2 GB, 5 GB, Unlimited (A198).
- [x] **Read order:** downloads (read-only) → song cache (read and write) → network. A downloaded song never reaches
  the song cache, so nothing is stored twice. Downloading a cached song reads it from the song cache first.
- [x] **Keys:** the existing `track:<id>:orig|low`, so the data-saver copy is cached apart from the original.
- [x] **Quality:** a downloaded or fully cached original plays as the original even with data saver on (no data
  needed); offline, a fully cached data-saver copy plays when the original isn't there.
- [x] **Offline:** a fully cached song counts as on the phone wherever offline skipping checks downloads (A199). A
  half-played song is only partly cached and is skipped offline.
- [x] **Names offline:** a `cached_track` table (downloads database v6) records a song's details when it plays; the
  "Cached" list shows rows whose song is still fully cached.
- [x] **Downloads screen:** a "Cached" filter chip listing them, playable offline; shown when there are any.

## Phase 2: Structure

- [x] `SongCache` (cache, adjustable LRU evictor, space used, fully-cached check, clear)
- [x] Setting `songCacheLimitMb` (0 = unlimited, default 1024)
- [x] Player data source chain; downloader reads the song cache first
- [x] `cached_track` table, migration 5 → 6, recorded on play
- [x] `streamUrlFor` quality rule
- [x] Offline skip counts cached songs

## Phase 3: Interior

- [x] Downloads settings: size chips, space used, "Clear cache" with a confirm
- [x] Downloads: "Cached" filter, rows, play; not the empty state when only cached songs exist

## Phase 4: Walkthrough

- [x] `assembleDebug`
- [ ] Phone: play a song, go offline, it plays from Cached and from the queue
- [ ] Phone: lower the limit, space used drops; Clear cache empties the list

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-10-14 | Interior | Cached rows offer Download and Remove from cache; the downloaded songs are left out of Cached | One song shouldn't show in two places | Yes |
