# Smart pre-caching (Android)

**Goal:** while online, keep the playing song and the next few queued songs whole in the song cache, so they keep playing
when signal drops (bike rides). Decisions: [A218](../../QUESTIONS.md). Idea row: [feature-brainstorm](../feature-brainstorm.md).

| Phase | What | Status |
|---|---|---|
| Plan | Reuse the song cache and `TrackCacheKey`; fetch with Media3 `CacheWriter` (1.4.1) | Done 2026-10-18 |
| Structure | `Precacher`, `precacheOrder()`, `precacheCount` setting | Done 2026-10-18 |
| Interior | `PlaybackController.updatePrecache()`, "Fetch ahead" row in Settings, Downloads | Done 2026-10-18 |
| Walkthrough | On the phone: airplane mode mid-queue, data saver switch, setting Off, room | Open |

## Design in one paragraph
`Precacher.want(list)` takes the ordered (song, stream URL) list and fetches one song at a time through a `CacheDataSource`
over `songCache.cache`, the same cache and key the player reads, so a fetched song is a normal hit and the existing offline
skip (`onPhone`) finds it. A different list cancels the fetch in progress. `PlaybackController.updatePrecache()` builds the
list from `playOrder()`: playing song, then `precacheCount` more (wraps only on repeat all, current only on repeat one). It
returns an empty list offline, in a room, with the setting off or the queue empty, and waits for `STATE_READY` so the
player's own first bytes come first. It runs on item transitions, timeline changes, `rebuildQueuedItems` (data saver and
download changes), network changes and the setting.

## Walkthrough checklist
- [ ] Play an album, data saver off. After a minute the playing song and the next 3 show under Downloads, Cached.
- [ ] Airplane mode: the playing song finishes, the next 3 play, then the offline notice appears.
- [ ] Data saver on: the next songs are fetched as the low copy.
- [ ] Fetch ahead Off: nothing new is cached. Join a room: nothing is cached.
- [ ] Skip quickly through 5 songs: no stalls, no stuck fetch.

## Change log
- 2026-10-18: built; `PrecacheOrderTest` passes; not phone-tested.
