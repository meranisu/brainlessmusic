# Feature Brainstorm

**This is an idea pool, not a plan.** Nothing here is scheduled. It's the holding area for everything that has come up in conversation, kept so ideas aren't lost — deliberately unranked, because ranking this list is what made the project feel shapeless in the first place.

The plan lives in `.docs/process/development-roadmap.md` (three releases, ordered checklist). What the system could do, by capability and with current status, is in `.docs/reference/capability-map.md`.

An item graduates from this pool to the roadmap only when it serves the current release's done-when. Most of this list is post-v0.3 and may never be built — that's the intended outcome, not a failure. The Priority/Complexity columns are left as rough gut-check notes; treat them as annotations, not commitments.

Legend: 🔧 Backend · 🌐 Web App · 📱 Mobile App (Android)

Rows or notes tagged **(Navidrome)** came from comparing this project with Navidrome on 2026-09-28: things Navidrome, or the
Subsonic clients built on it, does that this project doesn't yet. Navidrome features that stay out of scope (Subsonic API,
sharing links, jukebox mode, per-client transcoding profiles, plugins) are listed in the roadmap's *Deliberately not doing* section and aren't repeated here.

---

## Real-time / social

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Room sync (group listening) | Spotify Jam-style shared session — synced playback across multiple listeners, anyone can skip | 🔧🌐📱 | | High | Core feature. Build here first — full effort. No existing reference to lean on. |

## Offline / on-the-road

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Offline downloads (original quality) | Download tracks for offline listening, retaining source FLAC/etc. quality | 📱 | | Med | Mostly a client-side problem — server just needs to serve original files |
| Smart pre-caching | Auto-download next few queued tracks before signal is lost | 📱 | | Med | Builds on downloads feature |
| Data-saver mode | Auto-switch to transcoded/lower bitrate on mobile data, full quality on WiFi | 📱 (🔧 for transcode support) | | Low-Med | |
| Offline-first playback | Graceful fallback to local cache, no crash/hang when connection drops | 📱 | | Med | |
| Download queue management | Pause/resume/prioritize downloads, view storage used per playlist/album | 📱 | | Low-Med | |

## Listening experience

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Crossfade / gapless playback | Smoother track transitions | 📱🌐 | | Med | Media3 supports gapless natively; crossfade needs custom handling. **(Navidrome)** Its Subsonic clients play gapless, and the web player here doesn't (capability-map, Playback). Cheapest route: build the Android Phase 2 queue as a Media3 playlist from the start, not one track at a time |
| Smart shuffle | Avoid same artist playing back-to-back | 🔧 (logic) 📱🌐 (UI) | | Low-Med | |
| Listening stats/history dashboard | Visualize play counts, time-of-day patterns, etc. | 🔧 (data) 📱🌐 (UI) | | Med | Backend already has play history and top-tracks stats; the web UI has no history or top-tracks page yet, so this is mostly UI work |
| Custom EQ presets | Per-genre or per-playlist EQ | 📱 | | Med | Client-side audio processing |
| Sleep timer / alarm playlist | Timed stop, or wake-up playlist trigger | 📱 | | Low | |

## Road / bike-trip specific

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Road mode UI | Large buttons, simplified controls for use while riding | 📱 | | Low-Med | |
| Voice control | Hands-free playback control | 📱 | | Med-High | Android voice APIs |
| Bluetooth auto-pause/resume | Resume playback automatically when helmet speaker connects | 📱 | | Low-Med | Android Bluetooth connection events |
| Location-based playlists | Auto-switch playlist by GPS zone or leaving home network | 📱 | | Med | |

## Discovery & curation

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Smart auto-mixes | Sonic-similarity-based auto playlists from your own library | 🔧 | | High | Not in initial MVP scope |
| Rule-based smart playlists | e.g. "not played in 60 days," "high energy," auto-refreshing | 🔧 | | Med | Not in initial MVP scope. **(Navidrome)** Navidrome has these as `.nsp` rule files. The data for the usual rules is already stored (`tracks.play_count`, `tracks.last_played_at`, `date_added`, favorites), so most rules would just be SQL queries. "High energy" would need audio analysis, which is a separate problem |
| "On this day" / rediscovery | Surface old favorites | 🔧 (query logic) 📱🌐 (UI) | | Low-Med | |
| Private continuous radio | Keep playing similar tracks after playlist ends | 🔧 | | Med-High | Depends on smart auto-mix logic |

## Audio quality & fidelity

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Loudness normalization | ReplayGain/R128 across mixed-format library | 🔧 | | Med | Where it's applied is decided: client-side `GainNode`, with the server only storing and shipping the number (A3 in QUESTIONS). What's left is reading the ReplayGain tags at scan time and storing them. **(Navidrome)** reads and serves these tags |
| Bit-depth/sample-rate indicator | Show true lossless vs. transcoded status in player | 📱🌐 | | Low | |
| Synced lyrics (LRC) | Time-synced lyrics display | 🔧 (storage) 📱🌐 (display) | | Med | **(Navidrome)** reads embedded lyrics tags and `.lrc` files that sit next to the audio file. That avoids an external lyrics service |
| Bluetooth codec awareness | Prefer aptX HD/LDAC when headphones support it | 📱 | | Med | Android Bluetooth codec APIs |

## Platform integration (Android)

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Android Auto support | In-car/on-bike-computer playback control | 📱 | | Med-High | Media3 has first-class support |
| Wear OS companion | Control playback from watch | 📱 | | High | Separate app target |
| Home/lock screen widgets | Playback controls without opening app | 📱 | | Low-Med | |
| Chromecast support | Cast playback to home speakers | 📱 (🔧 stream URL access) | | Med | |

