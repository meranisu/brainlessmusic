# Development Roadmap

**What this is:** the ordered list of what to build next, and the definition of "finished" for each stage. Work top to bottom. When you don't know what to do, do the first unticked box.

- What *could* exist, by capability, with current status → `.docs/reference/capability-map.md`
- Unranked idea pool → `.docs/features/feature-brainstorm.md`
- Current state of the code → `.docs/STATUS.md`

_Created 2026-09-08. Supersedes the earlier layer-split draft of this file._

---

## The three releases

Each release has a **done-when** you can check by using the app, not by reading code. Nothing outside the current release gets built, however tempting.

| | Release | Done when |
|---|---|---|
| **v0.1** | *It works for me* | You spend a whole evening listening to your own library in the browser, on your LAN, and never once reach for a file manager or `library-player.html` |
| **v0.2** | *It works away from home* | You play music from your own server, on your phone, on a bike ride |
| **v0.3** | *It works with friends* | Two people in different places hear the same song at the same time, and either can skip it |

Everything else — Android Auto, EQ, lyrics, smart mixes, year-in-review, voice control, Wear OS — is **backlog**. It stays in the brainstorm pool and is not scheduled.

---

## v0.1 — It works for me (web, on the LAN)

The theme is **surfacing what the backend already does**. Most of these are UI tasks against endpoints that are built and tested. Two backend items come first only because they unblock everything else.

- [x] **1. Land the in-flight work.** ~17 modified files plus an untracked `TitleScreenPanel.tsx` are sitting uncommitted. Commit or revert before starting anything new.
  *Done when:* `git status` is clean. — **done 2026-09-08**, three commits on branch `land-in-flight-work`: the `set-password` CLI, the navy/orange design-system migration, and the README refresh. Frontend and backend both build; backend tests pass 7/7.

