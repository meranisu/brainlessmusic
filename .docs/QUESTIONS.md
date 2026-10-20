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

### A233 — Album art cache (Android)
**Answered:** 2026-10-20, in chat. Android only; same limit choices as the song cache; its own clear button, apart from the song cache. Built in `downloads/CoverCache.kt` (500 MB default, my call), uncommitted.

### A232 — Pick up new files: 15-minute scans, not a file watcher
**Answered:** 2026-10-20, in chat. Scan every 15 minutes (default `LIBRARY_SCAN_INTERVAL_HOURS=0.25`, due check every 5 min), set in code, not on smol. Watcher parked; revisit only if 15 minutes feels slow. c222f4b.

### A231 — Push the 2026-10-20 perf commits
**Answered:** 2026-10-20, in chat. Wait. e612988..c222f4b stay local until the owner says push (push deploys to smol and runs 0041).

### A230 — Listening patterns: own only (was Q219)
**Answered:** 2026-10-20, in chat. Own only. `/me/stats/patterns` sits behind `requireAccount`; profiles don't show patterns. [stats dashboard](features/stats-dashboard/planning.md).

### A229 — All-time trend chart (was Q218)
**Answered:** 2026-10-20, in chat. Weekly bars for All time; daily for week, month and year. [stats dashboard](features/stats-dashboard/planning.md).

### A228 — Android Stats placement (was Q217)
**Answered:** 2026-10-20, in chat. A separate Stats screen, opened from the Home stats card. Home stays as it is. [stats dashboard](features/stats-dashboard/planning.md).

### A227 — Web Stats page in the nav (was Q216)
**Answered:** 2026-10-20, in chat. Overflow menu, not a primary tab. [stats dashboard](features/stats-dashboard/planning.md).

### A226 — Delete the leftover benchmark folder? (was Q215)
**Answered:** 2026-10-20, in chat. Yes. `/tmp/brainlessmusic-scale-bench-p39nNJ` (645 MB, synthetic files only) deleted.

### A225 — Commit response compression alone or with the scan work? (was Q214)
**Answered:** 2026-10-20, in chat. One commit for all of it: incremental scan, scale benchmark, response compression and
the thumbnail cap. Do not commit yet; more performance work goes in first.

### A224 — Does an mtime-only change reread tags? (was Q213)
**Answered:** 2026-10-20, in chat. Yes: any change to size or modified time rereads the file. Built that way in the
incremental scan ([incremental-scan](features/incremental-scan/planning.md)).

### A223 — Full rescan button on the web (was Q212)
**Answered:** 2026-10-20, in chat. Yes, on the web admin page. Built: a "Full rescan" button beside each folder's
"Rescan" in Options → Library folders, calling `POST /library/roots/:id/scan?full=1`. Browser-checked on a throwaway
3-song library, desktop and phone width.

### A222 — Desktop Now Playing view: tabs, background, queue editing (was Q211) *(asked in chat)*
**Answered:** 2026-10-18, in chat. Tabs: Up next and Related (more from the album, other albums by the artist, from data the
app already has). Lyrics later, as its own feature. Background: a flat wash of the cover's colour mixed into the theme ground,
no blur. Queue: jump to a song and remove one; no drag to reorder. Plan: [desktop-now-playing](features/desktop-now-playing/planning.md).
Built, browser-checked on a copy of the dev DB, not on a real library.

### A221 — Motion pass follow-ups (was Q210) *(asked in chat)*
**Answered:** 2026-10-18, in chat. Phone Now Playing also closes on swipe down. Desktop gets its own Now Playing view (A222).
The login button reads "Back". The album card hover lift is fine. The phone sheet gets remove and Related too (YouTube Music's phone app has both: Up next, Lyrics and Related tabs, and Remove from queue in a song's menu).

### A220 — Now Playing top bar: where sleep, data saver, like and add go (was Q209) *(asked in chat)*
**Answered:** 2026-10-18, in chat. The top bar was crowded (5 buttons). Decided: like and add to playlist sit on the song's
header (most used); sleep timer and data saver become buttons in the info readout under the controls, each showing its state
(sleep shows "12m" or "End", data saver lights up); only Listen together stays in the top bar. Web follows: add to playlist
pill next to like, data saver chip beside the format chips. Web has no sleep timer and gets none (confirmed: sleep is
Android only). The sleep chip shows as a plain moon when the timer is off (confirmed). Built, not phone-tested.

### A219 — Download queue management: per-song pause, space per group, Wi-Fi only (was Q208) *(asked in chat)*
**Answered:** 2026-10-18, in chat: "a b and d" (not c, priority). Cancel asks first. A song in two groups counts in both
groups' sizes. (d) is an opt-in switch, off by default, so A85 (any network) still holds unless it is turned on. Android
only, no backend change. Plan: [features/download-queue](features/download-queue/planning.md). Built, not phone-tested.

### A218 — Smart pre-caching on Android: how far ahead, which network, current song (was Q207) *(asked in chat)*
**Answered:** 2026-10-18. Fetch ahead defaults to 3 songs after the playing one, with a Settings choice of Off, 1, 3, 5
or 10. Any network, like downloads (A85), no Wi-Fi-only rule. The playing song is finished first, then the next ones.
Songs go into the song cache (A198), as the copy the player will ask for (data saver gives the low copy). Not in rooms.
Built in `android/.../downloads/Precacher.kt`, wired in `PlaybackController.updatePrecache()`. Uncommitted, not phone-tested.

