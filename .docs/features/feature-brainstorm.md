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
| Room sync (group listening) | Spotify Jam-style shared session — synced playback across multiple listeners, anyone can skip | 🔧🌐📱 | ✅ all layers 2026-10-18 | High | Core feature. Build here first — full effort. No existing reference to lean on. Checked against code 2026-10-18: backend, web and Android all built; server merges simultaneous skips. |
| User profile page | A page per person: most played songs, favourite artists, songs and genres, liked and disliked songs, playlists they made (each public or private), a profile picture they upload, a bio and other details | 🔧🌐📱 | ✅ all layers 2026-10-18 | Med-High | Owner request, 2026-10-13, raised while redesigning the Users tab. Much of the data exists: per-user listening stats behind Home (`backend/src/db/listeningStats.ts`), likes and dislikes (A153), playlists. New: picture upload and storage (resize, size cap), bio fields, a public/private flag on playlists, and who can see whose profile. "Public" means other people on this server, not a sharing link (out of scope). Guests: decide whether they get one Checked against code 2026-10-18: profile, liked, disliked, bio, avatar and public/private playlists exist in all three. |
| Social layer (next-version theme candidate) | Grow profiles into a social layer among the people on the server: see what friends are playing now, what they've been listening to and liking, and follow along. Possible pieces: friends' "now playing" (Steam friends list style), an activity feed of plays, likes and new playlists (Twitter timeline style), following people, reacting to or commenting on a song or playlist | 🔧🌐📱 | Partial 2026-10-18 | High | Owner flagged it 2026-10-13 as possibly huge, after a friend's first reaction to profiles (v0.4.9): "it's like Spotify but it has functions like Twitter" and "or like Steam but for songs". Builds on profiles, People, people in search, Listen together and per-user stats. Still inside scope: for the handful of known people on this server, no sharing links, nothing public. Open before planning: which piece the friend actually meant by "Twitter", privacy controls (hide my activity, per-playlist visibility already exists), and whether this becomes v0.5's theme Checked against code 2026-10-18: only the People list with last listened time exists. No live now playing, activity feed, follow or reactions. |

## Offline / on-the-road

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Offline downloads (original quality) | Download tracks for offline listening, retaining source FLAC/etc. quality | 📱 | ✅ Android 2026-10-11 | Med | Mostly a client-side problem — server just needs to serve original files. Built on Android (Media3 download cache in `DownloadRepository.kt`, never evicts). The web has none |
| Smart pre-caching | Auto-download next few queued tracks before signal is lost | 📱 | ✅ Android 2026-10-18 | Med | Built, not phone-tested ([features/smart-precache](smart-precache/planning.md)). Fetches the playing song and the next 3 (Settings: Off, 1, 3, 5, 10) into the song cache on any network, skipped in rooms. Web preloads the next track on the server only |
| Data-saver mode | Auto-switch to transcoded/lower bitrate on mobile data, full quality on WiFi | 📱 (🔧 for transcode support) | Partial | Low-Med | Manual toggle on Android and web (`?quality=low`). No automatic Wi-Fi vs mobile-data switch: `NetworkMonitor.kt` only knows online or offline. No Wi-Fi-only download option either |
| Offline-first playback | Graceful fallback to local cache, no crash/hang when connection drops | 📱 | ✅ Android 2026-10-11 | Med | Queue skips to downloaded or cached songs, plays made offline are sent later, offline banner. The web has none. Offline browsing only covers the Downloads tab, not the library |
| Download queue management | Pause/resume/prioritize downloads, view storage used per playlist/album | 📱 | ✅ Android 2026-10-18, except priority | Low-Med | Built, not phone-tested ([features/download-queue](download-queue/planning.md), A219): per-song pause, resume and stop with a full queue list, space used on each album and playlist tile, an opt-in Wi-Fi only switch. Not built: priority or reorder (Q208 option c) |

