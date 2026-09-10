# Phase Plan — Formats, and transcoding worth using

Roadmap box **24** (v0.2, Backend). Companion to box **25** (resume position), which is separate work.

## Goal

Play every format the two of us actually use — `ogg`, `opus`, `mp3`, `m4a`, `aac`, `wav`, `flac` — and turn `?quality=low` from a lossy round-trip that cannot seek into a data-saver path that is genuinely worth choosing on mobile data.

## Why this is worth architecture now, when it wasn't last week

Measured against the real library on 2026-09-10, **before** this box was scheduled:

| | |
|---|---|
| Library | 19 tracks, **all Opus**, 115–126 kbps (mean 121) |
| Total size | **67 MB over 77 minutes** |
| `?quality=low` on track 110 | 2,481,022 → 1,597,894 bytes — a **36% saving** |

That is a poor trade: a second lossy generation, Opus re-encoded to Opus, to save about a third. And at 67 MB the whole library fits on a phone, so downloading once beats transcoding every stream. On those numbers the honest recommendation was *don't build this*.

**FLAC and WAV change every one of those numbers.** A FLAC album is roughly 5–10× the Opus size and WAV is ~10 MB per minute uncompressed, so the library stops fitting on a phone, transcoding stops being a lossy round-trip and becomes a real first-generation encode, and the saving goes from 36% to well over 90%. The architecture below is justified by the *new* library, not the current one.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan (blueprint) | Format list, transcode policy, cache design, open questions | In progress | [Phase 1](#phase-1-plan) |
| 2. Structure (foundation) | Backend: ingest the new formats, disk cache, stream route | Not started | [Phase 2](#phase-2-structure) |
| 3. Interior (finishing) | Client: quality toggle, seeking on the transcoded path | Not started | [Phase 3](#phase-3-interior) |
| 4. Walkthrough (handover) | Real-file tests per format, cache behaviour, done-checklist | Not started | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

### Formats

Today `AUDIO_EXTENSIONS` (`services/trackTags.ts`) and `MIME_TYPES` (`services/streaming.ts`) both cover five: `.flac .opus .mp3 .m4a .ogg`. Two to add:

| Ext | MIME | Notes |
|---|---|---|
| `.wav` | `audio/wav` | Uncompressed, ~10 MB/min. `music-metadata` reads RIFF INFO and ID3-in-WAV, but most WAVs carry no tags at all — the filename fallback will do the work. |
| `.aac` | `audio/aac` | Raw ADTS. No container, so usually **no tags and no embedded cover**. Browsers can play it but seeking raw ADTS is unreliable — it has no index, so byte-offset seeks land mid-frame. A strong argument for transcoding these to a real container rather than serving them raw. |

All seven decode in Chrome on desktop and Android, which is the whole target — iOS/Safari is explicitly out of scope (decided 2026-09-10).

- [ ] Decide whether `.aac` is served raw or always remuxed to `.m4a` for seekability
- [ ] Confirm `music-metadata` returns a usable `duration` for WAV and raw ADTS (the waveform buckets are sized from it — see `waveform.ts`)

### Transcode policy

- **Target stays 64 kbps Opus in Ogg.** Right codec at that bitrate, and both targets decode it.
- **Skip the transcode when it cannot pay** — `tracks.bitrate` is already populated by scan and upload. Serving the original is better than a pointless second generation. The threshold is a real decision, not a formality: a strict `bitrate <= 64k` test would still transcode today's 121 kbps Opus for a 36% saving. Proposed: skip when `bitrate < 1.5 × target`, i.e. under ~96 kbps.
- **Lossless always transcodes.** FLAC and WAV report huge bitrates and are first-generation sources, so this is where the feature earns its place.

### The cache

Mirrors the artwork cache's shape (`config.artworkPath`), for the same reason: content-addressed, disposable, rebuilt on demand.

- **Key** — a hash of *source identity plus encode settings*: file size, mtime, codec, bitrate. Size+mtime is the same pair the stream endpoint's `ETag` already trusts, so a replaced file invalidates its cache entry for free.
- **Location** — `TRANSCODE_PATH`, default `./data/transcodes`, beside the artwork cache and inside the container's `/data` volume.
- **The payoff** — once a file exists, the transcoded stream is *an ordinary file*: `Content-Length`, `Accept-Ranges: bytes`, `ETag`, real byte-range seeking, and the 304 path built on 2026-09-10 all apply. That is the whole point. The `-ss` streaming path exists for the cold case only.
- **Atomic commit** — encode to a temp name, `rename` on clean exit. A killed transcode must never leave a truncated file that looks complete. (This matters more than usual here: transcodes now get SIGKILLed on client abort by design.)
- **Dedupe in flight** — two requests for the same cold track must not both encode. `waveform.ts` already solves exactly this with an in-flight `Map` keyed by track id; reuse the pattern.
- **Eviction** — LRU by access time against `TRANSCODE_CACHE_MAX_MB`. Only ever delete files matching this module's own naming pattern, the rule `pruneBackups` already follows.

- [ ] Decide: on a cold miss, stream with `-ss` *and* encode to cache separately (two ffmpeg runs, simple, doubles CPU), or tee one encode to both (one run, but the response and the cache file have different lifetimes and an abort must not commit)
- [ ] Decide the cache size cap, and whether eviction runs on a timer or on write

### Known consequences to accept or handle

- **`MAX_UPLOAD_SIZE_MB` defaults to 100.** A six-minute WAV is ~60 MB and a FLAC album can exceed the cap per file. Upload will start rejecting real files.
- **Backups stay small** — the database holds rows, not audio — but the library volume and the transcode cache both grow a lot.
- **`?quality=low` currently answers `503` when transcode slots are busy.** With a cache, most requests stop needing a slot at all, so the cap becomes far less visible.

---

## Phase 2: Structure

- [ ] Add `.wav` / `.aac` to `AUDIO_EXTENSIONS` and `MIME_TYPES`
- [ ] Real-file fixtures per format, generated with ffmpeg like `scanner.test.ts` already does
- [ ] `transcodePath` + cache-size config, with README rows
- [ ] Cache module: key derivation, lookup, atomic write, in-flight dedupe, LRU eviction
- [ ] Stream route: cache hit → serve as a file with ranges; cold → `-ss` stream, populate cache
- [ ] Bitrate threshold: serve the original when transcoding cannot pay, and say so in a header or the logs

## Phase 3: Interior

- [ ] A data-saver toggle in the web player (there is no UI for `?quality=low` at all today)
- [ ] Seeking on the transcoded path — the client must track the `?t=` offset and add it to `audio.currentTime`, since a live encode reports its own zero
- [ ] Show the served format/bitrate in the player, so it is obvious when you are hearing the low-quality copy

## Phase 4: Walkthrough

- [ ] Each of the seven formats: scan, stream, waveform, cover art
- [ ] Cache: cold miss encodes once, warm hit serves ranges, changed file invalidates, eviction respects the cap and touches nothing else
- [ ] Aborting a cold request leaves no partial file in the cache
- [ ] Two concurrent cold requests for the same track produce one encode
- [ ] Backend tests pass; verified in real headless Chromium against a library containing a FLAC and a WAV

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-10 | Plan | Box created, overriding roadmap order | Owner decision. The measured numbers argued against building this; FLAC and WAV arriving reverses that, and the owner scheduled it knowing box 13 is still the release's critical path. | Yes — the plan is written against the incoming library, not the current one |
| 2026-09-10 | Structure | `-ss` offset support shipped early, ahead of this plan | The transcoded path could not seek *at all*, which was a broken feature independent of the cache design. Landed standalone; verified byte-identical against a locally-seeked reference. | Yes — it is the cold-start half of the cache design |