### A217 — Browsing and adding library folders is confined to an allowlist (was Q206) *(asked in chat)*
**Answered:** 2026-10-18. Option C: confine `GET /library/browse` and `POST /library/roots` to `BROWSE_ROOTS`
(default: `LIBRARY_PATH` and `/mnt`, the two mounts in `docker-compose.yml`); a path outside it gets 403, symlinks are
followed before the check. `PlaybackService.onConnect` stays open: an allowlist could silently break Bluetooth, lock
screen, Android Auto and watch controls for little gain. Built in `backend/src/utils/paths.ts` (`isAllowedBrowsePath`),
`backend/src/routes/library.ts`, `backend/src/config.ts`. Uncommitted.

### A216 — Passcodes lock after 10 wrong tries and must be 6+ digits (was Q175) *(asked in chat)*
**Answered:** 2026-10-18. Option C, both: lock passcode sign-in after 10 wrong passcodes until the next password
sign-in, and require 6 or more digits. Every existing passcode is cleared by migration `0040` (the owner chose that over
rejecting short ones at login). A locked account says "Passcode locked, sign in with your password." (owner's pick, so
it does reveal the account exists). No Android release tag yet; it goes with other fixes. Built as
`passcode_failures` in `backend/src/routes/auth.ts` and `backend/src/db/users.ts`; S3 in
[process/security-audit-2026-10-13.md](process/security-audit-2026-10-13.md). Uncommitted.

### A215 — Play on the web library keeps the queue going to the end of the library (was Q205) *(asked in chat)*
**Answered:** 2026-10-18. Option D: Play queues the pages around the song (200 songs a page, one before, two after),
then adds the next page whenever 20 songs or fewer remain, until the library ends. Not built: wrapping back to the start
at the very end, and a "Still listening?" prompt (the owner said yes to D without asking for either). Built as the
`loadMore` argument of `playQueue` (`frontend/src/components/PlayerBar.tsx`) and its use in `LibraryPage.tsx`; the saved
resume queue is sent as a window once it passes the server's 5000-song cap.

### A214 — Sign out ends sessions on the server (was Q202) *(asked in chat)*
**Answered:** 2026-10-18. Option B: "log out everywhere" bumps the user's `session_version`, which ends every token signed
before it (other devices and handoff links). Making a handoff link does the same first and keeps the web browser signed
in on a fresh token. Plain log out stays local. Built as `POST /auth/sessions/revoke` (guests allowed, since handoff
needs it), a "Log out everywhere" button in web Options and Android Settings (accounts only), and a "Make link" step in
the web handoff dialog. Not done: a per-device revoke (option A).

### A213 — Missing songs stay in the web library list *(asked in chat)*
**Answered:** 2026-10-18. The web library list keeps showing songs whose files are missing, and the letter positions get a
`missing=all` option so they match that list. Android keeps hiding them. Built in
[features/library-letter-jump](features/library-letter-jump/planning.md).

### A212 — The web library loads only what is on screen *(asked in chat)*
**Answered:** 2026-10-18. The web library knows its full length from the server and loads just the pages around the cursor,
like Android, so a letter on the rail can be jumped to without loading everything before it. Built in
[features/library-letter-jump](features/library-letter-jump/planning.md).

### A211 — Disliked songs stay out of smart playlists unless a rule asks *(was Q204)*
**Answered:** 2026-10-18. Option A: a disliked song is always left out, unless a rule explicitly asks about
`disliked`. Hidden and missing songs are left out either way. Built in `evaluateRules`
(`backend/src/db/smartPlaylists.ts`), see [features/smart-playlists](features/smart-playlists/planning.md).

### A210 — Smart playlists are private only *(was Q203)*
**Answered:** 2026-10-18. Option A: making one public is refused (400). "Save as playlist" makes an ordinary copy
that can be shared. Revisit only if friends ask. Built in `PATCH /playlists/:id` (`backend/src/routes/playlists.ts`)
and the web and Android pages, see [features/smart-playlists](features/smart-playlists/planning.md).

### A209 — Which apps get smart playlists first *(asked in chat)*
**Answered:** 2026-10-18. Backend, web and Android in the same round. Planned in
[features/smart-playlists](features/smart-playlists/planning.md).

### A208 — Whose plays smart playlist rules count *(asked in chat)*
**Answered:** 2026-10-18. The viewer's own plays, from `play_history` (skips excluded). Not the shared
`tracks.play_count`, so a friend's listening never changes your mixes.

### A207 — How people make smart playlists *(asked in chat)*
**Answered:** 2026-10-18. A rule builder anyone can use (rules, match all or any, sort, limit), not fixed presets.
Saved like a playlist and refilled each time it is opened. Planned in
[features/smart-playlists](features/smart-playlists/planning.md).

### A206 — What the sleep timer does in a Listen together room *(asked in chat)*
**Answered:** 2026-10-18. At zero this phone leaves the room and pauses; the room keeps playing for everyone else.
"End of current song" becomes a countdown to the song's end while in a room. Built in
[features/sleep-timer](features/sleep-timer/planning.md).