## Listening experience

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Crossfade / gapless playback | Smoother track transitions | 📱🌐 | ✅ web and Android 2026-10-18 | Med | Checked against code 2026-10-18: built on both clients (`frontend/src/lib/transitions.ts`, Android tail player in `EqualizerSession.kt`). The earlier note saying web has no gapless is out of date. |
| Smart shuffle | Avoid same artist playing back-to-back | 🔧 (logic) 📱🌐 (UI) | ✅ all layers 2026-10-18 | Low-Med | Checked against code 2026-10-18: `backend/src/services/shuffle.ts`; Android shuffles on the phone (`SmartShuffle.kt`). |
| Listening stats/history dashboard | Visualize play counts, time-of-day patterns, etc. | 🔧 (data) 📱🌐 (UI) | ✅ all layers 2026-10-20 | Med | Built: [features/stats-dashboard](stats-dashboard/planning.md). Web `/stats` and an Android Stats screen: trend, hour and weekday, day streak, top lists, every play. Android not phone-tested. |
| Custom EQ presets | Per-genre or per-playlist EQ | 📱 | Partial 2026-10-18 | Med | Checked against code 2026-10-18: Android opens the system equalizer. No presets of our own. Web has none. |
| Sleep timer / alarm playlist | Timed stop, or wake-up playlist trigger | 📱 | ✅ timer, Android 2026-10-18 | Low | Timer built ([features/sleep-timer](sleep-timer/planning.md)); the alarm playlist half is not |

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
| Rule-based smart playlists | e.g. "not played in 60 days," "high energy," auto-refreshing | 🔧 | ✅ all layers 2026-10-18 | Med | Planned: [features/smart-playlists](smart-playlists/planning.md) (rule builder, my plays only, backend + web + Android). **(Navidrome)** Navidrome has these as `.nsp` rule files. The data for the usual rules is already stored (`tracks.play_count`, `tracks.last_played_at`, `date_added`, favorites), so most rules would just be SQL queries. "High energy" would need audio analysis, which is a separate problem Checked against code 2026-10-18: backend, web editor and Android sheet all exist. |
| "On this day" / rediscovery | Surface old favorites | 🔧 (query logic) 📱🌐 (UI) | Partial 2026-10-18 | Low-Med | Checked against code 2026-10-18: a Rediscover shuffle mode exists (backend, Android). No on-this-day feature, nothing on web. |
| Private continuous radio | Keep playing similar tracks after playlist ends | 🔧 | Partial 2026-10-18 | Med-High | Depends on smart auto-mix logic Checked against code 2026-10-18: web tops up the queue from its own source. Nothing similar plays after the queue ends. |

## Audio quality & fidelity

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Loudness normalization | ReplayGain/R128 across mixed-format library | 🔧 | ✅ all layers 2026-10-18 | Med | Checked against code 2026-10-18: built as volume levelling: ffmpeg measures loudness into `loudness_lufs` and `loudness_peak` in a background backfill; clients apply the gain. It does not read ReplayGain tags. |
| Bit-depth/sample-rate indicator | Show true lossless vs. transcoded status in player | 📱🌐 | Partial 2026-10-18 | Low | Checked against code 2026-10-18: sample rate, bitrate and format are shown. No bit depth and no lossless badge. |
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
| Listening streaks/habits view | Track listening consistency over time | 🔧 (data) 📱🌐 (UI) | ✅ 2026-10-20 | Low-Med | Built with the stats dashboard: day streak (current and best), hour and weekday view. |
| Star ratings | 1–5 stars per track/album, next to the existing favorites heart | 🔧🌐📱 | | Low | **(Navidrome)** has both ratings and favorites. Ratings would give smart playlists something better than play count to filter on |
| Forward scrobbles to ListenBrainz / Last.fm | Send your own plays on to an external profile | 🔧 | | Low-Med | **(Navidrome)** Must be opt-in per user and off by default, because it goes against *Zero telemetry* below |

## Library management

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Better duplicate detection | Dedup across mixed formats | 🔧 | | Med | |
| Custom tagging/mood metadata | Track fields beyond standard tags | 🔧 | | Med | Needs own schema — own DB now, no upstream constraints |
| Tag editing (write-back) | Edit tags from the app, write back to files | 🔧🌐 | Partial 2026-10-18 | Med | Own tag-writing library, no gap to fill vs. a third-party server Checked against code 2026-10-18: `PATCH /tracks/:id` edits the database only. Nothing is written back to the files. |

