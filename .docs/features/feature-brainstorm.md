# Feature Brainstorm

**This is an idea pool, not a plan.** Nothing here is scheduled. It's the holding area for everything that has come up in conversation, kept so ideas aren't lost — deliberately unranked, because ranking this list is what made the project feel shapeless in the first place.

The plan lives in `.docs/process/development-roadmap.md` (three releases, ordered checklist). What the system could do, by capability and with current status, is in `.docs/reference/capability-map.md`.

An item graduates from this pool to the roadmap only when it serves the current release's done-when. Most of this list is post-v0.3 and may never be built — that's the intended outcome, not a failure. The Priority/Complexity columns are left as rough gut-check notes; treat them as annotations, not commitments.

Legend: 🔧 Backend · 🌐 Web App · 📱 Mobile App (Android)

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
| Crossfade / gapless playback | Smoother track transitions | 📱🌐 | | Med | Media3 supports gapless natively; crossfade needs custom handling |
| Smart shuffle | Avoid same artist playing back-to-back | 🔧 (logic) 📱🌐 (UI) | | Low-Med | |
| Listening stats/history dashboard | Visualize play counts, time-of-day patterns, etc. | 🔧 (data) 📱🌐 (UI) | | Med | |
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
| Rule-based smart playlists | e.g. "not played in 60 days," "high energy," auto-refreshing | 🔧 | | Med | Not in initial MVP scope |
| "On this day" / rediscovery | Surface old favorites | 🔧 (query logic) 📱🌐 (UI) | | Low-Med | |
| Private continuous radio | Keep playing similar tracks after playlist ends | 🔧 | | Med-High | Depends on smart auto-mix logic |

## Audio quality & fidelity

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Loudness normalization | ReplayGain/R128 across mixed-format library | 🔧 | | Med | |
| Bit-depth/sample-rate indicator | Show true lossless vs. transcoded status in player | 📱🌐 | | Low | |
| Synced lyrics (LRC) | Time-synced lyrics display | 🔧 (storage) 📱🌐 (display) | | Med | |
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

## Library management

| Feature | Description | Layers | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Better duplicate detection | Dedup across mixed formats | 🔧 | | Med | |
| Custom tagging/mood metadata | Track fields beyond standard tags | 🔧 | | Med | Needs own schema — own DB now, no upstream constraints |
| Tag editing (write-back) | Edit tags from the app, write back to files | 🔧🌐 | | Med | Own tag-writing library, no gap to fill vs. a third-party server |

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