### A205 — What the sleep timer does at zero *(asked in chat)*
**Answered:** 2026-10-18. Fade out over 10 seconds, then pause. The queue stays, so Play resumes it.

### A204 — Where the sleep timer lives and what it offers *(asked in chat)*
**Answered:** 2026-10-18. Android only. Choices: 15, 30, 45, 60, 90 minutes and "End of current song".

### A203 — Which actions a headset press can trigger *(was Q201)*
**Answered:** 2026-10-18. Play/pause, next, previous, seek forward 10 s, seek back 10 s, plus "Do nothing". No favorite and
no shuffle toggle. Built in [features/headset-buttons](features/headset-buttons/planning.md).

### A202 — Does a single headset press work on Android today? *(was Q200)*
**Answered:** 2026-10-18. No, nothing happens, so the plan starts by finding why before adding the options.

### A201 — Reserve account display names and usernames *(was Q177)*
**Answered:** 2026-10-15, picked A. Refuse a display name that matches another account's display name or username,
ignoring case. Guests may still share display names with other guests. The validation is not yet implemented.

### A200 — Protect `main` while keeping direct pushes *(was Q176)*
**Answered:** 2026-10-15, picked A. Require CI to pass, prevent force-pushes and branch deletion, and continue
allowing direct pushes. The GitHub branch-protection setting is not yet confirmed as applied.

### A199 — Cached songs play offline, with a "Cached" list under Downloads *(was Q199)*
**Answered:** 2026-10-14, picked A. A fully cached song plays offline wherever it already appears, and Downloads gets a
"Cached" list.

### A198 — Cache sizes: 500 MB, 1 GB (default), 2 GB, 5 GB, Unlimited, with Clear cache *(was Q198)*
**Answered:** 2026-10-14, picked A. Settings shows the space used and a "Clear cache" button. Unlimited still empties
if Android runs short of space or the user clears the app's cache. Downloads stay separate and are never evicted.

### A197 — Commit the background fixes, then release them with the equalizer *(asked in chat, logged late)*
**Answered:** 2026-10-14, in chat: "commit first and add this new equalizer too". Fixes committed as `852db6f`; the
equalizer goes into the same Android release.

### A196 — Equalizer: external equalizers and a Settings button only *(asked in chat, logged late)*
**Answered:** 2026-10-14, in chat: "just 1 and 2". The app announces its audio session to equalizer apps and Settings
opens the phone's or an app's equalizer screen. No built-in equalizer.

### A195 — The first security-audit run is the quick profile *(was Q195)*
**Answered:** 2026-10-13, picked A. Cloudflare's security-audit skill, `quick` profile over the whole repo: one
hunting pass over coarse areas, one coverage critic, one verifier per candidate; source-only (no full sandbox here);
reported as partial coverage. Output under `~/security-audit-skill/brainlessmusic/run-1`.

### A194 — Push the sign-up and search work together as one release *(was Q194)*
**Answered:** 2026-10-13, in chat: "proceed as one". Both commits pushed; one Android release, v0.4.16, with both sets
of notes (v0.4.15's notes folded into it, never tagged). The session that made the search commit was told.

### A193 — The search tab gets all nine ideas, on Android and the web *(was Q193, first logged as a second Q187)*
**Answered:** 2026-10-13, in chat: "pick all of it, also lets enhance when nothing is being search and nothing is
found". Top result, kind filters, songs first and best-match order, "See all" paging, recent searches and genres
before typing, highlighted matches, richer album and artist rows, accent-blind people and playlist search with a
"Did you mean" suggestion when nothing matches (no fuzzy matching inside results), and the same on the web.

### A192 — Sign in with username or email *(owner request)*
**Answered:** 2026-10-13, in chat: "if email included, then they can login using either username or email then".
Password and passcode sign-in accept either. Emails are unique ignoring case, and a username can't contain `@`, so the
two never collide.

### A191 — Invites get a short code you can type *(was Q191)*
**Answered:** 2026-10-13, in chat: "a". An 8-character code like guest codes; the invite link carries the same code
and fills it in. Checking a code is rate limited. Links already sent keep working.

### A190 — Email is required on sign-up; existing accounts are asked *(was Q190)*
**Answered:** 2026-10-13, in chat: "a". New accounts must give one. An account without one sees "Add your email" after
signing in, with a "Later" button, shown again next time until added. Guests are left out.

### A189 — Email is for a password reset, later *(was Q189)*
**Answered:** 2026-10-13, in chat: "a". Stored now; "Forgot password?" is its own later feature (needs a mail service
and a check that the address is theirs). Until then nothing is sent to it.

### A188 — Guest upgrade invites work in the Android app too *(was Q188)*
**Answered:** 2026-10-13, in chat: "sure". An invite tied to a guest, opened in the app, turns that guest into an
account, as on the web.

### A187 — Invite links open the Android app *(was Q187; follows A109)*
**Answered:** 2026-10-13, in chat: "yes". `/invite/` links open an in-app screen to pick a name and password, then
sign in, like `/join` room links. A109 ("not in the first version") stays as the record of the first version.

### A186 — Android Edit profile becomes a full-screen page *(was Q186)*
**Answered:** 2026-10-13, in chat: "pick your suggestions but take note of 4, maybe we could add it later". Built: a
full-screen page with sections (1), a big picture with a camera badge (2), the display name editable there (3), pins
picked from a searchable library list with covers (5), Save lit only on a change and "Discard changes?" on leaving (6).
**Parked:** a live preview of the profile as others see it (4), maybe later.

### A185 — Playlists get descriptions, and the Android playlist page a search, sort and floating Play *(owner request)*
**Answered:** 2026-10-13, in chat: "add descriptions to playlist too, so its easier to know. including the private one
too", with search, a song count, sort and Play as a floating button. Descriptions on every playlist (up to 300
characters, migration 0036), edited with the name; shown on the page and the Playlists grid. Android only for now; the
web shows and edits them since the same day (owner: "lets add that").