## Personal insight

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Local "year in review" | Private Spotify-Wrapped-style stats, computed locally | 🔧 (data) 📱🌐 (UI) | | Med | |
| Listening streaks/habits view | Track listening consistency over time | 🔧 (data) 📱🌐 (UI) | | Low-Med | |
| Star ratings | 1–5 stars per track/album, next to the existing favorites heart | 🔧🌐📱 | | Low | **(Navidrome)** has both ratings and favorites. Ratings would give smart playlists something better than play count to filter on |
| Forward scrobbles to ListenBrainz / Last.fm | Send your own plays on to an external profile | 🔧 | | Low-Med | **(Navidrome)** Must be opt-in per user and off by default, because it goes against *Zero telemetry* below |

## Library management

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Better duplicate detection | Dedup across mixed formats | 🔧 | | Med | |
| Custom tagging/mood metadata | Track fields beyond standard tags | 🔧 | | Med | Needs own schema — own DB now, no upstream constraints |
| Tag editing (write-back) | Edit tags from the app, write back to files | 🔧🌐 | | Med | Own tag-writing library, no gap to fill vs. a third-party server |

## Metadata model **(Navidrome)**

Navidrome is strongest here and this project is weakest. Today each track has one `artist_id`, and each album
belongs to one artist. There's no album artist, disc number or genre (`.docs/reference/database-schema.md`, ER diagram). This
gets harder to change the more data sits on top of it, so it's the one item in this pool where earlier is noticeably cheaper.

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Album artist | Group albums by the `albumartist` tag, not by the track artist | 🔧 (schema, scanner) 🌐📱 | | Med | Without it, a compilation or an album with "feat." tracks splits into several albums, one per track artist |
| Multiple artists per track | "A & B", "A feat. B" as linked artists, not one string | 🔧🌐📱 | | Med-High | Needs a `track_artists` join table. Settle how to split artist names before building it |
| Disc numbers | Sort multi-disc albums correctly | 🔧🌐📱 | | Low | Album tracks are ordered by track number alone (`backend/src/db/browse.ts:325`), so two discs' track 1s end up next to each other |
| Genres | Genre tag, browse by genre | 🔧🌐📱 | | Low-Med | Also useful as a filter for smart playlists |
| Compilations / "Various Artists" | Recognise the compilation flag and group those albums together | 🔧 | | Low-Med | Depends on album artist. Already listed as a gap in capability-map, Ingest |
| MusicBrainz IDs | Store MBIDs from tags when present | 🔧 | | Low | Makes identity stable when names are spelled differently, and helps duplicate detection above |

## Performance & scale

For two people, request handling is not the bottleneck. The costs that can actually be felt are **scans** and
**first-time transcodes**. The first two rows are the ones that matter. The rest only become worthwhile if measurements show a problem.

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Incremental scan | Skip files whose size and mtime haven't changed since the last scan | 🔧 | | Low-Med | **(Navidrome)** skips unchanged folders by mtime. Here, `scanFile` parses the tags of *every* file on every scan (`backend/src/services/scanner.ts:72`), six at a time, and scans run at boot and every 12 h. Scan time grows with library size even when nothing has changed. Needs the file's mtime stored on the track row |
| Pre-transcode the next queued track | When data-saver is on, warm the `?quality=low` cache for the next track or two before they're needed | 🔧 (📱🌐 trigger) | | Low-Med | First play of an uncached track waits for a full conversion: 4.5 s for a 7-minute FLAC, measured 2026-09-10 (`transcodeCache.ts` header). The existing `inFlight` map already removes duplicate requests. Fits well with the bike-ride use case |
| Cap concurrent ffmpeg runs | A global limit on simultaneous transcodes and waveform decodes | 🔧 | | Low | `inFlight` prevents two conversions of the *same* file, but nothing seen limits conversions of *different* files. Matters once pre-transcoding or room sync can start several at once |
| File watcher | Pick up new files within seconds instead of at the next 12 h scan | 🔧 | | Med | **(Navidrome)** has one. Only worth it after incremental scan, and inotify is unreliable on `/mnt` drives under WSL2 |
| Response compression | gzip/brotli for JSON API responses | 🔧 | | Low | `@fastify/compress` isn't a dependency. Mainly helps large track lists on mobile data. Audio is already compressed, so leave streams alone |
| SQLite tuning | `synchronous = NORMAL`, larger `cache_size`, `mmap_size` | 🔧 | | Low | Only `journal_mode = WAL` is set (`backend/src/db/connection.ts:25`). Measure before changing anything |
| Scale benchmark | Time a scan and measure memory against a synthetic 50k-track library | 🔧 | | Low-Med | Gives an actual number to compare with Navidrome instead of a guess. Run it in a `makeTempDir()` library, never the real one |

## Backup & portability

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Playlist/favorites export-import | Open format, avoids lock-in | 🔧 | | Low-Med | |
| Automatic metadata backup | Protect play history/ratings from server rebuilds | 🔧 | | Low | |

## Privacy / control

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Zero telemetry | No listening data leaves your network | 🔧 | | Low | Default posture of self-hosting |
| Full control over recommendations | No engagement-optimized algorithm, tuned to your own taste only | 🔧 | | N/A | Design principle, not a discrete feature |

---

## MVP scope note

Per `.docs/reference/tech-stack.md`, the scoped-down MVP explicitly **excludes**: smart auto-mixes, scrobbling, jukebox mode, sharing links, external auth providers. These stay on this list as future/someday items.

## Notes on categorization

- **Backend-only** items can mostly be built as part of the Fastify API without touching the client apps.
- **Mobile-only** items (Bluetooth codec awareness, Android Auto, Wear OS, widgets) are Android platform features — no backend work needed beyond what already exists.
- Several features (room sync, stats, smart playlists) need backend logic **plus** UI in whichever client(s) you build.