## Metadata model **(Navidrome)**

Navidrome is strongest here. Album artist, disc numbers, genres and compilations were built after this list was written
(migrations 0030 and 0032). What is still missing: multiple artists per track and MusicBrainz IDs. Each track still has one
`artist_id`. This gets harder to change the more data sits on top of it, so earlier is cheaper.

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Album artist | Group albums by the `albumartist` tag, not by the track artist | 🔧 (schema, scanner) 🌐📱 | ✅ all layers 2026-10-18 | Med | Checked against code 2026-10-18: migration 0030; albums keyed on title, folder and album artist (`backend/src/db/library.ts:153`). |
| Multiple artists per track | "A & B", "A feat. B" as linked artists, not one string | 🔧🌐📱 | | Med-High | Needs a `track_artists` join table. Settle how to split artist names before building it |
| Disc numbers | Sort multi-disc albums correctly | 🔧🌐📱 | ✅ all layers 2026-10-18 | Low | Checked against code 2026-10-18: sort is disc then track (`backend/src/db/browse.ts:193`); disc headers on web and Android. |
| Genres | Genre tag, browse by genre | 🔧🌐📱 | ✅ all layers 2026-10-18 | Low-Med | Checked against code 2026-10-18: migration 0032, `/genres` route, browse screens on web and Android. |
| Compilations / "Various Artists" | Recognise the compilation flag and group those albums together | 🔧 | ✅ backend 2026-10-18 | Low-Med | Checked against code 2026-10-18: compilation flag files the album under Various Artists (`backend/src/db/library.ts:154`). Clients have no special handling. |
| MusicBrainz IDs | Store MBIDs from tags when present | 🔧 | | Low | Makes identity stable when names are spelled differently, and helps duplicate detection above |

## Performance & scale