### A184 — Listen together's icon is headphones *(was Q184)*
**Answered:** 2026-10-13, in chat: "q184: a". Every skin's own headphones glyph (Lucide, Phosphor Bold, Font Awesome,
MingCute); used on Home's button, the player and the setup screen. The group-of-people icon is gone.

### A183 — Listen together is a labelled floating button on Home *(was Q183)*
**Answered:** 2026-10-13, in chat: "q183: a". "Listen together" with its icon, bottom right of Home, in the skin's
button shape, for guests too; replaces A136's small top-bar icon. The player keeps its icon.

### A182 — On Android, People opens from Listen together, not Home or your profile *(owner request)*
**Answered:** 2026-10-13, in chat: "why would i want to see other people profile in my profile page", and Home needs
no People icon either. Android only: "See everyone" left your own profile and the People icon left Home's top bar;
a People icon sits in Listen together's top bar instead. Search's People group and names as links stay. Replaces
those two parts of A172 on Android. On the web, "See everyone" left the profile too (2026-10-13); the More menu keeps
People.

### A181 — Ship the add-to-playlist redo on Android in v0.4.12 *(was Q181)*
**Answered:** 2026-10-13, in chat: "yes go out". Straight to a release, no debug build on the phone first.

### A180 — The add-to-playlist window stays open after an add *(was Q180)*
**Answered:** 2026-10-13, in chat: "now stay". Rows are switches (add / take out), Done closes; web and Android.

### A179 — Playlist names are capped at 100 characters *(was Q179)*
**Answered:** 2026-10-13, in chat: "yes". Counted as characters (an emoji is one), checked by the server (S21) and the
apps. Asked in chat before it had a ledger number; logged here after.

### A178 — Your picture goes at the right end of Android Home's top bar *(was Q178)*
**Answered:** 2026-10-13, picked A. After People and Listen together, where Google's apps put your account picture;
the greeting keeps the left edge. Replaces A171's left-of-the-bar spot on Android (the web is unchanged).

### A174 — Profiles show display names only *(was Q174)*
**Answered:** 2026-10-13, picked A. Someone else's profile no longer carries the login `username` or `isAdmin`; your own
still does. People search keeps matching usernames but returns only display names. Found in the review of `abc35a4`.

### A173 — Opening a profile during Listen together keeps the room playing *(was Q173)*
**Answered:** 2026-10-13, picked A. The room keeps playing and Back returns to it. Playing a song from the profile asks
first, since in a room it adds to the queue for everyone.

### A172 — People and other profiles open from everywhere offered *(was Q172)*
**Answered:** 2026-10-13, all four: a People entry (web More menu, Android Home); a People group in search (web and
Android); names as links (a playlist's "by" line and "From others", Listen together members, the Control Center's On
air rows and Users panel); and "See everyone" on your own profile.

### A171 — Your own profile opens from your picture *(was Q171)*
**Answered:** 2026-10-13, picked A. Your picture is a button in the web header beside Options, and at the left of
Android Home's top bar.

### A170 — Profiles open from any name, and a People list *(was Q170)*
**Answered:** 2026-10-13, picked A. A name links to its profile wherever it shows (a playlist's "by" line, a room's
members), and a People page lists everyone.

### A169 — Favourites are worked out and pinned *(was Q169)*
**Answered:** 2026-10-13, picked A. Top songs, artists and genres from listening, plus an optional favourite song and
favourite artist the person pins.

### A168 — Others see the whole profile, likes and dislikes included *(was Q168)*
**Answered:** 2026-10-13. Others see the picture and bio, top songs, artists and genres, listening totals, public
playlists, liked songs and disliked songs. Private playlists stay the owner's. (The recommendation was to keep liked
and disliked songs private; the owner chose to show them.)

### A167 — Everyone signed in sees everyone's profile *(was Q167)*
**Answered:** 2026-10-13, picked A. Built on, as stated when asked: guests get no profile of their own; web and Android
together; your own profile shows you everything.

### A166 — "From others" lists the newest public playlists first *(was Q166)*
**Answered:** 2026-10-13. Ordered by when the owner made it public, newest first, not grouped by person. (Asked in
the reply without a ledger entry first; recorded here on the answer.)

### A165 — A downloaded public playlist keeps working after it goes private *(was Q165)*
**Answered:** 2026-10-13. Someone who downloaded another person's public playlist for offline listening keeps it if
the owner makes it private later. (Asked in the reply without a ledger entry first; recorded here on the answer.)

