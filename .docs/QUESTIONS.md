# Open questions

The one place for anything waiting on an owner decision. If I end a turn asking
you something, it has an entry here **before** I ask — so a question that goes
unanswered for three sessions is still on the list, and one you already answered
is never asked twice.

## How this works

- **Every question gets an ID** (`Q1`, `Q2`, …). IDs are permanent and never
  reused, including after a question is answered or dropped.
- **Answer by ID.** "Q7: yes, move it" is enough — no need to restate the
  question or find the turn it came from.
- **Answered questions stay in the file**, moved to [Answered](#answered) with
  the decision and where it landed. That section is the anti-re-litigation
  record: if something here is already decided, I don't re-open it without you
  saying so.
- **This file is the source of truth for open questions.** `.docs/STATUS.md`
  points here rather than keeping its own list, and feature planning docs link
  to IDs instead of restating them.
- **Blocking** means work is stopped until you answer. **Non-blocking** means I
  can keep going under a stated assumption — the assumption is written in the
  entry, so if you disagree later, you can see exactly what got built on it.

---

## Open

| ID | Question | Asked | Blocking |
|---|---|---|---|
| [Q5](#q5--tag-editing-scope) | Tag-editing scope | 2026-09-09 | No |
| [Q77](#q77--how-does-the-android-app-get-past-cloudflare-access) | How does the Android app get past Cloudflare Access? | 2026-10-11 | Yes, before Access goes on |
| [Q78](#q78--who-goes-on-the-access-email-list) | Who goes on the Access email list? | 2026-10-11 | Yes, before Access goes on |

### Q5 — Tag-editing scope
**Asked:** 2026-09-09 · **Blocking:** no

Which fields are editable, whether batch-edit exists, and what undo/backup
behaviour looks like when the edit writes back to the file on disk.

### Q77 — How does the Android app get past Cloudflare Access?
**Asked:** 2026-10-11 · **Blocking:** yes, before Access goes on ([A74](#a74--cloudflare-access-goes-in-front-of-the-public-hostname-was-q30))

Access answers any request without its login cookie with Cloudflare's login page. A browser can show it; the app
can't, so it would stop working the moment Access is switched on.

- **A. A service token built into the app (recommended).** Cloudflare issues an id and secret; the app sends both on
  every request, and Access lets it through. Someone could dig the secret out of the APK, but it still keeps out
  everyone who just finds the address. The secret stays out of git (a build property, like `SERVER_URL`'s override).
- **B. Let `/api/*` through without Access.** The app works unchanged, but then the API, where the music actually is,
  is open to anyone again. Access would only guard the web page.

### Q78 — Who goes on the Access email list?
**Asked:** 2026-10-11 · **Blocking:** yes, before Access goes on ([A74](#a74--cloudflare-access-goes-in-front-of-the-public-hostname-was-q30))

Every browser visit starts with Cloudflare asking for an email on the list and a one-time code sent to it. That
includes friends using a guest code on the web: without their email on the list they never reach the guest screen.

- **A. You and the friends who use the web (recommended).** Each friend's email goes on the list once.
- **B. Only you.** Friends use the Android app only (with Q77's token), never the web.

## Answered

### A103 — Room-sync design is the spec *(was Q4)*
**Answered:** 2026-10-11. The owner started v0.3; data model, clock sync, drift (0.3 s, seek only), reconnect and
the 30-second case are decided in [specs/room-sync.md](specs/room-sync.md), with A100–A102 for the owner's picks.

### A102 — It's called "Listen together" *(was Q104)*
**Answered:** 2026-10-11, picked option A. "Listen together" in the UI, "room code" for the code, "room" in code.
Spec: [specs/room-sync.md](specs/room-sync.md).

### A101 — Everyone can do everything in a room; the host ends it *(was Q103)*
**Answered:** 2026-10-11, picked option A. Any member can play, pause, seek, skip and edit the queue; only the host
ends the room or removes people. Spec: [specs/room-sync.md](specs/room-sync.md).

### A100 — Guests can join rooms, with full controls *(was Q102)*
**Answered:** 2026-10-11, "yes", read as option A (same controls as everyone; their plays still aren't recorded,
A37). Spec: [specs/room-sync.md](specs/room-sync.md).

### A99 — Big uploads go over Tailscale, not the public address *(was Q101)*
**Answered:** 2026-10-11, picked option A. Cloudflare refuses request bodies over 100 MB, so files that big are
uploaded from `http://100.110.131.71:3000/upload` (smol over Tailscale), which skips Cloudflare. No code change; the
1 GB server limit stays. Checked the same day: `/api/health` and `/upload` answer 200 over Tailscale. How-to:
[ops/cloudflare-tunnel-deployment.md](ops/cloudflare-tunnel-deployment.md) ("Uploads over 100 MB").

### A98 — Guests get a smaller Home *(was Q100)*
**Answered:** 2026-10-11, picked option A. Guests see the greeting and Shuffle my library; the stats parts don't show.
Plan: [features/home-tab/planning.md](features/home-tab/planning.md).

### A97 — The You tab becomes Home: playing first, then stats *(was Q99)*
**Answered:** 2026-10-11, picked option A. Home is the first tab and where the app opens (offline starts still open
Downloads). Order: greeting, Shuffle my library, Recently played, the library tiles, then the ranged stats.
Plan: [features/home-tab/planning.md](features/home-tab/planning.md).

### A96 — Your library becomes three tiles under the You header *(was Q98)*
**Answered:** 2026-10-11, picked option A. Liked, Playlists and Hear less sit as three tappable tiles (icon, count,
name) right under the player card, above the range picker; the Your library card at the bottom goes. Landed in
`YouScreen.kt` (`LibraryTiles`).

### A95 — A downloaded song says "On this phone" in the player *(was Q97)*
**Answered:** 2026-10-11, picked option A. Now Playing keeps the format line for a song playing from the phone and
swaps the buffer/network line for a download-done icon and "On this phone". The data saver button hides when no song
in the queue would stream. Landed in `NowPlayingScreen.kt` (`StreamReadout`) and `PlaybackController.streamInfo()`.

### A94 — Settings back in line with the rest of the app; A92 and A93 undone *(was Q96)*
**Answered:** 2026-10-11, in chat: "all of it but on the main page of the settings, rever to just appearance playback
and everything like before". Owner asked for Settings to match the app. `SettingsScreen.kt` and `DownloadSettings.kt`
are back to their state before A92 (0c03a5e^): the main page is one outlined card of icon rows, sub-pages use outlined
cards, outlined buttons and bordered colour tiles. DESIGN.md's Settings exception is removed. This supersedes
[A92](#a92--settings-goes-borderless-arcade-menu-on-the-main-page-filled-cards-below-was-q94) and
[A93](#a93--borderless-settings-brighter-dark-cards-a-cursor-flash-on-tap-was-q95).

### A93 — Borderless Settings: brighter dark cards, a cursor flash on tap *(was Q95)*
**Answered:** 2026-10-11, in chat: "lets fix". Both review findings fixed. **1.** In the dark, the sub-page card moves
up to `surfaceContainerHighest` (card/ground now 1.24-1.67, was 1.07-1.43), and inside it tonal buttons, switch
tracks, colour tiles and dividers take the ground colour so they don't vanish into the card. Light is unchanged: its
card is already white. **2.** A tap on a main-page row holds the accent fill for 120 ms before the page opens.
Landed in `SettingsScreen.kt` (`Card`, `PageRow`).

### A92 — Settings goes borderless: arcade menu on the main page, filled cards below *(was Q94)*
**Answered:** 2026-10-11, in chat: "go with d, only the card outlines". The Settings main page is an arcade options
menu: page names large in Barlow Condensed on the ground, the current value on the right in the accent, and the row
fills with the accent when pressed. Sub-pages keep one card each, filled with no outline. Row dividers stay. Colour
tiles drop their border (picked = accent fill plus check); outlined buttons become tonal. Landed in
`SettingsScreen.kt`, `DownloadSettings.kt` and DESIGN.md (Android).

### A91 — The You tab upgrade: the recommended picks *(was Q93)*
**Answered:** 2026-10-11, in chat: "i will follow you pick". From the You tab idea list: recently played (`GET /me/history`),
a per-song stats sheet (`GET /me/stats/tracks/:id`), Play all / Shuffle on Top songs, the song menu on top songs, a
player-card header, the #1 song large, and leaderboard rank numbers. Then rank changes against the previous period
(backend). [plan](features/you-tab-upgrade/planning.md).

### A90 — The Downloads tab gets all four additions *(was Q92)*
**Answered:** 2026-10-11, in the question picker: a storage header (space against the limit, counts) with Play all /
Shuffle all downloads; filter chips (All, Albums, Playlists, Songs); a page per album or playlist with each song's
state and single-song removal; an in-progress section with pause and resume all.

### A89 — The Downloads tab is a cover grid *(was Q91)*
**Answered:** 2026-10-11, in the question picker: "Cover grid (Recommended)". Two columns of album and playlist covers,
like the music select, with the download state on the cover.

### A88 — Downloads: show space used, plus an optional limit *(was Q90)*
**Answered:** 2026-10-11, in chat: "show space used, and allow for limits". Settings show the space downloads use,
and you can set a limit (off by default). New downloads stop at the limit and say so; nothing already downloaded is
deleted to make room. Spec: `.docs/specs/offline-downloads.md`.

### A87 — Offline plays are counted, with the real play time *(was Q89)*
**Answered:** 2026-10-11, in chat: "a". Plays made with no network are queued on the phone and sent when it's back
online; `POST /tracks/:id/scrobble` takes an optional `playedAt`. Spec: `.docs/specs/offline-downloads.md`.

### A86 — Albums, playlists and single songs can be downloaded *(was Q88)*
**Answered:** 2026-10-11, in chat: "a". Guests get albums and songs only (A37). Spec: `.docs/specs/offline-downloads.md`.

### A85 — Downloads run on any network *(was Q87)*
**Answered:** 2026-10-11, in chat: "any network". No Wi-Fi-only rule and no setting for it. Spec:
`.docs/specs/offline-downloads.md`.

### A84 — The web lists drop the duplicate "Loading…" subtitle *(was Q81)*
**Answered:** 2026-10-11, in chat: "yes". Albums, Artists, Playlists and Favorites show the subtitle only once the
count is known, so a screen reader hears the skeleton's label once.

### A83 — Old search results stay on screen while a new search loads *(was Q80)*
**Answered:** 2026-10-11, in chat: "yes". Both apps keep the previous results until the new ones arrive; the skeleton
shows only for a first search. Still unchecked from the same review: whether screen readers announce the skeleton's
loading label (web `role="status"`, Android `liveRegion`), and seeing the skeletons on a phone against the real backend.

### A82 — The shuffle buttons come back to the last mode *(was Q86)*
**Answered:** 2026-10-12, in chat: "pick a". After a tapped song turns shuffle off, shuffle all and a playlist's Shuffle
turn it back on in the last mode it was on in (Shuffle, Rediscover or Albums), saved across launches. The Now Playing
button still cycles from off to Shuffle. Built in the 2026-10-12 "shuffle buttons remember the last mode" CHANGELOG entry.

### A81 — Themed launcher icon: same art, recoloured per theme *(was Q85)*
**Answered:** 2026-10-11, in chat: "q85: recommened". The disc and waveform stay; each theme gets its own ground,
circle, accent and a lighter dot from its palette. A side-by-side preview comes before merging. Plan:
`.docs/features/android-themed-launcher-icon/planning.md`.

### A80 — The launcher icon switches only in the background, while nothing plays *(was Q84)*
**Answered:** 2026-10-11, in chat: "q84: pick the recommended". The switch waits until the app is in the background
and nothing is playing; otherwise it happens at the next cold start. A switch never stops music.

### A79 — Themed launcher icon is opt-in, off by default *(was Q83)*
**Answered:** 2026-10-11, in chat: "q83: off by default". A "Match app icon to theme" switch in Settings, off by
default. With it on, a theme that arrives from the profile (A78) changes the icon too.

### A78 — Android colours follow the profile, Material You stays on the phone *(was Q79)*
**Answered:** 2026-10-11, in chat: "f2: yes", taken as the recommended option A. The app reads the profile's theme
(`theme` on `/auth/me`) on login, guest entry and cold start, and saves picks with `PUT /me/theme`. Material You is
stored only on the phone and leaves the profile alone; while the phone is on it, the profile's theme is not applied.
A profile with no theme yet takes the phone's pick. Built in the 2026-10-11 "Android colours follow the profile"
CHANGELOG entry.

### A77 — Both new shuffle modes: Rediscover and Albums *(was Q82)*
**Answered:** 2026-10-11, in chat: "yes both, so the button shuffle has four types now". Read as: the Now Playing
shuffle button cycles off → Shuffle → Rediscover → Albums, like repeat. Rediscover leans toward songs this user has
not played for a long time or ever (`play_history`); Albums plays random albums, each in track order. Built in the
2026-10-11 "Shuffle modes" CHANGELOG entry.

### A76 — Open registration is off, and the outside gate is Access *(was Q2)*
**Answered:** 2026-10-11, by [A74](#a74--cloudflare-access-goes-in-front-of-the-public-hostname-was-q30). Q2 was to
close once Q30 was answered either way. `ALLOW_OPEN_REGISTRATION=false` and `ENTRY_CODE` were set on smol on
2026-09-21; the remaining gate is Access, which waits on Q77 and Q78.

### A75 — Uploads stay single-destination *(was Q27)*
**Answered:** 2026-10-11 · **No root picker.** An upload files into the default library root and that's it, as built.

### A74 — Cloudflare Access goes in front of the public hostname *(was Q30)*
**Answered:** 2026-10-11 · **Yes.** Overrides the assumption that kept it off. Not switched on yet: before it is, the
Android app needs a way through (Q77) and the email list needs deciding (Q78), or the app and guests are locked out.
Switching it on is done in the Cloudflare dashboard by the owner; the app side (Q77) is code here.

Related, non-blocking: nothing copies `/data/backups` (the backend's own
database backups, which live in the same Docker volume as the database) off
`smol`, so a dead disk takes both. Not a question — a gap; noted here so it
is not lost.

### A73 — Web gapless: two players first, measured *(was Q73)*
**Answered:** 2026-10-11 · **Yes, as assumed.** Two audio elements with the next song preloaded. Sample-exact playback
through Media Source Extensions only if the measured seam is audible on real albums. Plan: [gapless and fades](features/gapless-and-crossfade/planning.md).

### A72 — Albums stay gapless, with a switch *(was Q72)*
**Answered:** 2026-10-11 · **No fade between back-to-back tracks of the same album, and a setting for it.** "Keep albums
gapless", on by default. Turned off, album tracks fade like any others. Plan: [gapless and fades](features/gapless-and-crossfade/planning.md).

### A71 — All three fades, each one optional *(was Q71)*
**Answered:** 2026-10-11 · **All of them, each one able to be turned off.** Read as two settings, on web and Android:
- **Between songs**, one choice of three, so they rule each other out: **Gapless** (default), **Crossfade** (overlap;
  length 3, 6, 9 or 12 s) or **Fade out, then in** (no overlap; same lengths).
- **Fade on pause, play and skip**, a switch of its own (about 0.15 s), on by default.

Plan: [gapless and fades](features/gapless-and-crossfade/planning.md).

### A70 — A used guest code works until revoked or idle for 90 days *(was Q70)*
**Answered:** 2026-10-11 · **A, tightened.** Owner asked which fits better; this was the recommendation. A used code
keeps working until the admin revokes it, **or** its guest has not been seen for `GUEST_IDLE_DAYS` (90). That second
part is checked at sign-in, not only at cap pressure, so a forgotten code stops working on its own. No fixed lifetime:
friends would have to keep asking for new codes. [guest accounts plan](features/guest-accounts/planning.md).

### A69 — A guest code works on any device, and every sign-in is logged *(was Q69)*
**Answered:** 2026-10-11 · **Any device, logged.** No device limit. Each sign-in with a code is recorded (when, web or
Android, IP, device description) and shown to the admin under that code, next to Revoke. Supersedes the "one use"
part of [A43](#a43--per-guest-codes-one-use-7-days-door-toggled-on-the-panel). [guest accounts plan](features/guest-accounts/planning.md).

### A68 — Guests sign in with the code alone *(was Q68)*
**Answered:** 2026-10-11 · **Code alone.** The name is a display label, changeable later; two guests may share one.
An empty name becomes `Guest` plus a random number. [guest accounts plan](features/guest-accounts/planning.md).

### A67 — Approving a guest's code request signs that device straight in *(was Q67)*
**Answered:** 2026-10-11 · **Straight in.** The requesting device waits; on Approve it is signed in and shown its
code once, for use on other devices. Requests are rate limited and capped. [guest accounts plan](features/guest-accounts/planning.md).

### A66 — The profile comes to the web too *(was Q66)*
**Answered:** 2026-10-11 · **Both.** Android and the web each get the profile, Wrapped and the mix, over the same
endpoints. [profile plan](features/profile-and-listening-stats/planning.md), Phase 7 (web).

### A65 — Android creates and edits playlists *(was Q65)*
**Answered:** 2026-10-11 · **Create and edit.** Android gets new playlist, rename, delete, add a song (from the song
menu and Now Playing), remove and reorder, plus a heart to like songs. [profile plan](features/profile-and-listening-stats/planning.md), Phase 3.

### A64 — Wrapped shows up yearly, from December *(was Q64)*
**Answered:** 2026-10-11 · **Yearly.** Unlocks in December for that year; past years stay viewable. [profile plan](features/profile-and-listening-stats/planning.md), Phase 6.

### A63 — "Your mix" is a live mix that refreshes daily *(was Q63)*
**Answered:** 2026-10-11 · **Live.** Shown on the profile, rebuilt daily, play-only; not written into playlists.
[profile plan](features/profile-and-listening-stats/planning.md), Phase 5.

### A62 — Time listened counts real listening from the next release *(was Q62)*
**Answered:** 2026-10-11 · **Real time from now on.** The app reports how long a song actually played (after the
scrobble threshold too); plays recorded before that are estimated as a full play of the song. [profile plan](features/profile-and-listening-stats/planning.md), Phase 2.

### A61 — The profile is a new "You" tab *(was Q61)*
**Answered:** 2026-10-11 · **A fourth bottom tab, "You",** next to Library, Search and Settings. [profile plan](features/profile-and-listening-stats/planning.md), Phase 3.

### A59 — What skeleton loading looks like *(was Q59)*
**Answered:** 2026-10-11 · **A slow pulse, web first.** Flat placeholder blocks shaped like the real rows, cover tiles
and headers, pulsing over four beats (1.6 s) and still under reduced motion. Held back 300 ms so fast loads never
flash. Screens: Library (Simple and Full), artists, albums, album and artist detail, playlists, playlist detail,
search and favorites. The owner confirmed favorites stays.
Web is built (`frontend/src/components/Skeleton.tsx`). Android is built too (`ui/common/Skeleton.kt`), on the screens it
has: Library Songs, Albums and Artists, album and artist detail, and search. It has no playlists or favorites yet.

### A60 — Swipe right on a queue row: play less often *(was Q60)*
**Answered:** 2026-10-11 · **Play less often.** Per account (guests can't), stored in `less_often` (migration
`0019`). The row also leaves the current queue, with Undo. Shuffle (`/browse/shuffled`) keeps a marked song in about
one pass in four. Settings → Playback → "Songs you hear less" → Reset clears them all. Swipe left removes. Colours
fixed per action: red remove, blue less often.

### A58 — Swiping the app away: stop the music or keep it? *(was Q58)*
**Answered:** 2026-10-11 · **Make it a user setting.** Settings → Playback → "Keep playing when swiped away", on by
default (the old behaviour, like other music apps). Off: swiping the app away from recents pauses and stops the
service. A friend had expected it to stop and needed force stop. Lives in `PlaybackSettings` and
`PlaybackService.onTaskRemoved`.

### A57 — What should the address bar show when signed out? *(was Q57)*
**Answered:** 2026-10-10 · **Just the domain.** Signed out, `RequireAuth` renders the title screen at `/` itself (any
other path redirects to `/`); account select is `/login`. `/enter` and `/enter/profile` redirect there keeping `?code=`
and `#t=`, so printed guest-code cards and old handoff links still work. New guest-code links are `/login?code=`, new
handoff links `/#t=`.

### A56 — Gapless playback gets built *(was Q10)*
**Answered:** 2026-10-10 · **Yes.** Tracks should play back to back with no gap, which means handling the Opus pre-skip
and the LAME delay/padding at track edges. Not built yet and not scheduled on the roadmap. It needs its own plan
(`.docs/features/<name>/planning.md`), covering the web player and Android separately.
**Plan written 2026-10-11:** [gapless and fades](features/gapless-and-crossfade/planning.md); the owner added fades
to the scope. Answered: A71 to A73.
**Web built 2026-10-11** (CHANGELOG): two elements, preload, gapless join, the three fades and their settings. The join
hasn't been judged by ear yet.
**Android fades built 2026-10-11** (CHANGELOG), with the same settings. Not yet run on a phone: the fades, the crossfade
hand-off and Media3's gapless all wait on a device.

### A55 — The theme follows the profile *(was Q20)*
**Answered:** 2026-10-10 · **Stored per user on the server**, not per browser. This overrides the `localStorage`
assumption that shipped (`frontend/src/lib/theme.ts:25`). Needed a migration (with a
`database-schema.md` update), an endpoint to read and set it, and a first-paint plan so the wrong colours don't flash
while the profile loads (a local cached copy is the likely answer). Guests are user rows too (A13), so each guest
identity keeps its own theme.
**Built 2026-10-11:** migration `0020` (`users.theme`), `PUT /me/theme`, and the sync in `AuthContext`. The browser copy
is kept as the first-paint cache (CHANGELOG 2026-10-11).

### A54 — Bulk hide and delete get a real endpoint *(was Q24)*
**Answered:** 2026-10-10 · **Yes.** Replace the one-request-per-row bulk actions with a real batch endpoint. `/manage`
was folded into the Library (A34), so the code to change is `frontend/src/components/LibraryFull.tsx:226` (hide) and
`:232` (delete), both `Promise.all` over `/tracks/:id`. Built 2026-10-11: `PATCH /tracks` and `POST /tracks/delete` (CHANGELOG
2026-10-11).

### A53 — Selecting a track stays silent *(was Q23)*
**Answered:** 2026-10-10 · **No preview.** Moving the selection plays nothing; `Enter` plays. This is how it shipped,
so nothing changes.

### A52 — The Library gets a stats summary *(was Q25)*
**Answered:** 2026-10-10 · **Yes.** A library-wide summary: total tracks, total size on disk, format breakdown. Not built
yet: no endpoint returns these today (the Control Center shows server health, disk and scan state, not library
totals). `/manage` now lives inside the Library (A34), so that is where it goes. Built 2026-10-11: `GET /library/stats`
and a readout line above the Full view's toolbar (CHANGELOG 2026-10-11).

### A51 — Removing a library root deletes its tracks *(was Q26)*
**Answered:** 2026-10-10 · **Delete the track rows**, not mark them missing. This overrides what shipped:
`deleteLibraryRoot` (`backend/src/db/libraryRoots.ts:53`) detaches the tracks and keeps them. Read as deleting the
*database rows only*, together with their favorites, play history and playlist entries; the music files on disk are
never touched. Built 2026-10-11: `deleteLibraryRoot` deletes each track through `deleteTrackRow`, and the Options
dialog says so (CHANGELOG 2026-10-11).
**Known edge (noted 2026-10-11, not handled):** if two registered roots overlap (one inside the other), a file under
both belongs to whichever root scanned it last (`upsertTrack` overwrites `root_id`). Removing that root deletes the
track even though the other root still holds the file; the other root's next scan adds it back as a new track, without
its favorites or history. Fix if it ever matters: refuse overlapping roots in `POST /library/roots`, or reassign such
tracks to the surviving root instead of deleting them.

### A50 — Very long tracks convert first like the rest *(was Q12)*
**Answered:** 2026-10-10 · **Agreed.** Every track converts on first play, however long. An hour-long mix waits about
37 s the first time; no live `-ss` fallback. The removed path is still in git (`216aaf7^`) if that ever changes.

### A49 — The scan bar shows a count *(was Q28)*
**Answered:** 2026-10-10 · **A moving bar with the number on it**, not an indeterminate one. Already built since the
question was asked: each scanning root reports `scanProgress`, shown as "x of y files" with a bar in the Control
Center (`frontend/src/pages/ControlCenterPage.tsx:120`) and as a status line on the Library
(`frontend/src/pages/LibraryPage.tsx:36`). Nothing left to do.

### A48 — A theme controls colour only *(was Q19)*
**Answered:** 2026-10-10 · **Colour only, for now.** A theme swaps the palette; layout, type, border weights, corner
radii and the backdrop pattern stay the same for every theme. The token layer should still leave room for type and
metrics to join later without touching every component. Matches what shipped with music-select-and-themes
(2026-09-14) and the rule in `DESIGN.md`.

### A47 — A change reaches smol through `./scripts/deploy.sh` *(was Q39)*
**Answered:** 2026-10-10 · **The owner runs `./scripts/deploy.sh` on smol.** First run done on 2026-10-10; the owner
reports the changes went live. That run brought A37 (guest limits) and migration `0017` (A38) to production. How the
script works: `.docs/ops/cloudflare-tunnel-deployment.md`, "Updating to a new version". Still the owner's job, run on
smol; ask before touching it.

### A46 — How should the A–Z rail cover non-Latin titles? *(was Q46)*
**Answered:** 2026-10-10 · **One entry per script the library has.** `getLetterIndex` (`backend/src/db/letterIndex.ts`)
splits the old `…` bucket into `À` (accented Latin), `Ω` (Greek), `Я` (Cyrillic), `あ` (hiragana), `ア` (katakana),
`漢` (CJK) and `한` (Hangul), with `…` for any other run above "z". `#` and A–Z always show; the rest only when
non-empty. Not done: splitting kana by row or Hangul by first consonant (both possible later the same way), and sorting
kanji by reading (needs a reading per title and a migration).

### A45 — What colour is text on the accent? *(was Q45)*
**Answered:** 2026-10-10 · **Shift it.** Text on an accent fill is now `--color-on-accent` (the theme's `blue-950`)
instead of white, and the default theme's `orange-600` is 2.9 lightness points lighter so dark text clears 4.5:1 there
too (4.10 → 4.6). Error text on cards moved from `red-400` to `red-300` (5.4:1 or better in every theme). Recorded in
[`DESIGN.md`](../DESIGN.md) under Palette.

### A44 — Publish the APK on GitHub, built and signed automatically *(was Q44)*
**Answered:** 2026-10-10 · **Automatic.** A real release keystore, kept out of the repo (held locally and as GitHub
Actions secrets), and a workflow that builds, signs and attaches the APK to a GitHub Release on each version tag.
Per-guest codes should be on before the first public APK, since anyone who installs it can press Guest.

### A43 — Per-guest codes: one use, 7 days, door toggled on the panel *(was Q42)*
**Answered:** 2026-10-10 · **Both recommended options.** A code lets one device in once, and expires unused after
7 days. Whether the guest door needs a code at all is an admin toggle on the same web panel, stored in the database,
**default off** (LAN posture unchanged). `ENTRY_CODE` keeps working as a shared code alongside.
**Superseded in part 2026-10-11 by [A69](#a69--a-guest-code-works-on-any-device-and-every-sign-in-is-logged):** a used code is reusable.

### A42 — The guest-code panel shows random per-guest codes, as text and QR *(was unnumbered, 2026-10-10)*
**Answered:** 2026-10-10 · Asked in chat without an ID (a ledger slip, corrected here). An admin-only "Guest access"
card on the web `/users` page. **Show, don't edit** the server setting, but codes are **random per guest**, not one
shared `ENTRY_CODE`. Sharing is **both**: copy as text, and download an image with a QR code (link with the code
filled in) and the code printed under it. Details settled in [A43](#a43--per-guest-codes-one-use-7-days-door-toggled-on-the-panel).

### A41 — Android gets a guest button after all *(was Q41)*
**Answered:** 2026-10-10 · **Yes.** Reverses [A29](#a29--should-android-support-guest-entry). The Android title
screen gets two buttons, **Log in** (the form) and **Guest** (an entry-code form, skipped when no code is needed).
Guests on Android get the listen-only cut of [A37](#a37--guests-are-listen-only-what-do-they-keep).

### A38 — Delete guests' existing playlists and favorites? *(was Q38)*
**Answered:** 2026-10-10 · **Yes, delete them.** Done as migration `0017_delete_guest_playlists_and_favorites.sql`
rather than a hand-run command on smol: it ran at the first deploy ([A47](#a47--a-change-reaches-smol-through-scriptsdeploysh-was-q39)),
in one transaction, and is tested (`backend/src/db/guestDataCleanup.test.ts`). Guests keep their identity and resume
position. See CHANGELOG 2026-10-10.

### A40 — Should the Stop hook see edits made from the shell? *(was Q40)*
**Answered:** 2026-10-10 · **Yes.** `.claude/hooks/stop-check.mjs` now adds the working tree's changed and untracked
files (`git status`) to the Edit/Write list. Checked by hand: the old version passed a shell-written migration with no
CHANGELOG entry, the new one flags it. See CHANGELOG 2026-10-10.

### A37 — Guests are listen-only: what do they keep? *(was Q37)*
**Answered:** 2026-10-09 · Guests browse (songs, albums, artists, genres once they exist), search, stream, and keep
**resume where they left off**. **No** playlists, favorites, play counting or history, or top tracks. Settings are
limited to player design and appearance. Overrides [A13](#a13--one-guest-identity-per-device-not-a-shared-house-account)'s
per-guest favorites. Plan: [`.docs/features/guest-listen-only/planning.md`](features/guest-listen-only/planning.md).
Nothing built yet.

### A29 — Should Android support guest entry? *(was Q29)*
**Superseded 2026-10-10 by [A41](#a41--android-gets-a-guest-button-after-all).**
**Answered:** 2026-10-09 · **No, login only.** The stated assumption stands: Android is for real accounts, guests
use the web app.

### A35 — What is the design reference, and what should the app feel like? *(was Q35)*
**Answered:** 2026-10-09 · **References:** beatmania IIDX, Sound Voltex, osu!, DJMAX Respect, maimai, CHUNITHM.
**Mood:** a machine offering you things; flat and solid; loud backdrop, legible text. **Never:** a generic SaaS
dashboard, glassy / neon-glow surfaces, and no other hard bans. Asked so UI work has written direction instead of an
agent inventing one. Landed in the root [`DESIGN.md`](../DESIGN.md).

### A36 — Does Android carry the web identity, or follow the wallpaper? *(was Q36)*
**Answered:** 2026-10-09 · **Same brand as the web.** Recorded in [`DESIGN.md`](../DESIGN.md) as the target. Android
still defaults to Material dynamic colour and the system font (`ui/theme/Theme.kt:51`, `Type.kt:10`), noted there as a
known gap; no Android code changed.

### A34 — Fold `/manage` into the Library as a Simple / Full toggle, visible to every user? *(was Q34)*
**Answered:** 2026-09-28 · **Yes, default Simple.** The Library page now has a Simple (arcade select) / Full (album-grouped
table, styled after the owner's AIMP screenshot) toggle, remembered per device; `/manage` redirects to `/?view=full`. Full is
read-only for non-admins and hidden tracks stay hidden from them — enforced server-side (`GET /tracks` clamps `hidden` to
`exclude` for non-admins; it did not before, which the question had flagged as unchecked). See CHANGELOG 2026-09-28.

### A22 — Home dashboard, playlists and genre on Android: in what order? *(was Q31)*
**Answered:** 2026-09-28 · **Recommended order accepted** ("proceed").

1. **Playback first** — Android Phase 2 (roadmap box 17). Nothing else on the
   list means much while tapping a track does nothing.
2. **Home + playlists together** — both are surfacing work over endpoints that
   already exist (playlists CRUD, `dateAdded`, `GET /me/history`,
   `GET /stats/top-tracks`), and Home's "quick listen" needs playback.
3. **Genre last**, as its own backend-then-Android piece: it does not exist in
   the backend at all (no column, no scanner extraction, no endpoint), so it
   needs a migration, a scanner change and a re-scan before Android has
   anything to show.

Landed: this ordering, in `.docs/features/android-phase-1-browse/planning.md`
(Phase 1 stays browse + search only). Nothing for 2 or 3 is built.

### A31 — Should project instructions live in a repo-root CLAUDE.md? *(was Q31)*
**Answered:** 2026-09-28 · **Yes.** A short root [`CLAUDE.md`](../CLAUDE.md) (hard rules, verify-don't-recall rules,
token rules, definition of done, pointers) now auto-loads each session; `.docs/CLAUDE.md` stays as the long-form reference.
Landed with hooks in `.claude/hooks/` (bash guard, Stop-time type-check and doc check).

### A32 — May STATUS.md be split into a short live file and an archive? *(was Q32)*
**Answered:** 2026-09-28 · **Yes.** The full old file is frozen verbatim in
[`history/status-archive.md`](history/status-archive.md); `STATUS.md` is now a one-page snapshot (target under 150 lines).
README's per-endpoint link now points at the archive. `AGENTS.md` and `.docs/ANTIGRAVITY.md` were reworded so "update
STATUS.md on completion" means the table row / Next list only, with detail going to the CHANGELOG.

### A33 — How should the harness treat gortex for this repo? *(was Q33)*
**Answered:** 2026-09-28 · **Make the global rule conditional** (option b). `~/.claude/CLAUDE.md` now says the gortex
"MUST use" tables apply only when the `mcp__gortex__*` tools are actually connected; otherwise use Grep/Read/Edit normally.
The repo was not tracked in gortex.


### A20 — Which OS for the server? *(was Q3)*
**Answered:** 2026-09-16 · **Arch Linux**, running on a friend's existing
gaming PC — not the dedicated home-server build `.docs/ops/infrastructure.md`
originally described.

The whole deployment target changed, not just the OS: instead of building out
the planned home server hardware, the app deploys on a friend's already-running
Arch Linux box, staying on 24/7, reached over the internet via a Cloudflare
Tunnel ([A21](#a21--is-the-home-network-behind-cgnat-was-q1)). Docker still
isolates the app from the OS choice as designed — this only changes where
`docker compose up -d` runs, not the app itself. Full walkthrough:
`.docs/ops/cloudflare-tunnel-deployment.md`. The server-hardware section of
`.docs/ops/infrastructure.md` now describes a build that isn't the current
plan; the friend's machine's actual specs aren't documented yet.

### A21 — Is the home network behind CGNAT? *(was Q1)*
**Answered:** 2026-09-16 · **Doesn't matter — the question is moot.** Decided
on a **Cloudflare Tunnel** (outbound-only `cloudflared` connection to
Cloudflare's edge) instead of port-forwarding. A tunnel needs no inbound port
at all, so it works identically whether or not the network is behind CGNAT —
box 13 no longer needs this fact to move forward.

Domain (`nobrainmusic.my`) is already on Cloudflare DNS (confirmed Active,
free plan). Paired with a **Cloudflare Access** application in front of the
tunnel's public hostname (email-allowlist login gate) as defense-in-depth,
since this app's own auth was designed for a LAN and is now permanently
internet-facing. Full walkthrough: `.docs/ops/cloudflare-tunnel-deployment.md`.

### A19 — A phone stacks the strip above the detail *(was Q22)*
**Answered:** 2026-09-11, by what shipped · **Simple stacking**, not my own
recommendation. I had recommended a slide-up sheet; the phase went a plainer
route instead, and it is worth being honest that this is a downgrade in
ambition rather than a considered alternative.

On mobile (below `lg`), the grid collapses to one column and CSS `order`
puts the strip first, the detail panel second — you scroll to it rather than
it sliding over the strip. The strip keeps its own fixed height
(`min(34rem, calc(100svh - 19rem))`), so it still reads as "the thing you are
scrolling," and the detail panel is reached the ordinary way, by scrolling the
page.

Why not the sheet as planned: it is a second overlay system (on top of the
numpad, Options panel and interstitial already in the app), and building it
well — a drag handle, a dismiss gesture, focus trapping — was more than this
phase's scope justified before anyone has used the plain version. If stacking
reads as flat once there is a phone to actually test it on, the sheet is still
the next move, and nothing here forecloses it.

**Verified:** 390px shows the strip on top with no sideways scroll
(`scrollWidth` 375 vs a 390 viewport), the detail panel is reachable by
scrolling, and no console errors.

### A17 — The top bar overflows, and floats *(was Q18)*
**Answered:** 2026-09-11 · **Overflow menu.** Owner's choice, over a scrolling
rail, icon-only tabs and a bottom bar.

Asked in the same breath: **make the bar floating and slightly bigger, like a
game UI bar.** Both land together, because they are the same row and doing them
separately would mean laying it out twice.

What the overflow actually had to be, once measured: a five-tab bar does not fit
390px either — five tabs alone are ~375px before the wordmark, the search and
any buttons. So the collapse is staged rather than single-step. Below `md` every
tab goes into the menu and the brand shrinks to its mark; at `md` the primary
tabs come back with Upload / Users / Health staying behind **More**; at `lg` the
search input and the account name return.

The right-hand side got smaller rather than larger: **This device**, **Log out**
and **Data saver** all moved *into* Options, leaving only Options and Exit on the
bar. Data saver gained something in the move — it lived in the player bar, which
only renders while something is playing, so the control was unreachable exactly
when you wanted to set it before pressing play.

### A18 — The arcade select replaces the table *(was Q21)*
**Answered:** 2026-09-11 · **Replace it.** Owner's choice, over my
recommendation of a view toggle. Sorting, filtering and the rest are to be
planned in a later session.

**The consequence, recorded so it is not discovered later:** the table carries
sort, four filters, the search box, per-row flags, and — for an admin —
checkbox multi-select with bulk hide / recommend / delete. The arcade layout has
nowhere to put those, and they are not features that can wait in a drawer
somewhere unnamed.

**Confirmed 2026-09-11:** the table stays, on the admin page; `/` shows the
arcade selection UI. So no capability is lost — sort, filter, the flags and the
bulk actions all keep working where an admin already is, and the listening
surface is free to be as sparse as the reference. The later session designs what
the arcade view needs of its own rather than first rebuilding what was thrown
away.

Decided. Do not re-open without an explicit ask.

### A13 — One guest identity per device, not a shared house account *(was Q14)*
**Answered:** 2026-09-11 · **Per device.** Owner's words: *"instead of sharing
account, something similar like an anonymous user with a different session
token."*

Each browser mints its own `users` row (`kind = 'guest'`) and its own token. Two
people never share a favorites list, a queue, or a resume position — the thing a
shared house account would have broken the moment both of you pressed play.

**The cost, stated plainly:** `playback_state` is one row per user
([A9](#a9--resume-position--cross-device-playback-state)), so your phone is a
different listener from your desktop and will not resume what the desktop
paused. Box 25's done-when stops being true on the day this ships.

**The fix that comes with it, and the assumption being built on:** a **handoff
link** — a QR/link on the title screen that hands *this* device's token to
another one, which then adopts it via `/enter#t=<token>`. One endpoint, one
URL-fragment branch. It was part of the recommendation this answer accepted, so
it ships in the same work rather than being deferred; say so if you would rather
let cross-device resume lapse and save the hour.

### A14 — The admin login stays, unadvertised *(was Q15)*
**Answered:** 2026-09-11 · **Keep the login page, hidden.**

`/login` keeps working exactly as it does today and simply stops being linked
from anywhere. `imran` (id 13) keeps its password, its admin flag, its five
plays and its resume row. `/tracks/upload`, `/library/scan`, `/users` and track
deletion stay behind the same `requireAdmin` gate they are behind now.

**One thing to be honest about:** the hidden *path* is not the protection — the
password is. Someone who guesses `/login` still cannot get in. Treat the
hiddenness as tidiness (guests never see a door they cannot open), not as a
security control.

**Mechanism settled 2026-09-11, at the owner's suggestion:** tap the logo
repeatedly and a **numpad** appears; the code typed into it is checked by the
server, not by the browser.

That last clause is the whole design. The obvious version — a code compared in
React — ships the secret to every guest's browser inside the JS bundle, and
hiding a route in a single-page app hides nothing at all: the route table is in
that same bundle, and `POST /auth/login` is a public HTTP endpoint that a
`curl` reaches whatever the UI does or does not draw.

So the code is a **server-side gate on logging in**, not a client-side reveal:

- `POST /auth/unlock` takes the numpad code and returns a short-lived ticket —
  a JWT with `scope: 'unlock'`. No ticket is ever minted in the browser.
- `/login` renders the form only when a ticket is held; typed directly without
  one, it bounces to the title screen. This part *is* only tidiness, and is
  labelled as such.
- **`POST /auth/login` refuses without the ticket** whenever `ADMIN_ENTRY_CODE`
  is set. This is the part with teeth: the right username and the right password
  and no code is a `401`, over `curl` as much as in the browser.
- The existing scope rules need no change to stay safe — `verifySessionToken`
  rejects *any* scoped token and `verifyMediaToken` demands `media`, so an
  unlock ticket already cannot buy API access or stream a file.

**Costs, stated rather than discovered later:** a second secret you must not
lose (it lives in `backend/.env` beside `JWT_SECRET`, and unsetting it degrades
to exactly today's behaviour, so it is recoverable); a numeric code is weak on
its own, which is why it gates a password rather than replacing one, and why
`/auth/unlock` shares the guest endpoint's rate limit; and **the Android client
will need a code field** on its login screen once this is set, since the rule is
server-side and does not care which client is asking (roadmap box 15).

### A15 — The entry-code hook ships now, unset *(was Q16)*
**Answered:** 2026-09-11 · **The recommended option.**

`ENTRY_CODE` is read at boot. **Unset — the default, and what the LAN runs —
the guest door is simply open.** Set to anything, and `POST /auth/guest`
requires that code in its body; the title screen asks for it once per device and
never again, because the minted token persists.

This is not the real gate. The real gate for box 13 is at the network edge
(Tailscale/WireGuard, or a tunnel with its own auth), and the two compose. The
code exists so that exposing the server is a config change rather than a
redesign of the front door.

**Box 13's done-when has been rewritten** in
`.docs/process/development-roadmap.md` — it read *"an anonymous visitor cannot
create an account"*, which this feature deliberately contradicts. It now names
the gate instead of the mechanism. Accepted context for the whole decision:
only people the owner has actually let onto the network reach this server.

### A16 — `/signup` goes, and open registration closes *(was Q17)*
**Answered:** 2026-09-11 · **Yes.** `SignupPage`, the `/signup` route and the
`registration-status` query are deleted; `ALLOW_OPEN_REGISTRATION` defaults to
`false`, so `POST /auth/register` is admin-only again (still allowed when the
users table is empty, or there is no way to make a first admin).

**This does not close [Q2](#q2--when-does-open-registration-get-turned-off).**
It closes the half Q2 was literally about — the boot warning goes quiet, and no
stranger can mint an *account*. The half Q2 actually cared about, a stranger
reaching the library at all, moves to
[A15](#a15--the-entry-code-hook-ships-now-unset) and to box 13. Q2 stays open
until box 13 names its gate and that gate is running.

### A10 — Should the track title be uppercased? *(was Q7)*
**Answered:** 2026-09-10 · **No — leave the casing alone**

The source mockup specified Barlow Condensed 900 uppercase. It stays dropped.
`text-transform` does nothing to CJK and would flatten only the Latin half of a
mixed-script title — `WORTH LIVING ~ FROM 智代アフター` — so following the
mockup would make a third of this library look inconsistent rather than styled.
No code change; this confirms what already ships.

---

### A11 — Should the play FAB keep overlapping the scrubber? *(was Q8)*
**Answered:** 2026-09-10 · **Move it into the transport row — and it already is**

The decision is to keep the scrubber clear. Checking before changing anything
found the question had outlived its premise: the phone view was rebuilt in
`b8ca47b` and the FAB moved into the transport row then, but this ledger was
never updated. Verified rather than assumed, 2026-09-10 at 390x844: the seek
control ends at y=623 and the play button starts at y=663, a **40px gap**, and a
tap at the scrubber's dead centre seeks to 87.2s of a 172s track — the exact
behaviour the question worried was being swallowed.

No code change. The lesson is about the ledger, not the UI: a question can go
stale because the code moved under it, so re-check the premise before acting on
an answer to an old one.

---

### A12 — Should the 64k Opus recipe switch to constrained VBR? *(was Q13)*
**Answered:** 2026-09-10 · **Yes — done**

libopus read `-b:a 64k` as a VBR target and ran 16% over it. `-vbr constrained`
holds the number. Measured through `encodeToFile`, the app's own path, on the
same source: **1,597,894 bytes / 74.3 kbps → 1,395,366 bytes / 64.9 kbps**, a
12.7% saving on top of data saver's own. The player's readout now says
`OPUS · 65k` where it said `OPUS · 74k`.

The variant id went `opus64` → `opus64c` in the same change, because the id *is*
the cache key: leaving it alone would have left every existing entry serving the
old encode with nothing to distinguish them. Old `opus64-*` files are never
requested again and age out through ordinary LRU eviction.

**What this exposed:** with every entry suddenly cold, the mid-track quality
swap turned out to spend **5.7 s in silence** waiting for the encode — the old
copy was still playing and perfectly good the whole time. Fixed in the same
commit by warming the converted copy before touching the audio element, which
takes the silence to ~0.3 s (a single `<audio>` element cannot swap sources
gaplessly). Not a regression from this change; a pre-existing defect it made
visible.

---

### A9 — Resume position / cross-device playback state *(was Q9)*
**Answered:** 2026-09-10 · **By default, not by decision** — see the caveat below

Roadmap box 25, built 2026-09-10. The four decisions Q9 was expanded into were
each taken at their recommended default, because the box was picked to be built
before the question came back:

1. **Queue as well as position** — position alone means the phone resumes the
   song and forgets what was meant to follow it.
2. **Write every 10 s while playing, on pause, on track change, and on
   `visibilitychange`** — not `beforeunload`, which does not fire reliably on a
   phone, the one place a backgrounded tab actually gets killed.
3. **One row per user, last write wins** — enforced by making `user_id` the
   primary key rather than by remembering a rule.
4. **Restores paused, does not auto-play** — browsers block autoplay without a
   user gesture, so resume-and-play would silently do nothing on a phone.

**Number 4 on Android — decided 2026-09-28: a setting.** A native client has no autoplay
restriction, so it can resume playing; the owner chose a **Settings toggle** ("Auto-play on resume"), default **off**
(restore paused, as on the web). Client-side only, no stored server state. Built in Android Phase 2, see
`features/android-phase-2-playback/planning.md`.

Landed: `0011_create_playback_state.sql`, `backend/src/db/playbackState.ts`,
`backend/src/routes/playbackState.ts`, and the save/restore effects in
`frontend/src/components/PlayerBar.tsx`.

### A1 — Is iOS/Safari a target?
**Answered:** 2026-09-10 · **No.** Chrome, Android and desktop only. This is why
the all-`.opus` library and its Ogg-container problem is *not* urgent despite
Safari being unable to decode it. Revisit only if an iPhone enters the picture.

### A2 — Disk-cached transcodes, or streaming `-ss` offsets?
**Answered:** 2026-09-10 · **Both**, at the time. Content-addressed disk cache
(like `artworkPath`) *and* streaming `-ss` offsets. Landed: `f3bd28d` built the
`-ss` half.

**Superseded the same day by [A5](#a5--cold-cache-strategy-and-cache-sizing-for-box-24).**
Encode-to-cache-first means the data-saver path always serves a finished file,
so seeking is an ordinary byte range and the `-ss` offset had no caller. It was
removed in `216aaf7` (116 lines) rather than left as an unreachable branch. The
"both" answer was not wrong when given — it was made obsolete by a measurement
taken after it. Git keeps the removed path; [A50](#a50--very-long-tracks-convert-first-like-the-rest-was-q12) decided it isn't
needed.

### A3 — Where is ReplayGain applied?
**Answered:** 2026-09-10 · **Client-side only.** The server stores and ships the
gain number; the client applies it with a `GainNode`. No server-side gain during
transcode — it's irreversible and costs CPU.

### A4 — Serve raw `.aac`, or remux it?
**Answered:** 2026-09-10 · **Always remux to `.m4a`.** Confirmed by measurement:
a 25-second raw ADTS file reports 25.0s to frame-scanning but 37.9s to both
ffprobe and Chrome, so serving it raw ships a seek bar that lies and makes
valid-looking `?t=` requests `400`. Remuxing is a container change, not a
re-encode. Landed: `.docs/features/formats-and-transcoding/planning.md` Phase 1.

### A5 — Cold-cache strategy and cache sizing for box 24?
**Answered:** 2026-09-10 · **Encode-to-cache-first, 2 GB, evict on write.**
Landed: `81512be` recorded the decision, `216aaf7` implemented it — measured
0.88s cold, 0.027s warm, 3.32 MB to 0.24 MB on a 25-second FLAC.

### A6 — Is feature prioritisation still open?
**Answered:** 2026-09-09 · **No.** `.docs/process/development-roadmap.md` is the
ordering authority; `.docs/features/feature-brainstorm.md` is an unranked idea
pool, not a list.

### A7 — Is the Now Playing waveform real, or decorative? *(was Q6)*
**Answered:** 2026-09-10 · **It is real.** The Q6 entry was stale — it came from
a note written on 2026-09-09 *before* the waveform work landed later the same
day.

Verified by reading the whole path and by measurement:
- `GET /tracks/:id/waveform` (`backend/src/routes/tracks.ts:381`) computes peaks
  from the file with ffmpeg on first request and caches them on the row
  (migration `0009`), returning `null`→`404` only when the track is gone, has no
  usable duration, or won't decode.
- `NowPlaying.tsx:112` queries it with `staleTime: Infinity`, and
  `barsFromPeaks` takes the **loudest** sample per span rather than the average.
- `placeholderHeights(current.id)` — the hash — is only the fallback for the
  first decode and for a `404`.
- Decoding a real library track outside the app, exactly as `computePeaks` does,
  produced 127 of 128 non-zero buckets fading to silence at the end. Sample
  count matched the stored duration to within one sample.

**One real gap, not a design question:** `waveform` is populated on **0 of 19**
tracks, and was 0 of 30 before the missing-track cleanup too. `NowPlaying` is
mounted only when the mobile sheet is open (`PlayerBar.tsx:570`) and is
`md:hidden`, so the query has never fired in a desktop session — the feature
works but has never actually been exercised against this library. It will
populate on first open on a phone. This is what turned up [Q11](#q11--should-waveform-peaks-be-normalised-per-track).

### A8 — Should waveform peaks be normalised per track? *(was Q11)*
**Answered:** 2026-09-10 · **Normalise with a floor.** Owner's choice, over
leaving it absolute (mostly draws a thin strip) and over normalising fully (a
whisper and a wall of noise would draw identically).

Each track is scaled to its own loudest bar, capped by a ceiling that rises with
how loud the track actually is — `QUIET_TRACK_CEILING + (1 - QUIET_TRACK_CEILING)
* loudest`, floor `0.55`. A full-scale track may fill the height; a near-silent
one may not climb past 0.55, so quiet still reads as quiet. The measured track
goes from 31% to 69% of the scrubber's height; a track a quarter as loud reaches
58%.

**Stored peaks stay absolute** — this is a decision about drawing, not about
data, so it lives at the point of drawing and needs no migration or re-decode.

Landed: `barsFromPeaks` in `frontend/src/components/NowPlaying.tsx`, logged in
`.docs/CHANGELOG.md` and `.docs/FUNCTIONLOG.md`. Verified against the real
measured peaks (0.06–0.691, fade to silence preserved), a full-scale signal
(1.0 flat), and an all-silent track (0.06 flat, no divide-by-zero).
`tsc --noEmit` clean. **Not yet seen on a real phone** — see A7; the cache is
still empty until Now Playing is opened on one.
