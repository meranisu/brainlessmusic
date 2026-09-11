# Function Log

Backfilled 2026-09-03 (didn't exist before). Covers functions added/materially changed in the 6 commits since the initial commit (2026-09-03 → 2026-09-03 — this project is one day old). Newest first. Log new/changed functions here going forward, per the planning workflow in `.docs/CLAUDE.md`.

---

**Function:** `playFrom()` — `frontend/src/pages/LibraryPage.tsx`
**Date:** 2026-09-11
**How added:** change
**Purpose:** play a track with the rest of the visible page queued behind it.
**Side effects:** replaces the player queue.
**Before:** the queue-building logic was inline in the row's ▸ button; the row itself opened the tag editor.
**After:** extracted and called by both the row and the button, so the two cannot drift apart. The row click changing from "edit tags" to "play" is the point of the change: on a phone there is one gesture per row and no hover, and it was being spent on the rarest action rather than the only one that matters. Favorites and playlists already behaved this way, so this makes the library consistent rather than novel. Guards `missing` up front, where the old inline version relied on the button's `disabled` — a guard on the button does nothing for a click on the row.

---

**Function:** `handleExit()` — `frontend/src/components/AppShell.tsx`; `markAtTitle()`, `isAtTitle()`, `clearAtTitle()` — `frontend/src/lib/boot.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** leave the app for the title screen without ending the session.
**Side effects:** writes `brainlessmusic.atTitle` in `sessionStorage`; navigates.
**Before:** nothing in the header went back to the title screen, and typing `/enter` while signed in redirected straight back into the app.
**After:** `handleExit` sets the flag and navigates; `TitleScreenPage` exempts its own redirect when the flag is set, which is the whole mechanism — the redirect is right in every other case and wrong only for someone who meant to come here. `clearAtTitle` runs on the way back in, so a later reload lands in the app. Not a logout, and that is load-bearing for a guest: there is no password to return with, so dropping the token would abandon the row and everything attached to it. The flag is read once into state rather than live, because clearing it happens while the exit animation is still playing and a live read would flip the gate mid-animation.

---

**Function:** `WordmarkBand()`, `WordRun()`, `Lettering()` — `frontend/src/components/WordmarkColumn.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** the wordmark crawling sideways across the backdrop.
**Side effects:** none.
**Before:** the backdrop was five vertical columns; `Word` inlined its own lettering.
**After:** `Lettering` is split out so the vertical `Word` and the horizontal `WordRun` share one definition of what the lockup looks like. `WordRun` repeats it `REPEATS` (8) times: the loop shifts by exactly one run, so a run narrower than the window shows as a gap crossing the screen. Eight is enough at any window shape without measuring, because the type is sized in `vw` — a wider screen gets proportionally wider letters, so the count needed to cross stays put. Verified at 6747px per run against a 1425px window.

---

**Function:** `onTabClick()`, `rememberDirection()`, `navItemsFor()`, `activeIndex()` — `frontend/src/components/AppShell.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** change tabs inside a view transition, in the direction you moved along the bar.
**Side effects:** sets `data-nav-dir` on the document element; navigates.
**Before:** `NavLink`s rendered straight from JSX and navigated instantly.
**After:** the bar is data (`navItemsFor`) because two things need its order — which tab is active, and whether the clicked one is left or right of it. `onTabClick` calls `document.startViewTransition` **directly**: React Router's own `viewTransition` prop is a data-router API and this app runs under `<BrowserRouter>`, so the prop is accepted and silently ignored — counted at the API, it started zero transitions. `flushSync` is required so the DOM is in its new state before the callback returns; React would otherwise batch the update past the snapshot. Modified clicks and non-primary buttons return early, so opening a tab in a new window still works.

---

**Function:** `AppShell()` — `frontend/src/components/AppShell.tsx`
**Date:** 2026-09-11
**How added:** bug fix
**Purpose:** stop the opening sequence from being able to hide the app.
**Side effects:** one timer.
**Before:** `isBooting` was read once and never cleared; the staged classes came off only when the component unmounted.
**After:** cleared after `BOOT_MS` (1,500) whatever the animations did. The owner reported the library not appearing after pressing enter: React StrictMode remounts components in development, which recreates the staged elements and restarts their animations *and their delays*, leaving the track list invisible a second and a half in. The trigger was StrictMode; the fault was gating already-loaded content on an animation with no deadline. Worst case is now a sequence that ends abruptly rather than an app that never appears.

---

**Function:** `ShellBackdrop()` — `frontend/src/components/AppShell.tsx`
**Date:** 2026-09-11
**How added:** change
**Purpose:** the app's moving backdrop.
**Side effects:** none.
**Before:** two wordmark columns parked in the gutters, `hidden` below `2xl` — because decoration behind a data table is a bug, and a breakpoint was the blunt way to guarantee it never got there.
**After:** five columns, full-bleed, in two tiers moving against each other — far (small, faint, slow, climbing) and near (large, brighter, quick, falling). The constraint the breakpoint enforced is now enforced by a mask instead, which keeps the motion visible on the screens most people use rather than only above 1536px. Beat counts are co-prime (128/97/113 against 67/53) so the field never visibly loops. Below `md` the inner three drop out: a phone has no gutters, so every column there is behind the text and three of them is clutter rather than depth. Measured cost behind the page heading: 5/255 worst pixel, against 20/255 in the gutter where it is supposed to be doing its job.

---

**Function:** `WordmarkColumn()` — `frontend/src/components/WordmarkColumn.tsx`
**Date:** 2026-09-11
**How added:** change
**Purpose:** one column of sideways wordmark, now able to fall as well as climb.
**Side effects:** none.
**Before:** every column climbed. Siblings differed only in speed and phase.
**After:** a `reverse` prop sets `animation-direction`, reusing the same keyframes rather than adding a mirrored copy of them. Counter-scrolling is what separates two planes passing each other from one sheet sliding — speed alone does not do it, because the eye reads a slower neighbour as the same surface.

---

**Function:** `markJustEntered()`, `consumeJustEntered()` — `frontend/src/lib/boot.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** make the opening sequence a one-shot instead of a mount effect.
**Side effects:** writes and clears one `sessionStorage` key.
**Before:** nothing — new module.
**After:** `AppShell` mounts on every reload and stays mounted across route changes, so "animate on mount" would replay a 1.2-second assembly every time the tab is refreshed. `sessionStorage` rather than router state, which is lost on a reload but *kept* on a back-navigation — exactly backwards from what is wanted; and rather than `localStorage`, which would replay the boot in a new tab that never saw the title screen. Both calls are wrapped, because blocked site data throws on access and the app is identical without the animation.

---

**Function:** `handleEnter()`, `acceptHandoff()`, `exitDuration()` — `frontend/src/pages/TitleScreenPage.tsx`
**Date:** 2026-09-11
**How added:** change
**Purpose:** play the shut-off while the session is being minted, and come back if it fails.
**Side effects:** as before, plus the boot flag and a manual navigation.
**Before:** awaited the mint, then let the `<Navigate>` at the top of the component fire on the next render.
**After:** `Promise.all` on the mint and a timer, so the two run together — awaiting the mint first left the button on "Entering…" for a whole round trip before anything moved. The `<Navigate>` is now gated on `isLeaving`, because `enterAsGuest` sets `user` and the redirect would otherwise cut the animation on its first frame; the navigation is done by hand when the picture has gone. A failure clears `isLeaving`, which reverses the whole sequence rather than stranding the caller on black. `exitDuration()` exists because the stylesheet can stop the picture moving but only this side decides how long the route change waits — without it, reduced motion was slower than the animation it was meant to skip.

---

**Function:** `BootFrame()` — `frontend/src/components/AppShell.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** run one orange lap of the window's border as the app assembles.
**Side effects:** none.
**Before:** nothing — new component.
**After:** an SVG rect with `pathLength="1"`, so the dash is expressed in units of "the whole perimeter" and stays correct at any window size with nothing measured and no resize observer. **No `viewBox`**, which is the part worth remembering: a viewBox with `preserveAspectRatio="none"` is the obvious way to fill a box and it breaks this twice over — the non-uniform scale turns a 2-unit stroke into a 25px slab down one side, and `vector-effect: non-scaling-stroke` then fixes the thickness while moving dash measurement into screen space, drawing ten stubby segments instead of one line. Without a viewBox, user units are CSS pixels and neither problem exists. Geometry lives in CSS so percentages resolve against the element box.

---

**Function:** `useSecretTaps()` — `frontend/src/hooks/useSecretTaps.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** turn repeated taps on the wordmark into the admin entrance.
**Side effects:** none.
**Before:** nothing — new hook.
**After:** counts taps that each land within `gapMs` of the one before. The gap is what makes it a gesture rather than a trap — a child mashing the logo never produces seven evenly-spaced taps and then stops. A lapsed streak resets to **one**, not zero: the tap that broke the streak is still a tap, and starting the count from nothing would make a fumbled attempt need eight.

---

**Function:** `TitleScreenPage()`, `TitleHud()`, `tokenFromHash()` — `frontend/src/pages/TitleScreenPage.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** the front door — enter as a guest, adopt a handoff, or reach the hidden admin door.
**Side effects:** mints a guest (`POST /auth/guest`); rewrites the address bar via `replaceState`.
**Before:** `LoginPage` was the unauthenticated destination, and asked for a username and password.
**After:** one button, and three things it has to handle. The **entry code** is learned by trying: the first press without one returns 401, which reveals the code field — the server never advertises whether it wants a code, and does not need to. The **handoff token** is read during the first render rather than in an effect, so the ordinary enter button never paints for a frame first, and the hash is stripped immediately because a token in a URL survives screenshots and the back button. `TITLE_SIZE` is clamped against `vh` as well as `vw`, since a landscape phone has width and no height, and its `vw` ceiling is derived from what must fit (the wordmark measures ~6.6x the font size) rather than chosen by eye.

---

**Function:** `AdminNumpad()` — `frontend/src/components/AdminNumpad.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** collect the admin entry code and exchange it for an unlock ticket.
**Side effects:** `POST /auth/unlock`; writes the ticket to `sessionStorage`.
**Before:** nothing — new component.
**After:** a keypad rather than an `<input>`, because a numeric input summons a keyboard that covers half the screen it is standing on. The code is never echoed — dots, not digits — since a keypad held at arm's length in a room with other people is the normal case. A 429 says something different from a 401: "try again" is useless advice when the answer is "not for a minute". It never checks the code itself; that happens on the server, or the secret would ship in the bundle.

---

**Function:** `HandoffDialog()` — `frontend/src/components/HandoffDialog.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** make a second device the same listener, and hold the one destructive action a guest has.
**Side effects:** none — draws a QR from the token already in `localStorage`.
**Before:** nothing — new component. The plan had specified a `GET /auth/handoff` endpoint behind this.
**After:** no endpoint was built: the client already holds the token, so asking the server to repeat it back would be a round trip to learn something it had just used. The link is presented as `select-all` text beside the QR because `navigator.clipboard` needs a secure context and this app runs on plain HTTP over a LAN — the copy button is the convenience, not the mechanism. "Forget this device" lives here behind a two-step confirmation rather than in the header, because for a guest it is not a log-out: it is the permanent loss of a row nothing can ever authenticate as again.

---

**Function:** `enterAsGuest()`, `adoptToken()`, `signInWith()` — `frontend/src/auth/AuthContext.tsx`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** the two passwordless ways to become somebody.
**Side effects:** store a token; `GET /auth/me`.
**Before:** `login()` was the only way in, and inlined its own store-then-fetch.
**After:** all three paths funnel through `signInWith`, so "what it means to be signed in" is defined once. `login()` now sends the unlock ticket when one is held — the server ignores it unless `ADMIN_ENTRY_CODE` is set, so this is inert on a LAN. `adoptToken` deliberately **replaces** rather than merges: there is no way to merge two listening histories that does not invent a policy for conflicting queues, and the screen that calls it says so first.

---

**Function:** `insertGuest()`, `countGuests()`, `countAccounts()`, `touchLastSeen()` — `backend/src/db/users.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** mint and account for passwordless guest rows.
**Side effects:** `insertGuest` and `touchLastSeen` write to `users`.
**Before:** nothing — every row in `users` had a password.
**After:** `insertGuest` writes `kind = 'guest'` with an empty hash and a `guest-<6 hex>` name, retrying on the vanishingly unlikely name collision rather than letting a public endpoint return a 409 nobody could act on. `countAccounts` exists because `countUsers` became the wrong question: it decides whether a fresh server is still claimable, and a guest minted by the first visitor must not close that window. `touchLastSeen` is called from `/auth/me` only — from the auth decorator it would be a write per streamed byte range, and the only reader measures in days.

---

**Function:** `pruneIdleGuests()` — `backend/src/db/users.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** make room at the guest ceiling by collecting rows nothing can ever log back into.
**Side effects:** deletes from `playlist_tracks`, `playlists`, `favorites`, `play_history`, `playback_state` and `users`, in one transaction.
**Before:** nothing — new function.
**After:** the only code in the project that deletes user data without a person pressing something, so its bounds are structural rather than remembered: it can only match `kind = 'guest'`, it is called only from `POST /auth/guest` at the cap (never on a timer), and staleness falls back to `created_at` when `last_seen_at` is still null. Deletes are explicit because none of this project's foreign keys cascade, matching `deletePlaylist`. `tracks.play_count` is deliberately not decremented — it counts what was played, and the plays happened.

---

**Function:** `createRateLimiter()` — `backend/src/services/rateLimit.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** fixed-window per-key counting for the two endpoints anyone can call.
**Side effects:** none — in-process memory only.
**Before:** nothing — new module. No endpoint was reachable without a credential, so nothing needed counting.
**After:** limits are passed at `check` time rather than at construction, so a config value changed at runtime takes effect on the next request instead of being frozen in when the route was registered — which is also what makes it testable. Expired windows are swept when a request arrives, since that is the only moment the map can have grown. `resetAllRateLimiters()` exists for tests, where module-level singletons would otherwise leak state between cases in one process.

---

**Function:** `signUnlockTicket()`, `verifyUnlockTicket()` — `backend/src/services/token.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** prove a browser answered the admin numpad, so `/auth/login` can require it.
**Side effects:** none.
**Before:** nothing — new functions.
**After:** a third token type joins the session and media tokens. It carries **no `sub`** and stands for a fact about a device rather than a person, so holding one proves only that someone got past the numpad. The existing scope rules needed no edit to stay safe: `verifySessionToken` already rejects *any* scoped token and `verifyMediaToken` demands `media` specifically, so the new ticket was refused as a credential and in a media URL before either function knew it existed. There are tests asserting exactly that.

---

**Function:** `POST /auth/guest`, `POST /auth/unlock`, `unlockedForLogin()`, `secretMatches()` — `backend/src/routes/auth.ts`
**Date:** 2026-09-11
**How added:** new feature
**Purpose:** the passwordless front door, and the server-side gate in front of the password one.
**Side effects:** `/auth/guest` inserts a `users` row and may prune others; both endpoints consume a rate-limit budget.
**Before:** the only way in was `POST /auth/login` with a username and password.
**After:** `/auth/guest` mints a row and signs the ordinary session token, so no client path downstream needs a new branch. `/auth/unlock` checks `ADMIN_ENTRY_CODE` **on the server** — a code compared in React would be shipped to everyone it hides from — and a wrong code and an unconfigured one return byte-identical replies, so the numpad cannot be used to detect whether a server even has an admin door. `unlockedForLogin` is transparent when no code is set, so this is inert on a LAN. A refused login says `invalid username or password` whether the password or the ticket was the problem, because a distinct "you need the code" would confirm the account exists. `secretMatches` is `timingSafeEqual` with a length short-circuit — that leaks the configured code's length and nothing else, which is worth far less than the timing signal it removes.

---

**Function:** `setDataSaver()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-10
**How added:** change
**Purpose:** switch quality on the playing track without a gap in the music.
**Side effects:** one warm-up request, then reassigns `audio.src`; writes the preference.
**Before:** assigned `audio.src` immediately and then waited for the file. On a cold cache that was **5.71 s of silence** for a 172-second track, with a perfectly good copy playing the whole time — the loudest possible answer to a button press. It was invisible while every test ran warm.
**After:** the converted copy is warmed first (the readout probe doubles as the wait — its response does not arrive until the file exists), and the element is touched only once the file is there. The resume point is read *after* the wait, since the track kept playing. A `swappingRef` suppresses `timeupdate` for the duration, because reassigning `src` resets the element's clock to 0 and painting that flicked the scrubber back by 8.9 s. Overlapping presses are resolved by a token plus an `AbortController`. Failure puts the toggle back rather than leaving it claiming a quality that is not being served — but an `AbortError` is exempt, since a page navigating away mid-request is not a refusal and reverting there quietly undid a choice the listener had made.

---

**Function:** `probeServedStream()` — `frontend/src/lib/streamQuality.ts`
**Date:** 2026-09-10
**How added:** change
**Purpose:** report what the server actually sent, and double as the "is the copy ready" wait.
**Side effects:** one `Range: bytes=0-0` request.
**Before:** read the total only out of `Content-Range`, which only a 206 carries. Chrome can answer a repeat request from its own HTTP cache with a 200, so a cache hit returned `null` — which the caller read as "could not prepare the copy", showed an error toast for, and reverted the preference over. The readout would also have silently vanished on those responses.
**After:** prefers `Content-Range` and falls back to `Content-Length`, so both a fresh 206 and a cached 200 are understood. A 206's `Content-Length` is 1, which is why the range is still tried first.

---

**Function:** `savePlaybackState()` / `loadPlaybackState()` / `clearPlaybackState()` — `backend/src/db/playbackState.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** remember where each listener was, and hand it back only if it can still be played.
**Side effects:** one upsert or delete on `playback_state`; `loadPlaybackState` reads `tracks`.
**Before:** nothing. Closing a tab lost the queue and the position.
**After:** saving is an upsert keyed on `user_id`, which is the primary key — one row per user, so last-write-wins is enforced by the schema. Loading is the part with judgement in it. A queue is stored as ids and read back later, by which time tracks may have been deleted or flagged missing, so both are filtered out on read against the same `missing_since IS NULL` rule the browse queries use — a track hidden from the library table must not reappear through a resumed queue. Filtering means the stored index cannot be reused, so it is re-derived from the survivors. When the played track itself is gone the resume moves *forward* to the next survivor rather than back to the queue's start, and drops the position, which belonged to a track nobody is playing now. Returns `null` when nothing playable is left, since a resume into an empty queue is worse than no resume.

---

**Function:** `persistState()` / `stopAndForget()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** push the position often enough to be useful, and know the difference between quitting and being logged out.
**Side effects:** `PUT` / `DELETE` on `/me/playback-state`; holds an interval while playing.
**Before:** `stop()` did both jobs, and nothing was ever written.
**After:** `persistState` reads the live queue from a ref, so the interval and the `visibilitychange` listener never re-bind. It runs at three moments because none covers the others: every 10 s while playing (a killed tab loses one interval at most), whenever playback pauses or changes track, and on `visibilitychange` — chosen over `beforeunload`, which does not fire reliably on a phone, the one place a backgrounded tab actually gets killed. `stopAndForget` exists because the ✕ and a logout must not mean the same thing: the ✕ is a deliberate "I am done" and erases the saved position, while a token expiring must leave it exactly where it was. Only `stopAndForget` is exposed on the context; the logout effect calls the raw `stop`.

---

**Function:** `loadDataSaverPreference()` / `saveDataSaverPreference()` / `probeServedStream()` / `describeServed()` — `frontend/src/lib/streamQuality.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** hold the data-saver preference, and find out what the server actually sent.
**Side effects:** reads/writes `localStorage`; `probeServedStream` issues one `Range: bytes=0-0` request.
**Before:** nothing. `buildStreamUrl` had taken a `quality` argument since `f3bd28d` and no caller ever passed one, so `?quality=low` was reachable only by hand-editing a URL.
**After:** the preference is per-device rather than per-account — the phone on mobile data wants it and the desktop on the LAN does not, and they share a login — so it lives in `localStorage`, wrapped in try/catch because storage can be blocked outright and a missing preference must not cost playback. `probeServedStream` exists because asking for the small copy is not the same as getting one: `variantFor` declines the downgrade when a source is already at or below the target, and an `<audio>` element exposes no response headers, so the fact is unreachable without a second request. A 206 carries both halves — `Content-Type` is the variant that was chosen, and `Content-Range` ends in the total size. It is nearly free on a cold cache, since the audio element is fetching the same variant at the same moment and the backend's in-flight map collapses the two into one transcode. `describeServed` measures the bitrate from the bytes on the wire rather than reading a tag, which keeps it honest for remuxed and re-encoded copies whose source numbers no longer apply.

---

**Function:** `setDataSaver()` / `waitForMetadata()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** flip quality on the track that is playing, not just on the next one.
**Side effects:** reassigns `audio.src`; writes the preference; leaves `progressRef` deliberately untouched.
**Before:** no data-saver control existed in either player surface.
**After:** the swap applies immediately, because a toggle that appears to do nothing for the rest of a four-minute track reads as broken. That is only possible because of the disk cache — the small copy is a complete file with a length, so it can be seeked back to the spot the listener was already at. Three things survive the swap: the position, the play/pause state, and the scrobble. The scrobble is the subtle one — this is the same listen, so `progressRef` is not reset, and `lastTime` is re-anchored to the resume point so the jump back up from 0 is not counted as time heard. `waitForMetadata` rejects on the element's `error` event rather than only resolving on `loadedmetadata`, so a swap that cannot happen surfaces as a toast instead of pinning the player on "loading" forever.

---

**Function:** `barsFromPeaks()` / `QUIET_TRACK_CEILING` — `frontend/src/components/NowPlaying.tsx`
**Date:** 2026-09-10
**How added:** change
**Purpose:** turn the server's stored peaks into the bar heights the phone scrubber draws.
**Side effects:** none — pure, called during render.
**Before:** divided each bar by 255, the magnitude of a full-scale sample. Honest and unreadable: this library peaks around 80, so every waveform drew in the bottom third of the scrubber — flatter than the random `placeholderHeights` fallback it replaces, which is the wrong way round.
**After:** scales each track to its own loudest bar, capped by a ceiling that rises with the track's actual loudness (`QUIET_TRACK_CEILING + (1 - QUIET_TRACK_CEILING) * loudest`, floor 0.55). A full-scale track may fill the height; a near-silent one may not pass 0.55, so quiet still reads as quiet. Guards `loudest === 0` so an all-silent track draws the existing 0.06 line instead of dividing by zero. Stored peaks stay absolute — the decision is about drawing, not about data, so no migration or re-decode. Measured track: 31% → 69% of height.

---

**Function:** `getOrCreate` / `cacheEntryName` / `evictIfOversized` / `cacheSizeBytes` — `backend/src/services/transcodeCache.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** keep converted copies of tracks on disk so a converted track is an ordinary file.
**Side effects:** writes and deletes under `TRANSCODE_PATH`; holds a module-level in-flight map; drives ffmpeg through `encodeToFile`.
**Before:** nothing. `?quality=low` was a live encode with no length, so it could not be range-served, revalidated or seeked, and it re-encoded on every single play.
**After:** `cacheEntryName` names an entry from source size + mtime + variant id — the same pair the `ETag` trusts to mean "different file", so a replaced source misses and the stale entry ages out with no invalidation step to forget. `getOrCreate` returns a hit or produces one, deduping concurrent cold requests through an in-flight map (`waveform.ts` solves the identical race identically) and committing via temp-then-`rename`, which is atomic within a directory: a reader finds a whole file or none, never a truncated one that looks finished. That guard matters more here than usual, since transcodes are SIGKILLed on client disconnect by design. `evictIfOversized` drops least-recently-used entries after a write — the only moment the cache grows, so no timer is needed — reading mtime, which `getOrCreate` touches on every hit so it means "last used". It only ever considers names matching this module's own pattern, so pointing `TRANSCODE_PATH` at a shared directory cannot cost a stranger their files.

**Function:** `encodeToFile` / `LOW_QUALITY_VARIANT` / `REMUX_M4A_VARIANT` / `NoTranscodeSlotError` — `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** new feature (replacing `transcodeToLowQuality`)
**Purpose:** produce a complete converted file, and describe the two conversions worth keeping.
**Side effects:** spawns ffmpeg; holds a transcode slot for the whole encode.
**Before:** `transcodeToLowQuality` returned a live stream that had to be killed by hand and could never be range-served.
**After:** `encodeToFile` resolves when the file is complete, holding a slot throughout so the same ceiling bounds cache fills as bounded live transcodes, and deleting whatever ffmpeg left behind on failure. `LOW_QUALITY_VARIANT` is the 64k Opus data-saver copy. `REMUX_M4A_VARIANT` uses `-c:a copy`, so it is a container change and not a re-encode — it exists because raw ADTS reports a duration ~50% long to both ffprobe and Chrome, which makes the seek bar lie. `NoTranscodeSlotError` is a distinct type so the route can answer 503 rather than failing obscurely. The live-stream path and its `?t=` offset parser were removed as unreachable.

**Function:** `variantFor` — `backend/src/routes/tracks.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** decide whether a request should be served a converted copy, and which.
**Side effects:** none — a pure decision over the track row and the query.
**Before:** the route branched on `quality === 'low'` alone, so it converted unconditionally and never remuxed anything.
**After:** two independent reasons to convert. Data saver only when the source is far enough above the target to pay for a second lossy generation — a strict "above 64k" test would re-encode a 121 kbps Opus file for a measured 36% saving, so the floor is 1.5x target and an unknown bitrate converts rather than guesses. And raw `.aac` always, regardless of quality, because it has no reliable duration until it is in a real container.

---

**Function:** `config.maxUploadSizeMb` — `backend/src/config.ts`
**Date:** 2026-09-10
**How added:** change
**Purpose:** cap the size of a single uploaded file.
**Side effects:** read once when `@fastify/multipart` is registered, so it takes effect at app build, not per request.
**Before:** 100 MB, which predates the library accepting FLAC and WAV. A single hi-res FLAC exceeds it, so the upload route would have rejected two of the seven formats the scanner had just been taught to accept.
**After:** 1024 MB. Reasonable only because `POST /tracks/upload` is admin-only — the ceiling guards against a slip, not an attacker. Two non-obvious consequences are documented at the constant: the web client uploads 3 concurrently, so staging can hold ~3× this at once, and any reverse proxy in front has its own body limit that must be raised to match or it rejects first. The rejection path gained its first tests (`routes/upload.test.ts`), built against a 1 MB ceiling so they cost milliseconds instead of a gigabyte of I/O.

---

**Function:** `AUDIO_EXTENSIONS` / `MIME_TYPES` — `backend/src/services/trackTags.ts`, `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** decide what the library will ingest, and what content type it is served as.
**Side effects:** none — both are constants, but they gate the scanner, the upload route and the stream route.
**Before:** five extensions: `.flac`, `.opus`, `.mp3`, `.m4a`, `.ogg`. A `.wav` or `.aac` in the library was walked past in silence, and `mimeTypeFor` answered `application/octet-stream` for both.
**After:** seven, adding `.wav` and `.aac`. Nothing else needed changing — `music-metadata` and ffmpeg both handle the new pair — but that was verified against real fixtures rather than assumed, and the verification found the thing that matters: raw ADTS reports its duration as 37.9 s where frame-scanning gives 25.0 s, so the two must not be served raw once the transcode cache exists. The two constants also gained a test that walks `AUDIO_EXTENSIONS` and fails when an accepted extension has no MIME type, because the sets drift apart silently and the symptom is a format the scanner ingests but the browser downloads instead of playing.

---

**Function:** `parseStreamOffset` / `transcodeToLowQuality` — `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** start a data-saver stream partway into a track.
**Side effects:** `transcodeToLowQuality` spawns ffmpeg; `parseStreamOffset` is pure.
**Before:** the transcoded path had no length and no byte ranges, so there was no way back into the middle of a track — the scrubber was dead and a reconnect restarted the song.
**After:** `transcodeToLowQuality` takes an options object (`{ offsetSeconds, onError }`) and applies the offset with `.seekInput()`, which puts `-ss` *before* `-i` so ffmpeg jumps to the nearest packet rather than decoding and discarding everything ahead of it. `parseStreamOffset` validates `?t=`: absent is 0, negative and non-numeric and at-or-past-the-end are `'invalid'` — rejected rather than clamped, because silently starting somewhere the caller did not ask for makes the scrubber lie about where playback is. A null duration does not reject, since the scanner leaves it empty on files it could not measure. Verified byte-identical against a locally-seeked reference.

---

**Function:** `LibraryPage` / `buildQuery` — `frontend/src/pages/LibraryPage.tsx`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** let someone see, and act on, tracks whose file is gone.
**Side effects:** none beyond the query it issues.
**Before:** the backend filter existed but nothing reached it — the 11 dead rows on the real library were unreachable except by hand-editing a URL.
**After:** a fourth select in the existing filter row (**Playable only** / **All (incl. missing)** / **Missing only**), same three-way vocabulary and same control class as the `hidden` and `notRecommended` filters beside it, defaulting to `exclude` to match the server. Changing it resets to page 1, as the search box does. A red `badge-danger` marks a missing row — `hidden` and `not recommended` are choices someone made and stay neutral/caution, while this is a fault. The row's play button is disabled with an explaining `title`, and playing a good row builds its queue from playable tracks only: without that, "All (incl. missing)" would hand the player a queue that stalls on a `500` partway through. Verified in real headless Chromium against the live library — 19 / 11 / 30 rows across the three settings, 11 badges, 11 disabled play buttons and none enabled under "Missing only", no page errors.

**Function:** `TrackDetailDrawer` diagnostics — `frontend/src/components/TrackDetailDrawer.tsx`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** say whether a track's file is actually there.
**Side effects:** none.
**Before:** the drawer showed `Last stream error`, which only fills in after someone has already tried to play a dead track.
**After:** a **File on disk** row reading `Missing since <date>` in red, or `Present`. Backed by `missingSince` on the track detail shape. It is the proactive counterpart to the error row: one says "this failed once", the other says "this will fail".

---

**Function:** `nullabilityClause` / `buildTrackFilter` / `countArtists` / `listArtists` / `countAlbums` / `listAlbums` / `getAlbumDetail` / `getArtistDetail` / `searchWithFts` / `searchWithLike` — `backend/src/db/browse.ts`
**Date:** 2026-09-10
**How added:** change
**Purpose:** keep tracks whose file is gone out of every listing that offers something to play.
**Side effects:** none — read paths only.
**Before:** a flagged track still appeared in the library table, its album, its artist page and search results, and clicking it was a `500`. Albums and artists with nothing playable left still occupied the grid.
**After:** `nullabilityClause` is the counterpart to `visibilityClause` for a column that stores a date rather than a flag — "present" is `IS NULL`, not `= 0`. `buildTrackFilter` excludes missing tracks by default and honours `missing: 'only' | 'all'`, matching the vocabulary `hidden` and `notRecommended` already use, so an admin finds them in the ordinary listing rather than a separate screen. The artist and album summary selects now join tracks with the missing filter applied, so their counts describe what a listener can actually play, and the list/search call sites add `HAVING COUNT(DISTINCT t.id) > 0` so an emptied artist or album drops out entirely. Counts changed alongside their lists — a total the list can never reach is exactly the pagination bug `buildTrackFilter`'s own comment warns about. `getArtistDetail` and `getAlbumDetail` still resolve by id and simply come back empty: filtering a grid is one decision, 404-ing a URL someone already holds is a worse one. Playlists, favorites and play history are untouched on purpose — see the changelog entry.

**Function:** `listTopTracks` / `countTopTracks` — `backend/src/db/plays.ts`
**Date:** 2026-09-10
**How added:** change
**Purpose:** rank the most-played tracks.
**Side effects:** none.
**Before:** a track that was played a lot and then lost its file stayed at the top of the chart, unplayable.
**After:** both exclude `missing_since IS NOT NULL`, together, so the count and the list agree. `listHistoryForUser` / `listHistoryForTrack` were deliberately left alone: history records what happened, and hiding a play that genuinely occurred would be falsifying the log rather than tidying it.

---

**Function:** `reconcileMissingTracks` / `pathIsMissing` — `backend/src/services/scanner.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** reconcile the database against the filesystem — flag tracks whose file has gone, clear ones that came back.
**Side effects:** stats every track path (32 at a time); writes `tracks.missing_since`.
**Before:** nothing watched for drift. A row pointing at a missing file was invisible until someone pressed play and got a `500`; eleven of the thirty rows in the real database were in that state.
**After:** marks, never deletes — those rows carry favorites and playlist entries for files that may still exist in a backup. `pathIsMissing` treats **only** `ENOENT` as missing: a permissions or I/O error means the file may well be there and we simply cannot see it, and marking on that would turn a mount hiccup into a library of false gravestones. The guard is the substance of the function: a library root that has not mounted looks exactly like a deleted library, so the sweep refuses and changes nothing when the root is unreadable, or when a single sweep would newly condemn both more than `abortRatio` of the library and at least three tracks. The floor exists because a pure ratio protects small libraries into uselessness — one file out of two is 50% — and being wrong below it is cheap, since the flag is reversible. Only newly-missing rows count toward the ratio, or a library that once lost half its files could never record the next deletion.

**Function:** `syncLibrary` / `startLibrarySyncSchedule` / `describe` / `isLibrarySyncRunning` — `backend/src/services/librarySync.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** run scan and reconciliation on a timer, and keep two of them from running at once.
**Side effects:** spawns nothing, but drives the scanner, which writes a row per file; holds a module-level in-progress flag.
**Before:** nothing — scanning happened only when an admin pressed the button.
**After:** reconciliation at boot (cheap: one stat per track) and a full scan every `libraryScanIntervalHours`. The full walk is deliberately not run at startup, because `tsx watch` restarts on every save in development. A second caller while a sync is in flight is turned away rather than queued — the run already going is about to answer the same question, and two of them upserting the same paths is worse than waiting. Failures are logged and the schedule continues, on the same reasoning as backups: a server that stops serving music because it could not walk a directory has traded a small problem for a large one.

**Function:** `listTrackPaths` / `markTracksMissing` / `clearTracksMissing` / `countMissingTracks` / `listMissingTracks` — `backend/src/db/library.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** read and write the `missing_since` flag added by migration `0010`.
**Side effects:** `markTracksMissing` / `clearTracksMissing` write, each in one transaction.
**Before:** nothing — the column did not exist.
**After:** `markTracksMissing` stamps only rows where `missing_since IS NULL`, so re-running a sweep cannot push the date forward and make a months-old absence look like today's. `clearTracksMissing` also clears `last_stream_error`, since a file that has come back should not keep showing the error from when it was gone. `listMissingTracks` orders oldest-absence-first — it is a worklist, not a log.

**Function:** `POST /library/scan` / `GET /library/missing` — `backend/src/routes/library.ts`
**Date:** 2026-09-10
**How added:** new endpoint + change
**Purpose:** run a sync on demand, and list the rows whose files are gone.
**Side effects:** the scan writes a row per file and reconciles.
**Before:** `POST /library/scan` called `scanLibrary` directly, with no reconciliation and nothing stopping two from overlapping.
**After:** both go through `syncLibrary`, so a scan arriving while one is running gets `409` instead of racing it. The response keeps the old `ScanSummary` shape at the top level with `reconcile` alongside, so existing callers are unaffected. `GET /library/missing` is admin-only and returns the flagged rows plus the current `libraryPath` — without it the list is hard to read, since the interesting case is rows pointing at a root the server no longer uses.

---

**Function:** `transcodeToLowQuality` — `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** bug fix + hardening
**Purpose:** produce the low-bitrate Opus stream for the data-saver path, and give the caller a way to stop it.
**Side effects:** spawns ffmpeg; holds one of a fixed number of module-level transcode slots.
**Before:** returned a bare `NodeJS.ReadableStream` and discarded the ffmpeg command, so nothing could kill it. ffmpeg writes to a pipe, so an abandoned transcode did not die on its own — the pipe filled, ffmpeg blocked in `write`, and the process survived until the server restarted. One skipped track, one stranded process. There was also no ceiling: N clients meant N full-rate decodes on the machine serving the app.
**After:** returns a `TranscodeSession` (`{ stream, stop }`) or `null` when every slot is busy. `stop()` is idempotent, releases the slot, and SIGKILLs — not SIGTERM, because a process blocked writing to a full pipe is the case this exists to clean up and does not reliably act on a catchable signal there. The kill is re-issued on ffmpeg's `start` event if a stop already landed: spawning is asynchronous, so a stop arriving first has nothing to signal and would otherwise orphan the process that spawns a moment later. Returning `null` rather than falling back to the original file is deliberate — the caller asked for the small copy for a reason.

**Function:** `buildETag` / `isNotModified` / `ifRangeAllowsRange` — `backend/src/services/streaming.ts`
**Date:** 2026-09-10
**How added:** new feature
**Purpose:** let a client revalidate a cached track instead of re-downloading it, and keep a resumed range honest.
**Side effects:** none — pure functions over headers and `stat` output.
**Before:** nothing. The stream endpoint sent no validators at all, so every replay of a song was a full re-download.
**After:** `buildETag` derives a **strong** tag from size + mtime (the nginx pair). Strong matters: a weak tag may not validate an `If-Range`, so a weak one would have quietly disabled resumable seeking. `isNotModified` implements RFC 9110 precedence — `If-None-Match` decides alone when present, weakly compared; `If-Modified-Since` is consulted only in its absence and compared at whole seconds, since HTTP dates carry no sub-second part and a file written 400 ms later must not read as newer. `ifRangeAllowsRange` gates the range: absent means the client claimed nothing and the range stands; a mismatch means the file changed underneath, and splicing new bytes onto old ones would hand the decoder a corrupt stream disguised as a successful `206`.

**Function:** `getHealthSnapshot` / `resetStreamMonitor` — `backend/src/services/streamMonitor.ts`
**Date:** 2026-09-10
**How added:** bug fix
**Purpose:** report whether the streaming path is currently healthy.
**Side effects:** none; `resetStreamMonitor` clears module state and exists for tests.
**Before:** `status` was `degraded` whenever the error ring was non-empty, and the ring is only trimmed by length — so a single missing file at boot left the server reporting degraded permanently, which carries the same information as reporting nothing.
**After:** the verdict expires fifteen minutes after the last error; the errors stay listed, because the history is the useful part of a diagnostics page. Takes an optional `now` so the window is testable without waiting for it. Also reports `activeTranscodes`, so the new concurrency ceiling is observable rather than inferred.

**Function:** `GET /tracks/:id/stream` — `backend/src/routes/tracks.ts`
**Date:** 2026-09-10
**How added:** bug fix + hardening
**Purpose:** serve audio bytes.
**Side effects:** reads from disk; may spawn ffmpeg; moves the active-stream gauge.
**Before:** no cache validators, so every play refetched the whole file. Transcodes were started and never stopped. `streamStarted()` fired before the `416` check, so a rejected range counted as a stream.
**After:** the direct path sends `ETag`, `Last-Modified` and `Cache-Control: private, max-age=86400`, answers `304` to a matching validator, and drops a `Range` whose `If-Range` no longer matches rather than serving a spliced `206`. A day, not a week: long enough for an evening of listening and every seek inside a track, short enough that replacing a file cannot keep serving the old rip — and the media token in the URL rotates every two hours anyway, so a longer window buys little. The data-saver path takes a slot or returns `503` + `Retry-After`, sends `no-store` (its length is unknown until the encode ends, so there is nothing to validate against), and calls `session.stop()` on response close. The stream gauge now moves only for responses that actually carry audio.

---

**Function:** `computePeaks` / `peaksForTrack` / `decodePeaks` — `backend/src/services/waveform.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** turn an audio file into 128 peak amplitudes for the player's scrubber.
**Side effects:** spawns ffmpeg; writes `tracks.waveform`; holds a module-level map of in-flight decodes.
**Before:** nothing. The scrubber drew a shape hashed from the track id — stable, but not the audio.
**After:** ffmpeg decodes to mono 16-bit PCM and the stream is reduced to byte-ranged peaks. Three decisions carry it. **44.1 kHz**, which looks wasteful for 128 buckets and is not: resampling lowpasses on the way down and the peak of a lowpassed signal is not the peak of the signal — a full-scale 5 kHz tone measures `0.9998` at 44.1 kHz and `0.059` at 1 kHz, so a cheap decode drew anything bright as near-silent. **Buckets sized from the stored duration**, so memory is flat however long the track is; the alternative, buffering the decode to count samples first, costs tens of megabytes on a long mix, and overflow folds into the last bucket so a short duration gives a hot final bar rather than a truncated waveform. **Failures are not cached** — the usual cause is a file mid-copy or moved, and both fix themselves. `peaksForTrack` dedupes concurrent decodes of the same track, because opening the player and reloading it otherwise race to write the same row.

**Function:** `GET /tracks/:id/waveform` — `backend/src/routes/tracks.ts`
**Date:** 2026-09-09
**How added:** new endpoint
**Purpose:** serve the scrubber its peaks.
**Side effects:** first call for a track decodes the file and writes the row.
**Before:** n/a.
**After:** returns `{ peaks: number[] }`, 0-255, or 404 when a track cannot be analysed — a placeholder case for the client, not an error worth showing anyone. Cached a day at the client, since peaks only change if the file does and a changed file is a new scan.

**Function:** `NowPlaying` / `barsFromPeaks` / `placeholderHeights` — `frontend/src/components/NowPlaying.tsx`
**Date:** 2026-09-09
**How added:** new component
**Purpose:** a full-screen player for phones.
**Side effects:** two queries per track (detail, waveform).
**Before:** the bar was desktop-only markup with no breakpoints — on a phone it squeezed transport, scrubber, title and queue position into one strip.
**After:** takes the player context as a **prop** rather than calling `usePlayer`, which would make this file and `PlayerBar` import each other at runtime; the provider builds the value once and passes the same object to both. `barsFromPeaks` downsamples 128 → 44 by **maximum** per span, not average — averaging pulls everything toward the middle and flattens exactly the transients that make a waveform recognisable. `placeholderHeights` survives as the pending/unavailable state, still hashed from the track id so a shape that cannot be drawn stays put instead of reshuffling every render, which would read as broken rather than as loading.

**Function:** `PlayerProvider` — mobile split and session teardown — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-09
**How added:** change
**Purpose:** one player, two presentations; and playback that belongs to a session.
**Side effects:** `stop()` now also closes the expanded view.
**Before:** one fixed bar at all widths. The provider sits above the router, so the queue survived logout — the bar kept playing the previous user's library over the login screen.
**After:** below `md` the bar is a tappable strip that opens `NowPlaying`; the desktop bar is unchanged behind `md:block`. An effect tears the audio down whenever there is no user, which covers a token expiring as well as an explicit log out, and the bar is not painted without one so it cannot flash in the render before the queue clears. `stop` became a stable callback so that effect can depend on the session rather than re-firing every render. `goTo` moved onto the context — it already existed internally, and exposing it is what lets a queue row jump to its track.

**Function:** `BrandMark` / `Wordmark` / `BrandLockup` — `frontend/src/components/BrandLockup.tsx`
**Date:** 2026-09-09
**How added:** new component, then split
**Purpose:** one brand lockup, composed per surface.
**Side effects:** none.
**Before:** an orange rounded square with a `b` in it, duplicated between the auth pages and the app header.
**After:** a ringed mark and a two-tone wordmark, exported separately so each surface composes them in its own colours — the auth pages keep the hero version on white, the header assembles a 28px one on navy. Drawn in markup rather than imported as an image: it is two circles and a line of type, so an SVG would only cost a request and go fuzzy when scaled. The dot stays orange in both, being the one accent that reads on either ground.

**Function:** `WordmarkColumn` — `frontend/src/components/WordmarkColumn.tsx`
**Date:** 2026-09-09
**How added:** extracted from `TitleScreenPanel`
**Purpose:** the wordmark set on its side, climbing forever.
**Side effects:** none.
**Before:** inline in the title screen, sized for that panel only.
**After:** shared by the login panel at poster scale and the app frame as ambient gutter texture. Pass length is in **beats**, not seconds, so every column shares the `--beat` clock with the rest of the screen. Renders two copies and shifts by exactly one, so the loop seam lands on an identical frame whatever the type happens to measure — the earlier version forced each block to be panel-height, which is why the type had to leave headroom.

**Function:** `backupDatabase` / `pruneBackups` / `listBackups` / `startBackupSchedule` — `backend/src/services/backup.ts`
**Date:** 2026-09-09
**How added:** new feature (roadmap step 14)
**Purpose:** keep recoverable copies of the only irreplaceable data in the project.
**Side effects:** writes and deletes files under `config.backupPath`; opens a second connection to each new backup file to verify it.
**Before:** nothing. A corrupt database, a bad migration or an `rm` meant losing playlists, favorites and play history permanently.
**After:** a verified backup at server start and every 24h, retaining 14. Three decisions carry the module: SQLite's **online backup API** rather than a file copy, because WAL mode makes `cp` capable of producing a database that opens fine and is missing recent writes; **`journal_mode = delete` on the copy**, so each backup is one self-contained file rather than a `.db` plus sidecars that retention never pruned and that corrupt a restore if a stale one is left behind; and **`integrity_check` before the backup counts**, because an unread backup is a guess. Pruning matches only this module's filename pattern, so a shared `BACKUP_PATH` cannot lose a stranger's files. Failures log and continue — refusing to serve music because a backup failed trades a small problem for a large one.

**Function:** `isRegistrationOpen` — `backend/src/routes/auth.ts` (+ `config.allowOpenRegistration`)
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** decide whether an anonymous caller may create an account.
**Side effects:** none; read by both `/auth/registration-status` and the `/auth/register` preHandler so the two can never disagree.
**Before:** the gate was `countUsers() === 0` inline in two places — registration was admin-only except for the bootstrap account.
**After:** `config.allowOpenRegistration || countUsers() === 0`, the env var defaulting to open. The empty-table clause is not a policy choice but a deadlock break: admin-only registration plus no admin has no way out. `/auth/registration-status` now also returns `firstAccount`, because "claim this server and become admin" and "sign up as a listener" are different yeses and the pages must not promise the wrong one. Read at call time, not import time, so tests can pin it.

**Function:** `POST /auth/register` validation — `backend/src/routes/auth.ts`
**Date:** 2026-09-09
**How added:** hardening
**Purpose:** stop trusting the browser once anyone can reach the endpoint.
**Side effects:** none.
**Before:** only presence of `username`/`password` was checked; the 8-character floor lived in the React form.
**After:** enforces `MIN_PASSWORD_LENGTH` and `USERNAME_PATTERN` (`[A-Za-z0-9._-]{2,32}`) server-side, returning 400. With open registration the form is no longer a gate.

**Function:** `POST /library/scan` — `backend/src/routes/library.ts`
**Date:** 2026-09-09
**How added:** hardening
**Purpose:** keep a disk-walking operation out of reach of strangers.
**Side effects:** none beyond the scan itself.
**Before:** `preHandler: fastify.authenticate` — any signed-in account could trigger a full library scan.
**After:** `[authenticate, requireAdmin]`. Harmless while every account came from an admin; with open sign-up it was a free way to hammer the server. Surfaced by a test asserting self-serve accounts hold no admin powers.

**Function:** `PlayIcon` / `PauseIcon` / `SkipBackIcon` / `SkipForwardIcon` — `frontend/src/components/icons.tsx`
**Date:** 2026-09-09
**How added:** new feature (bug fix)
**Purpose:** replace text glyphs that the system emoji font was rendering as coloured tiles.
**Side effects:** none.
**Before:** `⏮ ▶ ❚❚ ⏭` as text. U+23EE/U+23ED default to emoji presentation, so they ignored `text-*` colour and sized themselves off font metrics rather than the button box.
**After:** inline SVG on a 24 viewBox, `fill="currentColor"`, sized by the caller — so hover and disabled states come from the button. Used in the player bar and the six other places the `▶` glyph appeared.

**Function:** `usersRoute` — `backend/src/routes/users.ts` (+ `listUsers`, `countAdmins`, `setAdminById`, `setPasswordHashById`, `deleteUser` in `db/users.ts`)
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** admin user management from the browser instead of SSH and a CLI script.
**Side effects:** writes to `users`; deleting a user cascades to their favorites, playlists and play history.
**Before:** roles and passwords could only be changed by running `npm run set-admin` / `set-password` on the server.
**After:** `GET /users`, `PATCH /users/:id` (role and/or password), `DELETE /users/:id`, all admin-gated. **Two guards are the point of the module**: demoting or deleting the last admin returns 409, and you cannot delete yourself — otherwise an admin can lock the installation out of user management from a browser, recoverable only from a terminal. Account *creation* deliberately stays on `POST /auth/register` so there is one path that makes a user.

**Function:** `GET /auth/registration-status` — `backend/src/routes/auth.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** let the signup page know whether it may act.
**Side effects:** none.
**After:** returns `{ open }`, true only while the user table is empty. Unauthenticated by necessity — the page has to ask before anyone can log in. The one bit it leaks ("has this server been set up") isn't worth protecting.

**Function:** `SignupPage` / `UsersPage` — `frontend/src/pages/`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** create accounts without a terminal.
**Before:** nothing — the login page just said "ask an admin".
**After:** `SignupPage` branches on the server's registration status rather than guessing, and signs the new owner straight in. `UsersPage` creates via `/auth/register` then optionally `PATCH`es admin, so creation has a single code path. Both surface the server's 409 lockout guards as ordinary toasts.

**Function:** `getDb()` / `isDatabaseOpen()` / `closeDb()` and the `db` proxy — `backend/src/db/connection.ts`
**Date:** 2026-09-09
**How added:** changed
**Purpose:** stop importing a module from opening a database.
**Side effects:** `getDb()` creates the parent directory, opens the handle and sets WAL — on first call, not on import.
**Before:** `export const db = new Database(config.dbPath)` ran at module scope, so any import that transitively reached `db/` created and touched whatever `DB_PATH` pointed at. That is the shape of both filesystem incidents this project has had.
**After:** a `Proxy` resolves every property through `getDb()`, so the ~90 `db.prepare(...)` call sites are unchanged. Methods are bound to the real handle — better-sqlite3 breaks with a detached receiver. `isDatabaseOpen()` exists so a test can assert the deferral rather than assume it.

**Function:** `recordScrobble()` — `backend/src/db/plays.ts`
**Date:** 2026-09-09
**How added:** changed
**Purpose:** same behaviour, without opening the connection at import.
**Before:** `export const recordScrobble = db.transaction(...)` evaluated at module scope, which opened the handle as a side effect of importing the file — defeating the lazy connection for everything downstream.
**After:** the transaction is built on first call and memoised. Behaviour is identical; only the timing changed.

**Function:** `POST /auth/register` gate — `backend/src/routes/auth.ts` (+ `countUsers()` in `db/users.ts`)
**Date:** 2026-09-09
**How added:** changed (breaking for anonymous callers)
**Purpose:** close an endpoint that let anyone with network access create an account.
**Side effects:** the bootstrap account is promoted to admin.
**Before:** no `preHandler` at all.
**After:** admin-only, except while the user table is empty — that first request is allowed and its account made an admin, because otherwise a fresh install can never create one. The preHandler is composed by hand since the gate is conditional, and uses `request.user` rather than `reply.sent` to detect that `authenticate` already answered: calling `requireAdmin` after a sent 401 would attempt a second reply.

**Function:** `registerSpa()` — `backend/src/plugins/spa.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** serve the built web app from the API's own origin, so the container is useful by itself.
**Side effects:** registers `@fastify/static` and replaces the not-found handler. No-op when `FRONTEND_PATH` is unset or has no `index.html`, which is local dev.
**Before:** the backend was API-only; the SPA needed separate hosting.
**After:** static files plus an `index.html` fallback for client-side routes — but only for `GET` requests whose `Accept` includes `text/html`. An API call that 404s still receives JSON, because a `fetch()` handed an HTML page instead of `{ error }` fails in a far more confusing way. Registered after every API route so it only sees what nothing else claimed.

**Function:** API route registration — `backend/src/app.ts` (`API_PREFIX`)
**Date:** 2026-09-09
**How added:** changed (breaking)
**Purpose:** stop the API and the web app fighting over the same URLs.
**Before:** routes were registered at the root, so `/albums`, `/artists`, `/playlists`, `/search` and `/health` existed in both the API and the SPA. The API answered first, and a browser navigating to `/albums` got 401 JSON instead of the page.
**After:** all API routes register inside one child context with `{ prefix: '/api' }`. Fastify decorators (`authenticate`, `requireAdmin`) propagate into the child scope, so nothing else changed. Callers updated: the frontend's `API_BASE_URL`, the container `HEALTHCHECK`, `api.test.ts`, and the three legacy `*.html` pages.

**Function:** `makeTempDir()` / `resetDatabase()` / `assertIsolatedEnvironment()` — `backend/src/testing/harness.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** make it structurally impossible for a test to touch real data.
**Side effects:** `resetDatabase()` migrates once per process then empties every table, children first (FKs are enforced). `assertIsolatedEnvironment()` throws — and runs on import, so a suite cannot forget it.
**Before:** nothing. Test isolation depended on remembering to run `npm test`; on 2026-09-09 that assumption failed and deleted the owner's music library.
**After:** `npm test` points DB_PATH/LIBRARY_PATH/ARTWORK_PATH/UPLOAD_STAGING_PATH at `backend/.test-tmp/`, and the harness refuses to load if any of them points elsewhere. `makeTempDir()` returns a directory and its cleanup so tests delete only what they created — the rule is that a test never removes a path it did not make.

**Function:** `runMigrations()` — `backend/src/db/migrator.ts`
**Date:** 2026-09-09
**How added:** extracted from `db/migrate.ts`
**Purpose:** apply pending migrations, callable in-process.
**Side effects:** writes to `schema_migrations` and executes migration SQL.
**Before:** the logic lived as top-level statements in `migrate.ts`, so the only way to run it was to execute that file.
**After:** `migrate.ts` is a thin CLI over it, and the test harness builds a schema without shelling out. `silent` suppresses per-migration logging, since the harness calls it before every suite. Returns the list of newly applied files.

**Function:** `fileIntoLibrary()` / `scanLibrary()` — signature change
**Date:** 2026-09-09
**How added:** changed
**Purpose:** remove the implicit filesystem root.
**Before:** both read `config.libraryPath` internally, so what they touched depended on ambient environment. That is what let a test's `rm -rf` reach real data.
**After:** both take `libraryRoot` as their first parameter; `routes/tracks.ts` and `routes/library.ts` pass `config.libraryPath` explicitly. Now standing convention — see `.docs/CLAUDE.md`.

**Function:** `inspectJwtSecret()` / `formatSecretProblem()` — `backend/src/utils/secretPolicy.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** stop the server booting on a signing secret that isn't safe for a real deployment.
**Side effects:** none — pure. Called once from `src/index.ts`, which owns the `process.exit(1)`.
**Before:** `JWT_SECRET` silently fell back to `'change-me'`, a value committed to this repository.
**After:** returns `null` when the secret is fine, otherwise `{ summary, fatal }`. **Fails closed** — only `development` and `test` are lenient, so an unset `NODE_ENV` refuses rather than passes; that is the whole point, since `npm start` on an unconfigured host is the case being guarded. Rejects a secret under 32 characters as well as the default, because `JWT_SECRET=music` is equally compromised and merely looks configured. Takes the raw environment values rather than `config`, which has already applied the fallback and so cannot tell "unset" from "set to the default". Lives in `index.ts` rather than `config.ts` deliberately: `migrate` and the admin CLI scripts never sign a token, and blocking them would be a confusing failure with no benefit.

**Function:** `buildMatchQuery()` — `backend/src/utils/ftsQuery.ts`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** turn raw search-box input into an FTS5 MATCH expression, or say that the index can't answer it.
**Side effects:** none — pure. Deliberately imports nothing from `db/`, so it stays safe to unit-test (`db/connection.ts` opens the database at import time).
**Before:** nothing — search was a `LIKE '%x%'` scan with no query language to build for.
**After:** every term is wrapped in double quotes with embedded quotes doubled, so a typed `AND`, `NEAR/2`, `*`, `^` or `(` reaches the parser as text rather than syntax. Terms are ANDed, not concatenated into one phrase, so "beatles abbey" matches both anywhere. Returns `null` when any term is under 3 characters — the trigram floor — which is the caller's signal to fall back to LIKE rather than return nothing. Length is measured in code points, not UTF-16 units, so a two-emoji term counts as 2.

**Function:** `searchLibrary()` / `searchWithFts()` / `searchWithLike()` — `backend/src/db/browse.ts`
**Date:** 2026-09-09
**How added:** rewritten (was a LIKE scan)
**Purpose:** the `GET /search` backend.
**Side effects:** read-only.
**Before:** three `LIKE '%q%'` queries; tracks matched on title alone.
**After:** dispatches on `buildMatchQuery()` — FTS5 when the index can answer, the old LIKE path when it can't. Track results are ranked with `bm25(tracks_fts, 10.0, 5.0, 3.0)` so a title hit outranks an artist hit outranks an album hit; tracks therefore JOIN the index directly rather than using an `IN (...)` subquery, because ranking needs the auxiliary function over the matched rows. Artists and albums stay alphabetical — with at most 20 name matches, predictable beats ranked. The LIKE fallback now searches title/artist/album like the FTS path, so behaviour doesn't change with query length.

**Function:** `GlobalSearch` — `frontend/src/components/GlobalSearch.tsx`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** the header search box.
**Side effects:** navigates to `/search?q=…`.
**Before:** nothing. `GET /search` had existed since the backend landed with no caller.
**After:** submitting navigates rather than holding results in local state, so a search is a real URL — shareable, bookmarkable, survives a reload. The input mirrors `?q=` during render (compared against the last seen value rather than synced in an effect) so arriving from a link or the back button fills the box. `/` focuses it, ignored while typing in any field, matching the player's existing keyboard convention.

**Function:** `recordListenedTime()` / `scrobble()` / `scrobbleThresholdMs()` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-09
**How added:** new feature
**Purpose:** decide when a play counts, and tell the backend once it does.
**Side effects:** `POST /tracks/:id/scrobble`; invalidates the `['tracks']` and `['track', id]` caches so the new count reaches the screen.
**Before:** nothing called the scrobble endpoint. `play_history` and `tracks.play_count` had been collecting zeros since the backend landed.
**After:** progress lives in a ref (`progressRef`) rather than state, so the audio element's long-lived listeners see live values without re-binding on every `timeupdate` — the same reason the `ended` handler is bound the way it is. Time is accumulated from `timeupdate` deltas and any delta over `MAX_PLAYBACK_DELTA_SECONDS` (2s) is dropped as a seek, so skipping ahead can't fake a listen. Threshold is `min(duration / 2, 240s)`, re-derived on `loadedmetadata` because the scanner's duration can be missing or wrong. `scrobbled` is set **before** the request so a slow response can't double-count, and `load()` resets the whole ref so a repeat-one restart correctly counts as a second listen. Errors are swallowed on purpose — a lost statistic must never interrupt playback.

**Function:** `PlaylistDetailPage` reorder flow (`handleDrop` + `reorderMutation`) — `frontend/src/pages/PlaylistDetailPage.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** drag-to-reorder backed by `PATCH /playlists/:id/tracks/reorder`.
**Side effects:** optimistic write to the `['playlist', id]` cache, then the request; rollback on failure.
**Before:** nothing — playlists had no UI at all.
**After:** the order is held **only** in the TanStack cache. `handleDrop` computes the new id array from the cached list and hands it to the mutation, which writes it optimistically and rolls back on error. Deliberately no `useState` copy of the order: two sources of truth for the same list is exactly the bug this shape avoids. Uses native HTML5 drag events — `onDragOver` must call `preventDefault()` or the drop never fires, which is the usual trap. Verified by dragging with a real mouse and confirming the order after a reload, not just in the DOM.

**Function:** `AddToPlaylistDialog` — `frontend/src/components/AddToPlaylistDialog.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the only path for getting a track into a playlist — reached from the ⋮ menu on a library row.
**Side effects:** `POST /playlists` and/or `POST /playlists/:id/tracks`; invalidates playlist queries.
**Before:** nothing.
**After:** lists existing playlists, or creates one and adds the track in a single action. A 409 (already present) is caught by status and reported as "Already in that playlist" rather than surfaced as an error — the user's intent is satisfied either way.

**Function:** `listFavoriteTrackIdsForUser()` — `backend/src/db/favorites.ts` (+ `GET /me/favorites/ids`)
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** lets any view render favorite state without the browse endpoints carrying an `isFavorited` column.
**Side effects:** none — a single indexed read.
**Before:** nothing. A client could star and unstar, and list its favorites, but could not tell whether an arbitrary track was favorited without fetching the whole list.
**After:** ids only, so the payload stays small and one client-side cache entry serves the library table, album pages and the player bar. Chosen over adding `isFavorited` to six browse queries (invasive, needs a user id threaded through each) and over paging the full favorites list per view (wasteful, and wrong past the first page).

**Function:** `useFavoriteIds()` / `FavoriteButton` — `frontend/src/components/FavoriteButton.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the heart control and the shared favorite-state cache behind it.
**Side effects:** `PUT`/`DELETE /tracks/:id/favorite`; invalidates the ids and list queries.
**Before:** nothing — favorites had no UI.
**After:** every heart reads one query key, so toggling in the player bar updates the matching library row without a refetch. Optimistic with rollback; safe because both endpoints are idempotent. **The `enabled: Boolean(getToken())` guard is load-bearing** — the hook is called from `PlayerProvider`, which wraps the login route, so without it the query fires unauthenticated and `apiClient.request()` clears the stored token on the resulting 401.

**Function:** `storeArtwork()` / `thumbnailPathFor()` / `sendCover()` / `isValidArtworkId()` — `backend/src/services/artwork.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the cover-art cache — store embedded images, generate thumbnails, serve them with correct caching headers.
**Side effects:** writes under `ARTWORK_PATH`; `thumbnailPathFor` shells out to ffmpeg on a cache miss. Deliberately **no database access** — see the note below.
**Before:** nothing — the project had no artwork handling at all.
**After:** images are content-addressed (`<sha256>.<ext>`), so identical covers across an album's tracks collapse to one file and re-scans don't rewrite. Both writes are write-then-rename, so a concurrent reader never sees a partial file. `sendCover` uses the artwork id as the ETag — sound because the id *is* the content hash — and answers a matching `If-None-Match` with 304 without touching the disk. `isValidArtworkId` is the security-relevant one: ids come from the database but end up joined into a filesystem path, so the `<64-hex>.<ext>` shape is enforced rather than assumed.

**Function:** `persistArtwork()` — `backend/src/services/artworkIngest.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the one place both ingest paths (scanner, upload) store a cover and point the track — and, if unset, its album — at it.
**Side effects:** filesystem write plus two DB updates. Swallows its own errors: a cover that won't write shouldn't fail the import of a good audio file.
**Before:** briefly lived in `services/artwork.ts`.
**After:** moved into its own module so `artwork.ts` stays free of `db/` imports. That matters more than it looks: `db/connection.ts` opens the configured SQLite file **as an import side effect**, so a unit test importing anything in that chain opens the real database. The first version of `artwork.test.ts` did exactly that and checkpointed the live WAL away (no data lost, but it should never have happened). Verified after the split by comparing the database mtime across a full `npm test` run — unchanged.

**Function:** `CoverArt` — `frontend/src/components/CoverArt.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** renders a cover with a placeholder fallback, sized by the caller.
**Side effects:** mints/reuses a media token via `buildCoverUrl`.
**Before:** nothing — no artwork in the UI.
**After:** placeholder and image occupy the same box so a list doesn't reflow as covers resolve; a 404 (track has no art) is an expected outcome that renders the placeholder, not an error. State is stored as a single `{key, url, failed}` object compared against the current props during render, rather than reset synchronously inside the effect — that avoids the `set-state-in-effect` cascade the linter flags.

**Function:** `PlayerProvider` — `frontend/src/components/PlayerBar.tsx`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** the app's real player — queue, seek, transport, repeat, shuffle, keyboard control.
**Side effects:** owns one `Audio` element; `toggleShuffle()` issues `POST /shuffle`; each track change issues a media-token mint if the cached one is stale.
**Before:** `PreviewPlayerProvider` — one track at a time, play/pause/stop only, no queue and no seeking (it played a fully-downloaded blob).
**After:** `playQueue(tracks, startIndex)` enqueues a whole list; `ended` auto-advances, honouring repeat. Two implementation notes worth keeping: the `ended` handler is re-bound on `[queue, index, repeat]` rather than captured once at mount, otherwise it would advance using the values present when the player first rendered; and `originalQueueRef` holds the pre-shuffle order so un-shuffling restores it instead of leaving the queue permanently scrambled.

**Function:** `signMediaToken()` / `verifyMediaToken()` / `verifySessionToken()` / `tokenExpiresAt()` — `backend/src/services/token.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** a second, deliberately weaker credential type for URLs that a browser element loads on its own (`<audio src>`, and `<img src>` for cover art later), which cannot send an Authorization header.
**Side effects:** none — pure sign/verify over the existing `JWT_SECRET`.
**Before:** only `signToken()` existed, and verification was inlined in the `authenticate` decorator.
**After:** media tokens carry `scope: 'media'` and expire in `config.mediaTokenTtl` (default `2h` vs the session's `7d`). The scope is enforced symmetrically — `verifySessionToken` throws on any scoped token, `verifyMediaToken` throws on an unscoped one — so neither type can stand in for the other. That symmetry is the security property worth protecting: without it, a stream URL in a browser history or access log would be a full API credential. Covered by `services/token.test.ts`.

**Function:** `fastify.authenticateMedia` — `backend/src/plugins/auth.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** preHandler for `GET /tracks/:id/stream` — the one route a browser loads by URL alone.
**Side effects:** sets `request.user` exactly like `authenticate`.
**Before:** the stream route used `fastify.authenticate`, so playback from a browser required fetching the whole file as an authenticated blob first.
**After:** tries the bearer header first (Android and curl paths unchanged), then falls back to a `?token=` media token. Deliberately a *separate* decorator rather than a change to `authenticate` — only this route should ever accept a credential from a URL.

**Function:** `getMediaToken()` / `buildStreamUrl()` — `frontend/src/lib/apiClient.ts`
**Date:** 2026-09-08
**How added:** new feature
**Purpose:** builds a `<audio src>`-ready stream URL, caching the media token across tracks.
**Side effects:** issues `POST /auth/media-token` when the cache is cold or within a minute of expiry; `setToken()` clears the cache.
**Before:** `fetchStreamBlob()` downloaded the entire track and handed `<audio>` an object URL — no progressive streaming, no seeking, first note delayed by the full download.
**After:** `<audio>` fetches the URL itself, so the browser does byte-range streaming natively. Concurrent callers share one in-flight mint via `inFlightMediaToken` — without that, a list rendering many covers would fire a mint request per element.

**Function:** `cors` registration — `backend/src/app.ts`
**Date:** 2026-09-03
**How added:** bug fix
**Purpose:** allow `PATCH`/`PUT`/`DELETE` requests from a browser, not just `GET`/`POST`.
**Side effects:** none beyond the CORS preflight response headers.
**Before:** `app.register(cors, { origin: true })` — relied on `@fastify/cors`'s default `methods`, which is actually `'GET,HEAD,POST'` (not the full REST set, despite looking like it should be). Every `PATCH`/`PUT`/`DELETE` route (favorites, playlists, and the new track-management endpoints) was silently unusable from any real browser — curl-based testing never caught it since CORS is browser-enforced only.
**After:** `methods: ['GET','HEAD','POST','PUT','PATCH','DELETE']` set explicitly. Found via a real headless-Chromium `PATCH /tracks/:id` call failing with a CORS preflight error while building `TrackDetailDrawer`.

**Function:** `TrackDetailDrawer` save flow — `frontend/src/components/TrackDetailDrawer.tsx`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** the drawer's Tags-tab save button, via a TanStack `useMutation` wrapping `PATCH /tracks/:id`.
**Side effects:** on success, both `queryClient.setQueryData(['track', id], ...)` (so the drawer reflects the save immediately without a refetch) and `invalidateQueries({ queryKey: ['tracks'] })` (so `LibraryPage`'s list picks up the change) run together — missing either one would leave the drawer or the table showing stale data after a save.
**Before:** nothing — new component.
**After:** fields disable (not hide) when `!isAdmin`, matching the Interior spec's "still viewable, not editable" choice for non-admins.

**Function:** `fetchStreamBlob()` — `frontend/src/lib/apiClient.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** loads a track's audio for the preview player as an authenticated `Blob`, converted to an object URL by `PreviewPlayerBar` — not a direct `<audio src="...">` pointed at the stream endpoint.
**Side effects:** one `fetch()` per track with an `Authorization` header attached.
**Before:** nothing — new function. The Interior-phase plan had assumed `<audio src>` would work directly.
**After:** `<audio>` can't send custom headers, and this backend's `authenticate` decorator only reads the `Authorization` header (no `?token=` fallback — see `.docs/STATUS.md`'s prior test-harness notes). Blob-fetch avoids putting a bearer token in a URL. Trade-off: loses native HTTP range-request progressive streaming — the whole file downloads before playback starts, acceptable for this app's short spot-check use case.

**Function:** `AuthProvider` / `useAuth()` — `frontend/src/auth/AuthContext.tsx`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** app-wide auth state — `user` (including `isAdmin`), `login()`, `logout()`. On mount, if a token exists in `localStorage`, calls `GET /auth/me` to hydrate `user` rather than trusting a stale/decoded JWT payload.
**Side effects:** reads/writes `localStorage` (via `apiClient`'s `getToken`/`setToken`); a `401` from any request clears the stored token (`apiClient.ts`'s `request()`).
**Before:** nothing — new module.
**After:** `RequireAuth`/`RequireAdmin` (`auth/RequireAuth.tsx`, `auth/RequireAdmin.tsx`) both key off this context to gate routes.

**Function:** `uploadWithProgress()` — `frontend/src/pages/UploadPage.tsx`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** uploads one file to `POST /tracks/upload` with a per-file progress callback.
**Side effects:** one `XMLHttpRequest` (not `fetch` — `fetch` has no upload-progress event, which a per-file progress bar needs).
**Before:** nothing — new function.
**After:** `UploadPage`'s queue runs up to 3 of these concurrently; each result invalidates the TanStack Query `['tracks']` cache so `LibraryPage` picks up the new track without a manual refresh.

**Function:** `requireAdmin` decorator — `backend/src/plugins/auth.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** Fastify preHandler, composed after `authenticate` (`[fastify.authenticate, fastify.requireAdmin]`), gating `PATCH`/`DELETE /tracks/:id` and `POST /tracks/upload`.
**Side effects:** one `findUserById()` read per request — deliberately re-checks `is_admin` from the DB rather than trusting the JWT payload, so revoking admin takes effect on the next request instead of waiting for the token to expire.
**Before:** nothing — new decorator, `authenticate` was the only one.
**After:** `403 { error: 'Admin access required' }` for a non-admin; falls through silently for an admin (matches `authenticate`'s pattern of only replying on failure).

**Function:** `setAdmin()` — `backend/src/db/users.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** flips `users.is_admin` for a username. Backs `npm run set-admin -- <username> [false]` (`scripts/set-admin.ts`) — the only path to granting/revoking admin, deliberately no HTTP endpoint or UI (matches the "small fixed user list" auth model, `.docs/reference/tech-stack.md`).
**Side effects:** one `UPDATE`.
**Before:** nothing — new function.
**After:** n/a.

**Function:** `updateTrackFields()` — `backend/src/db/library.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** backs `PATCH /tracks/:id` — partial update of title/artist/album/trackNumber/hidden/notRecommended. Only builds `SET` clauses for fields actually present in the input, so a partial payload doesn't clobber untouched columns.
**Side effects:** artist/album renames go through the same `findOrCreateArtist`/`findOrCreateAlbum` resolution `upsertTrack()` uses, so a tag edit here behaves identically to a re-scan picking up a renamed artist — no divergent second code path.
**Before:** nothing — new function.
**After:** wired to `routes/tracks.ts`, `requireAdmin`-gated.

**Function:** `deleteTrackRow()` / `setLastStreamError()` — `backend/src/db/library.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** `deleteTrackRow()` backs `DELETE /tracks/:id` — removes the track row plus every dangling reference to it (`favorites`, `playlist_tracks`, `play_history`) in one `db.transaction`, in that order. Correction (2026-09-03): the original note here said this was needed because FKs "aren't enforced" — wrong. `better-sqlite3` enforces FK constraints by default per connection; none of these FKs cascade, so deleting dependents first is required or the final `DELETE FROM tracks` throws a constraint error. See `.docs/reference/database-schema.md`. `setLastStreamError()` persists a diagnostic message onto `tracks.last_stream_error`, called from the stream route on a failed stream.
**Side effects:** `deleteTrackRow()` does NOT touch the file on disk — the route handler unlinks it separately (fs concern, not DB), and only calls this after the unlink succeeds or the file was already gone.
**Before:** nothing — new functions.
**After:** `DELETE /tracks/:id` is `requireAdmin`-gated, hard delete, `204` on success.

**Function:** `buildTrackFilter()`, extended `listTracks()` / `countTracks()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03
**How added:** feature extension
**Purpose:** shared `WHERE`-clause + params builder for search (`LIKE` across title/artist/album)/hidden-filter/not-recommended-filter, used by both `listTracks()` and `countTracks()` so the paginated total always matches what the filtered page actually returned — a common source of drift when list and count queries build their filters separately.
**Side effects:** read-only. Sort column is resolved through an allowlist (`SORT_COLUMNS`), never string-interpolated from the raw query param.
**Before:** `listTracks(limit, offset)` — pagination only, fixed `ORDER BY title`; `countTracks()` — unfiltered total.
**After:** both take an optional `ListTracksOptions` (`search`/`sort`/`order`/`hidden`/`notRecommended`); `GET /tracks` exposes all five as query params. `hidden` defaults to excluding hidden tracks; `notRecommended` defaults to showing them (still visible/playable, only meant to be excluded from radio/shuffle logic, which doesn't exist yet).

**Function:** `getTrackDetailById()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03
**How added:** new feature
**Purpose:** backs the new `GET /tracks/:id` (this endpoint didn't exist before — the feature's Structure-phase doc had incorrectly assumed it did). Returns the full diagnostic set beyond the lean list-view summary: `trackNumber`, `fileSize`, `bitrate`, `sampleRate`, `playCount`, `dateAdded`, `lastPlayedAt`, `lastStreamError`.
**Side effects:** read-only.
**Before:** nothing — new function/endpoint.
**After:** n/a.

**Function:** `streamStarted()` / `streamEnded()` / `recordStreamError()` / `getHealthSnapshot()` — `backend/src/services/streamMonitor.ts`
**Date:** 2026-09-03
**How added:** new feature (new file)
**Purpose:** in-memory stream health tracking backing `GET /admin/health`. `streamStarted`/`streamEnded` maintain a live active-stream count (wired to the stream route via `reply.raw.on('close', streamEnded)`); `recordStreamError` appends to a capped ring buffer (last 20, returns the most recent 10); `getHealthSnapshot` derives `status: 'ok' | 'degraded'` from whether any errors are on record.
**Side effects:** none persisted — process-memory only, resets on restart. Deliberate: `.docs/features/library-management-interface/planning.md` called this "minimum viable," no ring-buffer table needed yet.
**Before:** nothing — new module. `GET /health` was a one-line `{ status: 'ok' }` stub with no instrumentation.
**After:** `GET /admin/health` (any authenticated user, not admin-gated — operational data, not identity/destructive-action territory) returns `{ status, uptimeSeconds, activeStreams, recentErrors }`.

**Function:** `starTrack()` / `unstarTrack()` — `backend/src/db/favorites.ts`
**Date:** 2026-09-03 (`cea7c8f`)
**How added:** new feature
**Purpose:** back `PUT`/`DELETE /tracks/:id/favorite` — star/unstar a track for the requesting user.
**Side effects:** `starTrack` is `INSERT OR IGNORE` into `favorites` (composite PK on `user_id, track_id`); `unstarTrack` is a plain `DELETE`. Both idempotent by design — starring an already-starred track or unstarring a non-favorited one is a silent no-op, not an error, matching a toggle-style UI rather than the stricter duplicate-rejection playlists use.
**Before:** nothing — new functions.
**After:** wired to `routes/favorites.ts`, both requiring auth. `404` only for a genuinely unknown/non-numeric track id, `401` unauthenticated.

**Function:** `countFavoritesForUser()` / `listFavoritesForUser()` — `backend/src/db/favorites.ts`
**Date:** 2026-09-03 (`cea7c8f`)
**How added:** new feature
**Purpose:** back `GET /me/favorites` — the caller's own favorites, most-recently-favorited-first, paginated.
**Side effects:** read-only. Reuses the existing lean track-summary shape (title/artist/album/duration/format) plus `favoritedAt`, same `{ total, limit, offset, ... }` envelope as `/tracks`/`/me/history`.
**Before:** nothing — new functions.
**After:** n/a. `isFavorited` inline on `GET /tracks`/etc. was deliberately not built here — deferred to a follow-up (see `.docs/features/favorites-starred-tracks/planning.md`).

**Function:** `smartShuffle()` — `backend/src/services/shuffle.ts`
**Date:** 2026-09-03 (`cea7c8f`)
**How added:** new feature
**Purpose:** reorder a list of `{ trackId, artistId }` so no two same-artist tracks land adjacent, unless one artist exceeds half the set (in which case it hits the mathematical minimum of forced adjacent pairs, `2×dominant - total - 1`, rather than leaving it to chance).
**Side effects:** none — pure function, no DB/HTTP dependency. Groups tracks by artist, greedily interleaves by always placing next from the largest remaining group that isn't the one just placed (the standard "reorganize string" algorithm). `artist_id IS NULL` tracks are grouped together as one bucket, not scattered as singletons. Input is pre-shuffled so within-group order and equal-size tie-breaks vary between calls.
**Before:** nothing — new function.
**After:** backs `POST /shuffle` (`routes/shuffle.ts`). Covered by a new unit test suite (`services/shuffle.test.ts`, Node's built-in test runner — first test infra in this repo) exercising balanced/skewed/single-artist/null-artist/empty-input cases and the exact-minimum-violation math.

**Function:** `getTrackSummariesByIds()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03 (`cea7c8f`)
**How added:** new feature
**Purpose:** batch-fetch lean track summaries for the `POST /shuffle` response.
**Side effects:** read-only, single `IN (...)` query — not N+1.
**Before:** nothing — new function.
**After:** paired with `findTracksByIds()` (`db/library.ts`, also new) which validates every requested `trackId` exists before shuffling; `404` with `{ missing: [...] }` on any unknown id.

**Function:** `extractTrackTags()` — `backend/src/services/trackTags.ts`
**Date:** 2026-09-03 (`6f7ae2e`)
**How added:** refactor (extracted from `services/scanner.ts`), needed so the new upload route and the scanner apply identical tag-fallback rules.
**Purpose:** read title/artist/album/year/track number/duration/codec via `music-metadata`, falling back to filename (title) and `"Unknown Artist"` on missing tags.
**Side effects:** none new — same `music-metadata` read as before, now in a shared location. The upload path passes the *original* client filename for the fallback, not the random staging name.
**Before:** tag reading was inlined directly in `scanner.ts`'s per-file scan loop, only reachable from the scan flow.
**After:** shared by `scanLibrary()` (scan) and the new `POST /tracks/upload` route, so scan and upload can never silently diverge on fallback behavior.

**Function:** `sanitizePathSegment()` / `fileIntoLibrary()` — `backend/src/services/trackFiling.ts`
**Date:** 2026-09-03 (`6f7ae2e`)
**How added:** new feature
**Purpose:** compute the on-disk destination for an uploaded track (`LIBRARY_PATH/<Artist>/<Album>/<filename>`) and write it there safely.
**Side effects:** `sanitizePathSegment()` is pure (strips invalid filesystem characters, trims trailing dots, falls back to "Unknown Artist"/"Unknown Album" on an empty result — this is what defangs a path-traversal attempt in an artist/album/filename). `fileIntoLibrary()` touches the filesystem: never overwrites an existing file (same-name collisions get a `(2)`, `(3)`, ... suffix), moves the staged file via `fs.rename` with an `EXDEV` (cross-filesystem) fallback to copy+delete.
**Before:** nothing — new functions. Uploaded files had no filing logic at all.
**After:** called from the `POST /tracks/upload` route handler after `extractTrackTags()` succeeds; verified manually with a path-traversal-style filename (`../../../../etc/passwd_style../../file.mp3`) which sanitized down to `file.mp3` and stayed inside the intended `Artist/Album/` folder.

**Function:** `POST /tracks/upload` route handler — `backend/src/routes/tracks.ts`
**Date:** 2026-09-03 (`6f7ae2e`)
**How added:** new feature
**Purpose:** accept a `multipart/form-data` single-file upload, validate it, tag it, and file it into the library.
**Side effects:** streams the incoming file to `UPLOAD_STAGING_PATH` under a server-generated `crypto.randomUUID()` name (client-supplied filename never trusted beyond its extension) via `@fastify/multipart` (new dep, registered in `app.ts` with `limits.fileSize` from `MAX_UPLOAD_SIZE_MB` and `limits.files: 1`). Deletes the staged file and returns `400` on an unsupported extension or a corrupt/unparseable file; deletes the partial file and returns `413` on an oversized upload (`file.truncated` flag). On success, calls `extractTrackTags()` → `fileIntoLibrary()` → the existing `upsertTrack()` (`db/library.ts`, unchanged) so a later rescan updates the same row instead of duplicating it.
**Before:** nothing — new route. Tracks could only enter the library via a filesystem scan.
**After:** responds `201 { track }` using the same lean shape as `GET /tracks` (via the new `getTrackSummaryById()` in `db/browse.ts`).

**Function:** `scanLibrary()` — `backend/src/services/scanner.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** walk `LIBRARY_PATH` (via `fs.readdir(..., { recursive: true })`), read tags for every supported audio file, and upsert them into the library.
**Side effects:** per-file `fs.stat` + `music-metadata` read; per-file parse failures are caught, logged, and skipped rather than aborting the whole scan (also surfaced in the response's `failures` array).
**Before:** nothing — new function.
**After:** backs `POST /library/scan` (`routes/library.ts`, requires auth); tag-reading logic was later extracted out into the shared `extractTrackTags()` (see `6f7ae2e` above).

**Function:** `upsertTrack()` — `backend/src/db/library.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** idempotent insert/update of a track (and its artist/album, found-or-created by name/title) keyed by file path.
**Side effects:** writes to `tracks`/`artists`/`albums`. Only ever writes the columns it explicitly lists — verified later (scrobble, favorites, upload features) to confirm a rescan never clobbers denormalized play-count/favorite data it doesn't own.
**Before:** nothing — new function.
**After:** reused unchanged by both `POST /library/scan` and, later, `POST /tracks/upload` (`6f7ae2e`) — re-running a scan after an upload updates the same row rather than duplicating it.

**Function:** `mimeTypeFor()` / `parseRange()` / `transcodeToLowQuality()` — `backend/src/services/streaming.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `GET /tracks/:id/stream`. `mimeTypeFor()` maps file extension → `Content-Type`. `parseRange()` parses a single `Range: bytes=...` header (start-end, open-ended, and suffix forms). `transcodeToLowQuality()` pipes the file through `fluent-ffmpeg` (`?quality=low`) to `libopus`/ogg at a 64k target bitrate.
**Side effects:** `transcodeToLowQuality()` spawns a system `ffmpeg` process; requires `.noVideo()` on the command — without it, ffmpeg transcodes an embedded cover-art image stream into a spurious Theora video track, bloating the output. Output length is unknown ahead of time, so `Accept-Ranges: none` on this path.
**Before:** nothing — new functions.
**After:** malformed/out-of-bounds ranges from `parseRange()` get `416` with `Content-Range: bytes */<size>`; no `Range` header falls through to a full `200`.

**Function:** `listArtists()` / `countArtists()` / `getArtistDetail()`, `listAlbums()` / `countAlbums()` / `getAlbumDetail()`, `listTracks()` / `countTracks()` / `getTrackSummaryById()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `GET /artists`, `/artists/:id`, `/albums`, `/albums/:id`, `/tracks` — paginated lists plus detail views with nested children (artist→albums, album→tracks ordered by `track_number`, nulls last).
**Side effects:** read-only. Aggregates (`trackCount`/`albumCount`) computed via `LEFT JOIN` + `COUNT(DISTINCT ...)` rather than N+1 queries; responses never include internal columns (`path`, `date_added`, etc.).
**Before:** nothing — new functions.
**After:** paired with `utils/pagination.ts` (new — default limit 50, max 200, invalid/negative values fall back to defaults).

**Function:** `searchLibrary()` — `backend/src/db/browse.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `GET /search?q=` — `LIKE '%q%'` across artist/album/track names, results grouped by type and each capped at 20.
**Side effects:** read-only. Case-insensitive for ASCII only (not accent/kana-folding); FTS5 is the planned upgrade once the library outgrows this, per `.docs/reference/tech-stack.md` — not needed yet.
**Before:** nothing — new function.
**After:** `400` on empty/missing `q`.

**Function:** `createPlaylist()` / `renamePlaylist()` / `deletePlaylist()` / `listPlaylistsForUser()` / `getPlaylistDetail()` / `findPlaylistById()` — `backend/src/db/playlists.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back the full playlist CRUD surface (`POST`/`GET`/`PATCH`/`DELETE /playlists`, `GET /playlists/:id`).
**Side effects:** `deletePlaylist()` removes the playlist and its `playlist_tracks` rows explicitly in one transaction — no FK-cascade relied on, since `better-sqlite3`'s `foreign_keys` pragma isn't enabled in this project.
**Before:** nothing — new functions.
**After:** every route using these is gated by a shared `loadOwnedPlaylist` helper (`routes/playlists.ts`) — `404` if the playlist doesn't exist, `403` if it belongs to a different user — used on every route that takes a playlist id so the ownership check can't be accidentally skipped on one route.

**Function:** `addTrackToPlaylist()` / `removeTrackFromPlaylist()` / `isTrackInPlaylist()` / `getPlaylistTrackIdsInOrder()` / `reorderPlaylistTracks()` — `backend/src/db/playlists.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `POST`/`DELETE /playlists/:id/tracks` and `PATCH /playlists/:id/tracks/reorder`.
**Side effects:** `addTrackToPlaylist()` appends at `MAX(position)+1` (or `0` for an empty playlist); composite PK on `(playlist_id, track_id)` means a track can't be added twice. The reorder route (not this file) verifies the submitted `trackIds` list is exactly the playlist's current track set — same ids, no dupes/missing/extra — before calling `reorderPlaylistTracks()`, rejecting with `400` otherwise; chosen over a single `{ trackId, newPosition }` move because it was simpler to make provably correct, and playlists are small enough that shipping the whole order each time is cheap.
**Before:** nothing — new functions.
**After:** `409` from the route on adding an already-present track, `404` on adding/removing a track not in the library/playlist.

**Function:** `recordScrobble` — `backend/src/db/plays.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `POST /tracks/:id/scrobble` — record a play and update the track's denormalized play stats.
**Side effects:** a `db.transaction`-wrapped function: inserts a `play_history` row and increments `tracks.play_count` / sets `tracks.last_played_at` atomically, so the detail table and the denormalized columns never drift apart.
**Before:** nothing — new function.
**After:** no minimum-listen threshold and no dedup/anti-spam — every call counts as a play, including immediate repeats from the same user, per the original plan.

**Function:** `listHistoryForUser()` / `countHistoryForUser()`, `listHistoryForTrack()` / `countHistoryForTrack()`, `listTopTracks()` / `countTopTracks()` — `backend/src/db/plays.ts`
**Date:** 2026-09-03 (`05100c8`)
**How added:** new feature
**Purpose:** back `GET /me/history` (caller's own plays only), `GET /tracks/:id/history` (play history for one track, shared across all users with attribution — deliberately not per-caller, unlike playlists), and `GET /stats/top-tracks` (sorted by the denormalized `play_count`, no join needed).
**Side effects:** read-only.
**Before:** nothing — new functions.
**After:** n/a.

**Function:** `registerAuthDecorator()` — `backend/src/plugins/auth.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** register the `fastify.authenticate` decorator used to gate every protected route (`GET /auth/me` onward, and every route added in every later commit) on a valid `Authorization: Bearer <jwt>` header.
**Side effects:** none itself — wraps `verifyToken()` (`services/token.ts`) and short-circuits the request with `401` on a missing/malformed header or an invalid/expired token.
**Before:** nothing — new function.
**After:** every route file added in this repo's history (`library`, `tracks`, `artists`, `albums`, `playlists`, `history`, `stats`, `favorites`, `shuffle`) depends on this decorator existing first.

**Function:** `hashPassword()` / `verifyPassword()` — `backend/src/services/password.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** bcrypt hashing (12 salt rounds) and verification for `POST /auth/register`/`/auth/login`.
**Side effects:** `hashPassword()` is async, CPU-bound (bcrypt).
**Before:** nothing — new functions.
**After:** n/a. Note: bcrypt's build-time dependency `@mapbox/node-pre-gyp` pulls a vulnerable `tar` version (`npm audit`: 1 high, 1 critical) — install-time only, not part of the runtime request path.

**Function:** `signToken()` — `backend/src/services/token.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** sign a JWT (`sub`+`username` payload) on successful login.
**Side effects:** reads `JWT_SECRET` from `.env` (falls back to `'change-me'` if unset), expiry from `JWT_EXPIRES_IN` (default `7d`).
**Before:** nothing — new function.
**After:** verified counterpart lives in the same file, used by `registerAuthDecorator()`.

**Function:** `findUserByUsername()` / `findUserById()` / `insertUser()` — `backend/src/db/users.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** back `POST /auth/register` (duplicate-username check + insert), `POST /auth/login` (lookup + verify), `GET /auth/me` (lookup by id from the decoded token).
**Side effects:** `insertUser()` writes to `users`; `409` from the route on a duplicate username.
**Before:** nothing — new functions.
**After:** n/a.

**Function:** `buildApp()` — `backend/src/app.ts`
**Date:** 2026-09-03 (`1b61cb6`)
**How added:** new feature
**Purpose:** construct and configure the Fastify instance — plugin registration point for every cross-cutting concern added over the project's history (auth decorator, later `@fastify/multipart` for uploads, `@fastify/cors`).
**Side effects:** none itself.
**Before:** nothing — new function.
**After:** `@fastify/cors` was registered here later (`{ origin: true }`) after discovering the backend had no CORS handling at all, which silently blocked every `fetch()` from a browser-opened HTML test page (confirmed via headless Chromium; curl-only verification had missed it since curl doesn't enforce CORS).

**Function:** `normalizeTrack()` / `bootstrapFromHandoff()` — `library-player.html` (repo root, manual test harness, no build step)
**Date:** 2026-09-03 (`05100c8`, revised in later same-day commits)
**How added:** new feature, then corrected
**Purpose:** `normalizeTrack()` maps a raw `GET /tracks` item into the shape the player UI renders. `bootstrapFromHandoff()` (an IIFE) reads `?base=`/`?token=` from the URL on load to skip the manual login step when arriving from `login.html`.
**Side effects:** none beyond local page state; `bootstrapFromHandoff()` calls `loadLibrary()` immediately when handoff params are present.
**Before:** `normalizeTrack()` originally guessed at field names (cover art path, bitrate/sample-rate) that don't exist on this backend.
**After:** narrowed to the confirmed live shape (`{ id, title, artist, album, duration, format }`); `coverPath` cleared to empty (no cover-art endpoint exists anywhere in the API — confirmed by source grep and live 404s) and bitrate/sample-rate hardcoded to `null` (no such columns exist in the `tracks` schema at all) rather than guessing.