### A164 — Public playlists ship on web and Android together *(was Q164)*
**Answered:** 2026-10-13, picked A. One server change, both clients in the same piece of work.

### A163 — Guests see public playlists but don't publish *(was Q163)*
**Answered:** 2026-10-13, picked A. Guests can browse and play other people's public playlists; a guest's own
playlists stay private (guests are anonymous and pruned when idle).

### A162 — Someone else's public playlist: listen and save a copy *(was Q162)*
**Answered:** 2026-10-13, picked A. Play, shuffle, add to queue, and "Save a copy" to make your own editable one; only
the owner edits theirs. Built on these, stated when asked: every playlist is private until its owner makes it public;
the Playlists section gets a "From others" part showing each owner; search gets a Playlists group (your own and public
ones); "public" means people on this server, not a sharing link.

### A161 — A person's row shows last seen, plays, date added and guest code *(was Q161)*
**Answered:** 2026-10-13, all four. Last seen (`users.last_seen_at`, stamped by `GET /auth/me`; `GET /users`
already sent it as `lastSeenAt`) and plays in the last 7 days (added to `GET /users`); guests also show their code and how many devices signed in with it.

### A160 — A person's actions open in a detail panel *(was Q160)*
**Answered:** 2026-10-13, picked A. Clicking a person opens a panel with their role, set password, make an account
(guests), their code and sign-ins (guests), and delete. Rows carry no buttons.

### A159 — The Users tab is roster first *(was Q159)*
**Answered:** 2026-10-13, picked A. A "Waiting" strip for guest requests (only when any), then everyone in one roster
with filters (All, Admins, Listeners, Guests) and one "Add someone" button (invite link, guest code, or create it
yourself), then "Ways in" at the bottom (the guest-code switch, open invite links, unused codes, expired).

### A158 — Logs get their own tab *(was Q158)*
**Answered:** 2026-10-13, picked A. Stream errors, playback failures and file integrity move to a new "Logs" tab in
the Control Center; the Overview shows each one's count and newest entry, with a link.

### A157 — The Overview adds plays, library, accounts and levelling *(was Q157)*
**Answered:** 2026-10-13, all four. Plays today and this week across everyone (a new small query), library totals
(`/library/stats`), accounts and pending account requests, and volume levelling progress (`/admin/loudness`).

### A156 — The Overview is the cabinet's operator test mode *(was Q156)*
**Answered:** 2026-10-13, picked A. Like an arcade machine's boot self-check: one line per subsystem with OK / CHECK /
NG, then live panels for listeners and rooms. Flat, monospace readouts, colour only for state.

### A155 — "What's new" in Android Settings *(was Q155)*
**Answered:** 2026-10-12, picked option A. A "What's new" row in the Android app's Settings, and a tap on the version
line, open every release's notes, newest first, packed from `android/release-notes/` into the APK. The website's
Options page is unchanged. Landed in the 2026-10-12 "Settings → What's new" CHANGELOG entry.

### A154 — Stray songs join the big album *(was Q154)*
**Answered:** 2026-10-12, picked option A. An album of 1 or 2 songs joins the larger album with the same title and album
artist in another folder, unless the album artist is Various Artists. Full duplicate copies stay separate. Landed in
the [metadata plan](features/metadata-model/planning.md), rule 1c.

### A153 — Tap likes, hold dislikes *(was Q148)*
**Renumbered:** was A148 until 2026-10-12, when it turned out a second A148 (untagged albums) had been logged first; commit `bd5efce` and older docs commits still say A148.
**Answered:** 2026-10-12, picked option A. "Hear less" is renamed Dislike everywhere (owner, same day; behaviour
unchanged, shuffle picks it about one pass in four). The like button: tap toggles like; hold dislikes and shows a
broken heart; tap clears it. Liking a disliked song undoes the dislike, and the other way round. Disliked songs sit in
the Library's Playlists tab under Liked songs, and stay in Settings → Playback.

### A152 — A fuller Playlists tab *(was Q147)*
**Renumbered:** was A147 until 2026-10-12, when it turned out a second A147 (v0.4 theme) had been logged first; commit `bd5efce` and older docs commits still say A147.
**Answered:** 2026-10-12, picked option A. Liked songs as a hero card in the skin's dress (mosaic, count, Play,
Shuffle); playlists as a two-column grid of cover mosaics with New playlist as the first tile; a hint when there are
none; a styled guest card. The server's playlist list adds each playlist's first four song ids for the covers.

### A151 — Measure smol's library, read-only *(was Q151)*
**Answered:** 2026-10-12, picked option A. A read-only tag count runs inside `brainless-app` on smol. Claude's SSH to
smol was refused by the session's permission check, so the owner runs the command. Landed in the
[metadata plan](features/metadata-model/planning.md), Phase 1.

### A150 — Measure the library on this machine *(was Q150)*
**Answered:** 2026-10-12, picked option A. It is the same music as smol's, so the read-only tag count runs here and
nothing on smol is touched. Landed in the [metadata plan](features/metadata-model/planning.md), Phase 1.

### A149 — Artist pages get "Appears on" *(was Q149)*
**Answered:** 2026-10-12, picked option A. A featured artist's songs on someone else's album show in a section under
their own albums. Landed in the metadata plan, Phase 2.