For two people, request handling is not the bottleneck. The costs that can actually be felt are **scans** and
**first-time transcodes**. The first two rows are the ones that matter. The rest only become worthwhile if measurements show a problem.

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Incremental scan | Skip files whose size and mtime haven't changed since the last scan | 🔧 | ✅ built 2026-10-20 | Low-Med | Built: [features/incremental-scan](incremental-scan/planning.md), migration 0041, `?full=1` forces a full read. Earlier note: **(Navidrome)** skips unchanged folders by mtime. Here, `scanFile` parses the tags of *every* file on every scan (`backend/src/services/scanner.ts:72`), six at a time, and scans run at boot and every 12 h. Scan time grows with library size even when nothing has changed. Needs the file's mtime stored on the track row |
| Pre-transcode the next queued track | When data-saver is on, warm the `?quality=low` cache for the next track or two before they're needed | 🔧 (📱🌐 trigger) | ✅ web 2026-10-10 | Low-Med | First play of an uncached track waits for a full conversion: 4.5 s for a 7-minute FLAC, measured 2026-09-10 (`transcodeCache.ts` header). The existing `inFlight` map already removes duplicate requests. Fits well with the bike-ride use case Android never calls `POST /tracks/:id/prepare` (checked 2026-10-18). |
| Cap concurrent ffmpeg runs | A global limit on simultaneous transcodes and waveform decodes | 🔧 | ✅ 2026-10-20 | Low | Done 2026-10-20: cover thumbnails capped at 2 with a queue of 64 and deduped (`backend/src/services/artwork.ts`); waveform was already 2, loudness 1, avatars rare with a timeout. Earlier note: `inFlight` prevents two conversions of the *same* file, but nothing seen limits conversions of *different* files. Matters once pre-transcoding or room sync can start several at once Checked against code 2026-10-18: `MAX_CONCURRENT_TRANSCODES` (default 2) caps transcodes only. Waveform, loudness and artwork runs are not capped. |
| File watcher | Pick up new files within seconds instead of at the next 12 h scan | 🔧 | | Med | **(Navidrome)** has one. Only worth it after incremental scan, and inotify is unreliable on `/mnt` drives under WSL2 |
| Response compression | gzip/brotli for JSON API responses | 🔧 | ✅ built 2026-10-20 | Low | Built: `@fastify/compress` in `backend/src/app.ts`, replies over 1 KB. Earlier note: `@fastify/compress` wasn't a dependency. Mainly helps large track lists on mobile data. Audio is already compressed, so leave streams alone |
| SQLite tuning | `synchronous = NORMAL`, larger `cache_size`, `mmap_size` | 🔧 | Measured, not worth it 2026-10-20 | Low | Measured 2026-10-20, 5k-track bench, two runs each: first scan 18.7/20.0 s before, 15.2/18.0 s with `synchronous = NORMAL`; full rescan 19.2/17.1 s before, 14.2/22.2 s after. Run-to-run noise is bigger than the gain, since scans already commit 32 files at a time. DB is 35 MB at 50k, inside the OS cache, so `cache_size`/`mmap_size` have nothing to win. Left unchanged; revisit only if a write-heavy path shows up. Earlier note: Only `journal_mode = WAL` is set (`backend/src/db/connection.ts:17`). Measure before changing anything |
| Scale benchmark | Time a scan and measure memory against a synthetic 50k-track library | 🔧 | ✅ built 2026-10-20 | Low-Med | Built: `npm run bench:scale -- --tracks 50000`. 2k run: full read 79 files/s (~12 ms/file), unchanged rescan 0.14 s, 128 MB RSS. 50k run (2026-10-20): first scan 1077 s (46 files/s), unchanged rescan 5.8 s, 500 touched 23.4 s, full rescan 1303 s, missing-file check 43.8 s, peak RSS 231 MB, DB 35.2 MB. The missing-file check grew faster than the library (0.08 s at 2k, 43.8 s at 50k); checked 2026-10-20: 0.4 s at 10k, and 50k bare `stat` calls take 1.7 s, so the code is linear and the 50k figure was the machine (low free RAM after a 40-minute scan), not the check. No change needed. Earlier note: Gives an actual number to compare with Navidrome instead of a guess. Run it in a `makeTempDir()` library, never the real one |
| Library list cache | Show the last library list at once, then refresh it: keep the first page or two in the browser between visits (web), a Room-backed copy of the list with sync (Android, also browsing offline), a "nothing changed" 304 check | 🌐📱 (🔧 for the 304) | Partial 2026-10-18 | Low (web), High (Android), Med (304) | Raised 2026-10-18 while building the letter jump ([features/library-letter-jump](library-letter-jump/planning.md)); parked, not decided. At 12,759 songs the server takes 25 to 125 ms a page, so measure the real server first. Costs: stale hidden, missing and liked flags, phone storage (about 10 MB per 50k songs), and a version number the 304 needs from every write path Checked against code 2026-10-18: web has only react-query's in-memory cache. Android and the 304 check are not built. |

## Backup & portability

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Playlist/favorites export-import | Open format, avoids lock-in | 🔧 | | Low-Med | |
| Automatic metadata backup | Protect play history/ratings from server rebuilds | 🔧 | ✅ 2026-10-18 | Low | Checked against code 2026-10-18: `backend/src/services/backup.ts`: daily by default, keeps 14, runs an integrity check. |

## Privacy / control

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Zero telemetry | No listening data leaves your network | 🔧 | ✅ 2026-10-18 | Low | Default posture of self-hosting Checked against code 2026-10-18: no analytics or crash SDKs. Only GitHub release checks go out. |
| Full control over recommendations | No engagement-optimized algorithm, tuned to your own taste only | 🔧 | | N/A | Design principle, not a discrete feature |

---

## MVP scope note

Per `.docs/reference/tech-stack.md`, the scoped-down MVP explicitly **excludes**: smart auto-mixes, scrobbling, jukebox mode, sharing links, external auth providers. These stay on this list as future/someday items.

## Notes on categorization

- **Backend-only** items can mostly be built as part of the Fastify API without touching the client apps.
- **Mobile-only** items (Bluetooth codec awareness, Android Auto, Wear OS, widgets) are Android platform features — no backend work needed beyond what already exists.
- Several features (room sync, stats, smart playlists) need backend logic **plus** UI in whichever client(s) you build.