- [x] **2. Signed stream URLs** (backend). — **done 2026-09-08.** Add short-lived, single-purpose signed URLs for `/tracks/:id/stream` (a `?token=` the server mints from the session JWT, minutes-long expiry) so a plain `<audio src>` can play a track without a bearer header. Today [apiClient.ts:89](../../frontend/src/lib/apiClient.ts#L89) downloads whole files as blobs to work around this — which is why there's no seeking.
  *Done when:* an `<audio>` element pointed straight at a stream URL plays and seeks, and an expired URL is rejected. — verified: 200 on a plain `?token=` GET with byte-identical output, 206 with a correct `Content-Range` on a range request, and 401 for expired / session-token-in-URL / media-token-as-bearer / missing / malformed credentials.

- [x] **3. Real web player** (web). — **done 2026-09-08**, verified 20/20 in headless Chromium. Rebuild `PreviewPlayerBar` on top of step 2: a queue, a working seek bar, next/previous, shuffle via `POST /shuffle`, repeat, and keyboard shortcuts (space, arrows).
  *Done when:* you can queue an album and it plays through unattended.

- [x] **4. Cover art** (backend, then web). — **done 2026-09-08**, verified 10 backend + 10 browser checks. Extract embedded artwork during scan and upload, cache it to disk, serve `GET /albums/:id/cover` and `/tracks/:id/cover` with `ETag`/`Cache-Control` — using the same signed-URL scheme from step 2 so `<img src>` works. Then show it in the track list, the player bar, and the detail drawer, with a placeholder fallback.
  *Done when:* your library looks like a music app instead of a spreadsheet. Also unblocks the Android client later.

- [x] **5. Browse by album and artist** (web). — **done 2026-09-08**, verified 13/13 in headless Chromium. `/artists`, `/artists/:id`, `/albums`, `/albums/:id` are all built, tested, and called by nothing. Add an album grid and an artist page.
  *Done when:* you can get from an artist to one of their albums to its tracks without using search.

- [x] **6. Favorites in the UI** (web). — **done 2026-09-08**, verified 14/14 in headless Chromium. A heart on every row plus a favorites view. Backend is done.
  *Done when:* you can favorite a track while it plays and find it again later.

- [x] **7. Playlists in the UI** (web). — **done 2026-09-08**, verified 13/13 in headless Chromium. Create, rename, delete, add/remove tracks, drag to reorder. Full CRUD exists server-side already.
  *Done when:* you build a real playlist and play it start to finish.

- [x] **8. Scrobble from the web** (web). — **done 2026-09-09**, verified 19/19 in headless Chromium. Call `POST /tracks/:id/scrobble` when a track passes a play threshold. Nothing currently increments play counts, so the stats the backend collects are all zeros.
  *Done when:* play counts climb as you listen.

- [x] **9. Search that scales** (backend). — **done 2026-09-09**, verified 24 + 13 backend and 20/20 in headless Chromium. Replace the `LIKE '%x%'` scan in [browse.ts:313](../../backend/src/db/browse.ts#L313) with the FTS5 tables + triggers the project conventions already assume, and wire a search box in the web UI.
  *Done when:* search is instant on the full library and matches mid-word.

- [x] **10. Stop it booting insecurely** (backend). — **done 2026-09-09**, verified across seven real boot configurations plus 12 unit tests. `JWT_SECRET` falls back to `change-me`; refuse to start outside dev while it's still the default, so a real deployment can't quietly run on a guessable secret. (`backend/.env` is correctly gitignored — verified 2026-09-08.)
  *Done when:* a production-mode boot with a default secret fails loudly.

- [x] **11. A safety net** (backend). — **done 2026-09-09**, 103 checks across 10 test files. Tests for `scanner`, `trackFiling`, `streaming` byte-range math, and `token`, plus Fastify `.inject()` smoke tests for auth and admin gating. There is one test file in the repo today.
  *Done when:* `npm test` would catch you breaking streaming or the scanner.

---

## v0.2 — It works away from home (hosting + Android)

Hosting comes before the app, so there's a real server to point the phone at.

> **Numbers are stable IDs, not positions.** A box keeps its number for life, so
> the references scattered through `STATUS.md` and `CHANGELOG.md` never rot.
> Read the **groups** top to bottom, and the boxes inside a group top to bottom —
> that ordering, not the numbering, is what says what to do next.
>
> Regrouped by layer on 2026-09-10 at the owner's request, so the backend work
> can be seen and finished as one block instead of being interleaved with ops and
> Android. Boxes **24** and **25** were added the same day by owner decision,
> knowingly overriding Rule 1 below: the honest note is that they serve the
> bike-ride done-when only partly, and were scheduled anyway.

### Backend — the API both clients will talk to

- [x] **24. Formats, and transcoding worth using** (backend). — **done 2026-09-10**, 238 backend tests plus 12 checks in headless Chromium at desktop and phone widths. Every format the two of you actually use, end to end: `ogg`, `opus`, `mp3`, `m4a`, `aac`, `wav`, `flac` — scan and upload, correct MIME on stream, waveform, cover art. `?quality=low` now earns its keep: a content-addressed disk cache makes the converted copy an ordinary file, so it has `Content-Length`, byte ranges, an `ETag` and a working scrubber, and the transcode is skipped entirely when the source is already at or below the target (`tracks.bitrate` records it). Raw `.aac` is remuxed to `.m4a` always, because ADTS reports a duration ~50% long to ffprobe and Chrome alike. A data-saver toggle in both player surfaces makes it reachable, with a readout of what was *served* rather than what was asked for. Measured: 93% saving on FLAC, 36% on the ~120 kbps Opus this library is made of — that second number is why this box was worth arguing about before FLAC arrived. **`-ss` streaming was planned and then dropped**, not deferred: once the converted copy is a finished file, seeking it is an ordinary byte range and the offset had no caller (see A2/A5 in `.docs/QUESTIONS.md`). Plan: `.docs/features/formats-and-transcoding/planning.md`.
  *Done when:* a FLAC and a WAV both play in the browser, and a data-saver stream of each can be seeked.

- [x] **25. Resume where you left off** (backend, then clients). — **done 2026-09-10**, 257 backend tests plus 11 browser checks across two tabs. Server-side playback state per user — track, position, queue — so closing the tab and opening the phone picks up mid-song instead of at the top of the library. One row per user (`user_id` is the primary key, so last-write-wins is structural), the current track derived from the queue rather than stored beside it, and deleted or missing tracks filtered on read with the index re-derived around them. Restores **paused**: browsers block autoplay without a gesture, so resume-and-play would silently do nothing on a phone — the Android client can decide differently, which is what Q9 asks. Closing the player forgets the position; logging out keeps it.
  *Done when:* you pause on the desktop, open the phone, and it resumes the same track at the same second.

### Ops — somewhere to run it, reachable

- [ ] **13. Reach it from outside** (ops). **← the real critical path for this release:** nothing else in v0.2 gets music onto a phone away from home. Network/hosting decision made 2026-09-16 ([A20](../QUESTIONS.md#a20--which-os-for-the-server-was-q3)/[A21](../QUESTIONS.md#a21--is-the-home-network-behind-cgnat-was-q1)) — Arch Linux on a friend's PC, Cloudflare Tunnel (no CGNAT/port-forward question left to resolve), TLS handled by Cloudflare's edge. Setup walkthrough: `.docs/ops/cloudflare-tunnel-deployment.md`.
  **The prerequisite this box used to carry has changed shape, 2026-09-11.** It used to read: close `ALLOW_OPEN_REGISTRATION` before exposing the server, because a stranger could otherwise mint a listener account. That flag is now closed by default and `/signup` is gone — but guest access ([A13](../QUESTIONS.md#a13--one-guest-identity-per-device-not-a-shared-house-account)–[A16](../QUESTIONS.md#a16--signup-goes-and-open-registration-closes)) replaced the login form with a button, so **reaching the server is now the same thing as being allowed to listen.** The exposure did not go away; it moved, and it got wider. Two gates, which compose:
  - **At the network edge** — a **Cloudflare Access** application in front of the tunnel's public hostname (email-allowlist login), decided 2026-09-16. The app is never reachable without passing it first, and the guest door stays open behind it. This is the one being built now.
  - **`ENTRY_CODE`** — a shared secret typed once per device, shipped unset with guest access ([A15](../QUESTIONS.md#a15--the-entry-code-hook-ships-now-unset)). The backstop for a genuinely public URL, not a substitute for the first.

  *Done when:* you load the web app on mobile data and it plays — **and someone who has the URL but was never let onto the network gets nothing.*

- [x] **12. Docker image** (ops). — **done 2026-09-09**, verified by 16 HTTP + 12 browser checks against the production build; the `docker build` itself is unverified (sandbox networking) — run `docker compose up --build` to confirm. Required moving the API under `/api`, since the web app has its own `/albums`, `/search` and `/health` routes. Dockerfile + compose, ffmpeg in the image, volumes for the library and the DB, healthcheck wired to `/health`.
  *Done when:* `docker compose up` on the home server serves your library.

- [x] **14. Back up the database** (ops). — **done 2026-09-09**, 9 new tests (135 total) plus a restore performed against the real database. Backups run at server start and every 24h into `<db dir>/backups/` (inside the container's `/data` volume), keeping 14. Uses SQLite's online backup API, not a file copy — in WAL mode `cp` can capture a database that opens fine and is silently missing recent writes. Each backup is reopened, switched to `journal_mode = delete` so it is one self-contained file, and `PRAGMA integrity_check`-ed before it counts.
  *Done when:* you have restored from a backup at least one time. — **verified 2026-09-09**: a server booted against nothing but a restored backup file served 20 tracks, 5 play-history rows and a working login, with search intact. Done as an isolated copy rather than by overwriting the live database, so the drill risked nothing.

### Android — the listening client

- [ ] **15. Android Phase 0 — connect.** Scaffold Kotlin/Compose + Hilt + Retrofit, server-config screen, login, JWT in encrypted DataStore, distinct errors for unreachable host / 401 / TLS / bad URL. Verify the emulator reaches WSL2 on `http://10.0.2.2:3000`. — **scaffolded 2026-09-18**, everything but the last sentence: this environment has no JDK/Gradle/Android SDK to build or run it against the emulator. See `.docs/features/android-phase-0-connect/planning.md`.
  *Done when:* the app confirms a connection and stays logged in across restarts. — **not yet verified.**

- [ ] **16. Android Phase 1 — browse.** Artists → albums → tracks, search, cover art via Coil (needs step 4), loading and empty states, pull-to-refresh.
  *Done when:* you can find any track in your library from the phone.

- [ ] **17. Android Phase 2 — play.** Media3/ExoPlayer against the stream endpoint, byte-range seeking, queue, Now Playing screen, scrobble on play.
  *Done when:* you tap a track on the phone and hear it.

- [ ] **18. Android Phase 3 — background.** MediaSession, foreground service, lock-screen and notification controls, audio focus, auto-pause on headphone/Bluetooth disconnect.
  *Done when:* playback survives locking the phone and is controllable from the lock screen.

- [ ] **19. Offline downloads** (mobile). Download at original quality, manage the download queue, fall back to cache when the signal drops, data-saver mode via `?quality=low`. **[spec first]**
  *Done when:* you play a downloaded album in airplane mode.

---

## v0.3 — It works with friends (room sync)

The centerpiece. It lands here — not earlier — because syncing playback is only testable once two clients can actually play music.

- [x] **20. User management UI** (web). — **done 2026-09-09**, pulled forward from v0.3 because gating registration removed the only non-CLI way to make an account; verified 20/20 in headless Chromium. Admins add users and reset passwords from the browser instead of SSH + a CLI script. Needed the moment a second person is involved.
  *Done when:* you onboard a friend without touching a terminal.

- [ ] **21. Room sync spec** **[spec first]**. Data model, drift tolerance, clock sync, reconnect/rejoin, who may skip. Write it into `.docs/specs/` before any code — this is the one part of the project with no reference implementation to copy from.
  *Done when:* the spec answers "what happens when someone's phone loses signal for 30 seconds" without hand-waving.

- [ ] **22. Room sync backend.** WebSocket transport authed with the existing JWT, in-memory room registry, presence, playback broadcast, join-mid-session catch-up, shared queue mutations.
  *Done when:* two browser tabs stay in sync.

- [ ] **23. Room sync clients.** Web room view + monitor, then the Android client side.
  *Done when:* the v0.3 done-when above is true.

---

## Rules for adding new work

The point of these rules is that the project stopped feeling shapeless the moment the list stopped growing faster than the code.

1. **A new idea goes to the brainstorm pool, not the roadmap.** It gets scheduled only when it's part of the current release's done-when.
2. **If it doesn't extend one of the nine capabilities** in `.docs/reference/capability-map.md`, it isn't fundamental. Park it.
3. **Prefer surfacing over building.** If the backend already does something the UI doesn't show, that work beats a new endpoint almost every time.
4. **Finish the release before starting the next one.** Half of v0.1 plus half of v0.2 is worth less than all of v0.1.
5. **Tick the box here and update `.docs/STATUS.md` in the same change** — same rule as the changelog.

## Deliberately not doing

Recorded so these stay decided instead of getting re-litigated: Subsonic API compatibility, multi-tenancy, external auth providers, sharing links, jukebox mode, transcoding profiles per client, a plugin system, and anything that treats this as a product for strangers. It is a personal server for a handful of known people.