### A148 — Untagged mixed-artist albums join by title and folder *(was Q148)*
**Answered:** 2026-10-12, picked option A. Same album title in the same folder is one album; its album artist is the
artist on more than half the songs, otherwise Various Artists. Landed in the metadata plan, rule 3.

### A147 — v0.4 is "Library makes sense" *(was Q147)*
**Answered:** 2026-10-12, picked option A. Album artist, compilations, disc numbers and genres from the brainstorm
pool's metadata-model section. Not picked, still in the pool: on-the-road (sleep timer, Bluetooth auto-resume,
widget, Android Auto), rediscovery (ratings, smart playlists, stats), synced lyrics. Landed in the roadmap's v0.4 section.

### A146 — Standard's player opens as a plain sheet *(was Q146)*
**Answered:** 2026-10-12, picked option A. It slides up from the bottom and back down, like most music apps; no game
style. An exception to Standard staying untouched, since the crossfade was half-baked there too.

### A145 — The player opens and closes in the skin's game style *(was Q145)*
**Answered:** 2026-10-12, picked option A. Hit circle zooms in from the mini player like osu! starting a map; Lane
Arcaea's song-start shutter; Gear SOUND VOLTEX's fast slam with a slanted leading edge; Ring a maimai circle growing
from the mini player's cover. Closing reverses each. In every skin a swipe down carries on off the bottom.

### A144 — "TAP TO START" before the sign-in form *(was Q144)*
**Answered:** 2026-10-12, picked option B. The title screen shows alone with TAP TO START; a tap brings up the form.

### A143 — A title screen per skin on sign-in *(was Q143)*
**Answered:** 2026-10-12, picked option A. Standard keeps the web's beat mosaic; Hit circle osu!'s menu; Lane
Arcaea's title; Gear SOUND VOLTEX's attract; Ring maimai's attract. Calmer while a field has focus; still with
animations off.

### A142 — The setup is per account, not per phone *(owner, 2026-10-12)*
**Decided:** 2026-10-12, on the offer after A139. Each account (guests included, by their server username) gets the
setup on its first sign-in on a phone; one that has done it there doesn't. A reinstall or cleared data brings it back
for everyone. Phones already signed in when this shipped mark that account done (as A141).

### A141 — Phones already signed in skip the setup *(was Q141)*
**Answered:** 2026-10-12, picked option A. Opening on a saved session marks the setup done, so only fresh installs,
reinstalls and resets see it.

### A140 — Guests get the same setup *(was Q140)*
**Answered:** 2026-10-12, picked option A.

### A139 — The setup: what this is, the look, three playback switches *(was Q139)*
**Answered:** 2026-10-12, picked option A. Steps: what this is; light or dark, skin, colour; volume levelling,
auto-play on resume, data saver; done, then the welcome in the chosen skin. Each step can be skipped; all of it stays
in Settings.

### A138 — A goodbye on sign-out, each skin's welcome in reverse *(was Q138)*
**Answered:** 2026-10-12, picked option A. About 1.6 s, tap skips, off with animations off, login under it as it
ends; guests after the confirm. Standard: card out, "See you". Hit circle: "see you next time" folds away in the
disc. Lane: shutter closes, "SEE YOU", opens on login. Gear: appeal card out, critical line drops, "THANK YOU FOR
PLAYING". Ring: plate lifts off, "See you next play!", the round screen shrinks shut.

### A137 — Playlists takes Genres' place in the Library *(was Q137)*
**Answered:** 2026-10-12, picked option A. Library tabs: Songs, Albums, Artists, Playlists. Genres, a placeholder,
comes back when the server reads genre tags.

### A136 — Listen together gets an icon in Home's top bar *(was Q136)*
**Answered:** 2026-10-12, picked option A. With Shuffle and Listen together off Home, the player only opens while a
song is loaded, so a small Listen together icon sits in Home's top bar; it is also still in the player.

### A135 — Standard's Home opens with a plain stats card *(was Q135)*
**Answered:** 2026-10-12, picked option A. Standard has no radar, so where the game skins put theirs it shows hours,
plays and songs with the change against the last period. The game skins carry those three numbers in their own cards.

### A134 — Liked and playlists go to a Library tab, Hear less to Settings *(was Q134)*
**Answered:** 2026-10-12, picked option A. The Library gets a Playlists tab, Liked songs pinned first as a playlist
that can't be deleted, then the user's playlists. Hear less moves to Settings → Playback. Home loses the three
tiles, the Shuffle and Listen together buttons, and the player card; the range picker and the skin's listening card
lead it (owner, 2026-10-12).

### A133 — smol's library is checked through a guest login *(was Q133)*
**Answered:** 2026-10-12, in chat: "use guest login". Also confirmed: the -18 LUFS target and levelling on by default
stay. Done the same day with an owner-given guest code (guest "loudness check" now exists on smol): 30 random tracks
of 32,405, measured here from their streams. -17.4 to -4.5 LUFS, median -8.8; 25 of 30 peak over 0 dBTP. At -18
every one is lowered, -0.6 to -13.5 dB, so smol plays about 9 dB quieter overall with levelling on. ffmpeg averaged
4.0 s a track here, so the first full pass on smol is roughly a day and a half.

### A132 — Ring's score is an achievement percentage *(was Q132)*
**Answered:** 2026-10-12, in chat: "recommend". Achievement = 100% × plays / (plays + skips), plus 1% only for a full
combo, four decimals (0.0000% to 101.0000%), with maimai's rank (D to SSS+, thresholds in
`.docs/features/player-skins/ring-research.md` section 3) and lamp (CLEAR, FC). Ring only.

### A131 — Ring's theme is "Candy", working in Light and Dark *(was Q131)*
**Answered:** 2026-10-12, in chat: "recommended". The mockup's swatch (pink `#ff4fa3`, sky blue `#22bff5`, yellow
`#ffc928`) with the game's bluer navy ink, made for both modes; Ring leaves the Light/Dark setting alone. Phone-only,
like Lavender and Voltage.

### A130 — Ring's icons are MingCute *(was Q130)*
**Answered:** 2026-10-12, in chat: "pick again the recommende". MingCute (Apache 2.0), line and fill.

### A129 — Ring's font is M PLUS Rounded 1c *(was Q129)*
**Answered:** 2026-10-12, in chat: "pick the recommended". Replaces the mockup's Fredoka, which stays Hit circle's.
Also from the same message: the round screen sits in the centre of the player and uses the full space.


### A128 — Gear shows a score and grade from plays and skips *(was Q128)*
**Answered:** 2026-10-11, in chat: "a". Score = 10,000,000 × plays / (plays + skips), eight digits, with SOUND
VOLTEX's grade (S to D, HEAVENLY HAVEN thresholds) beside the medal. Gear only; other skins keep the medal alone.

### A127 — Gear's colour theme is "Voltage" *(was Q127)*
**Answered:** 2026-10-11, in chat: "voltage". The mockup's swatch (navy, cyan, magenta, orange), phone-only like
Lavender.

### A126 — Gear's icons are Phosphor *(was Q126)*
**Answered:** 2026-10-11, in chat: "tabler or phosphor", leaving the pick to Claude. Phosphor (MIT), Bold weight, Fill
for play, pause and heart: Tabler's thin stroke reads too close to Lane's Lucide.

### A125 — Gear's font is Orbitron, with Chakra Petch for body text *(was Q125)*
**Answered:** 2026-10-11, in chat: "which looks similar", leaving it to the closest match. Rendered against the game's
own "COMPLETE" lettering, Orbitron Bold/Black matched best (wide, squared, the bar-less A). Orbitron is too wide for
long titles and body copy, so body and title styles use Chakra Petch; display, headline and labels use Orbitron. Both
OFL. Research: [features/player-skins/gear-research.md](features/player-skins/gear-research.md).

### A124 — Hit circle's sheets open in the middle of the screen *(was Q123)*
**Answered:** 2026-10-11, in chat: "Middle of the screen". Hit circle's floating sheets (song menu, add to playlist,
update, queue) are an outlined card centred on the screen like a dialog, not a sheet from the bottom. Lane stays docked.

### A123 — Lane's icons are Lucide *(was Q122)*
**Answered:** 2026-10-11, in chat: "q122: a". Thin-stroke Lucide icons (ISC licence), generated into the app like Hit
circle's Font Awesome set, credited in Settings → Licenses.

### A122 — Lane's typeface is Exo 2 *(was Q121)*
**Answered:** 2026-10-11, in chat: "q121: a". Exo 2 (SIL OFL), the nearest open match to Arcaea's thin geometric
type, bundled and credited in Settings → Licenses.

### A121 — Lane goes next, ahead of the sequence *(updates A114)*
**Answered:** 2026-10-11, in chat: "lets focus onto lane skin then". Lane (after Arcaea) is built next, app-wide,
instead of Deck. The rest keep A114's order. Its typeface and icons wait on Q121 and Q122.

### A120 — Production deploys itself once CI passes *(updates A47)*
**Answered:** 2026-10-11, in chat ("how about cd then?", then "yes sure"). smol's `brainless-auto-deploy.timer` runs
`scripts/auto-deploy.sh` every 5 minutes: once `.github/workflows/ci.yml` passes for the newest `main`, it runs
`deploy.sh` pinned to that commit (`DEPLOY_REF`) and rolls back if the app comes up unhealthy. The owner installed it
on smol the same day. A push to `main` that touches the image now ships to production without a hand step;
`deploy.sh` by hand still works. How it works: `.docs/ops/cloudflare-tunnel-deployment.md`, "Automatic deploys".

### A119 — Hit circle goes app-wide first; the current design stays the default *(was Q119)*
**Answered:** 2026-10-11, in chat: "a, also retain the current design as default theme". The app-wide skin system is
built now with Hit circle as its first skin; Deck and the rest ship app-wide from the start. Today's look is kept as
the **Standard** skin and is what everyone gets until they pick another.

### A118 — An app skin carries the full design language *(was Q118)*
**Answered:** 2026-10-11, in chat: "a". A skin sets typeface, corner shapes, cover and avatar shape, button style, list
rows and the tap feedback, the mini player and its progress line, the bottom bar, sheets and dialogs, through shared
components, so each new skin is mostly a token set plus a few signature parts. No bespoke per-skin screens.

### A117 — One Skin setting styles the whole app; colours stay separate *(was Q117)*
**Answered:** 2026-10-11, in chat: "a". Settings → Appearance → Skin replaces Player skin and restyles every screen,
the player included. Colours stays its own pick (A116 holds). Supersedes A48's "a theme is colour only" for layout and
type: a theme is still colour only, and the skin now owns type, shape and layout.

### A116 — Each game's colours become a theme of their own *(was Q116)*
**Answered:** 2026-10-11, in chat: "c". The game palettes join Settings → Colours as separate themes, picked on their
own; a skin draws in whatever theme is on, so it sets layout only (A48 stands: a theme is colour only). Each is a
`Palette` like the others, so it has a light and a dark side through the existing light/dark setting. Phone-only, with
no web id, like Material You (A78), until the web has them. Where a game already has a theme, that one is its match
rather than a near-copy: Magenta (after osu!) for Hit circle, Crimson (after IIDX) for Deck.

### A115 — Personal means your record for the song, arcade style *(was Q115)*
**Answered:** 2026-10-11, in chat: "a". Each game skin shows a score strip for the current song from
`GET /me/stats/tracks/:id`: plays, time listened, and a clear lamp in that game's words. The lamp comes from plays vs
skips (A113): no record yet → new; skips at least as many as plays → failed; no skips and 3+ plays → full combo;
otherwise → clear. `skips` is added to that endpoint for it. Accounts only; guests have no history (A37). Standard and
Pills stay without it.

### A114 — Skins are built in sequence, in the mockup's order *(was Q114)*
**Answered:** 2026-10-11, in chat: "we start in sequel", read as "in sequence". One skin at a time in the order of the
mockup page (https://claude.ai/artifact/H5Ab3pzHb93Rn426sD3oZ9): Hit circle, Deck, Ring, Gear, Pad, Drum, Dance pad,
Face buttons, Scan line, Coaster, Slider, Lane. Each step ships the skin and its colour theme (A116). The skins live
under one "Player skin" setting with Standard and Pills.

### A113 — Skipped songs are recorded, marked as skips *(was Q113)*
**Answered:** 2026-10-11 · **Option A.** Every song that plays at all is sent; one cut short before the threshold (half
the song or 4 minutes) is marked `skipped`. Skips count toward minutes listened and show in Recently played, but not
toward plays, top songs/artists/albums, a song's play count, or Smart shuffle's recency. Asked because account `user`
listened for 30 minutes, skipping, and Home showed 0 plays.

### A112 — Real account names can't start with `guest-`
**Answered:** 2026-10-11 · **A.** `guest-` is reserved for minted guest rows, so a real account (register, invite,
upgrade) can't take a name that starts with it. Lands in [features/account-invites/planning.md](features/account-invites/planning.md).

### A111 — Usernames are case-insensitive
**Answered:** 2026-10-11 · **A.** `Imran` and `imran` are one name: unique regardless of case, and login matches
regardless of case. Before the migration, smol's database is checked for accounts that differ only by case. That
query runs on smol, so the owner runs it (see the plan).

### A110 — Invites come after room sync
**Answered:** 2026-10-11 · **A.** Built once room sync (roadmap boxes 22 and 23) is done.

### A109 — No invite screen on Android in the first version
**Answered:** 2026-10-11 · **A.** The friend accepts the invite on the web, then uses Log in on Android.

### A108 — Invite links are one use and last 7 days
**Answered:** 2026-10-11 · **A.** Like guest codes (A43): used once, expire after 7 days.

### A107 — Upgrading a guest keeps the same user, started by the admin
**Answered:** 2026-10-11 · **A.** The admin starts it from the Users page with an invite link tied to that guest.
Accepting turns the same `users` row into an account (`kind = 'account'`), so resume and history stay; the guest's
codes are revoked and the session that accepted stays signed in.

*A107–A112 were asked in chat on 2026-10-11 as Q105–Q110, at the same time another session used Q105–Q107 for the
updater (now A104–A106). Those six Q numbers were never written here, so they're filed by A number only; Q108–Q110
are retired so the clash can't repeat.*

### A106 — The update sheet shows every release since yours *(was Q107)*
**Answered:** 2026-10-11 · **A.** Notes for every release newer than the installed one, newest first. Lands in the
in-app updater plan (`features/app-self-update/planning.md`, written once room sync is done).

### A105 — "Skip this version" is in *(was Q106)* · **reversed the same day**
**Answered:** 2026-10-11 · **A.** The update sheet has "Install now", "Later" and "Skip this version". A skipped
version stays quiet until a newer one is out; the settings button still offers it.

**Reversed 2026-10-11 by the owner:** "remove the skip this version, it seem redundant with later". The sheet has
Install now and Later only; Later already keeps it away until the next day's check.

### A104 — Check on launch once a day, plus a settings button *(was Q105)*
**Answered:** 2026-10-11 · **A.** The app checks GitHub Releases on launch at most once a day, and there is a
"Check for updates" row in settings. Release builds only.

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
script works: `.docs/ops/cloudflare-tunnel-deployment.md`, "Updating to a new version". Since A120 the timer on smol runs it
after CI passes; by hand still works. Ask before changing anything on smol.

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
