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
| [Q2](#q2--when-does-open-registration-get-turned-off) | When does open registration get turned off? | 2026-09-09 | Yes, at box 13's done-when |
| [Q4](#q4--room-sync-design-details) | Room-sync design details | 2026-09-09 | Not yet — v0.3 |
| [Q5](#q5--tag-editing-scope) | Tag-editing scope | 2026-09-09 | No |
| [Q10](#q10--gapless-playback) | Gapless playback | 2026-09-10 | No |
| [Q12](#q12--does-the-first-play-wait-need-a-live-fallback-for-very-long-tracks) | Does the first-play wait need a live fallback for very long tracks? | 2026-09-10 | No |
| [Q19](#q19--what-does-a-theme-control) | What does a theme control? | 2026-09-11 | Yes, at phase 2 |
| [Q20](#q20--where-does-the-theme-choice-live) | Where does the theme choice live? | 2026-09-11 | No — assumption stated |
| [Q23](#q23--should-selecting-a-track-preview-it) | Should selecting a track preview it? | 2026-09-11 | No — assumption stated |

### Q2 — When does open registration get turned off?
**Asked:** 2026-09-09 · **Blocking:** yes, at box 13's done-when

`ALLOW_OPEN_REGISTRATION` defaults on, which is fine on the LAN and was
re-opened at your request. It must be `false` before the server is reachable
from outside. The backend warns at every boot while it's on.

**Superseded in part on 2026-09-11 by [A16](#a16--signup-goes-and-open-registration-closes).**
The flag is being flipped to default `false` as part of guest access, well ahead
of box 13, because deleting `/signup` leaves it with no caller. So the narrow
question this entry asks — *when does the flag go off* — is answered: now.

**What keeps this open:** the flag was never the real concern. A stranger who
reaches the server can now press a button and listen without minting an account
at all, so the exposure Q2 was standing in for moves to
[A15](#a15--the-entry-code-hook-ships-now-unset) and to box 13's gate. This
entry stays open until that gate exists and is running.

### Q4 — Room-sync design details
**Asked:** 2026-09-09 · **Blocking:** not yet — v0.3 work

Data model, drift tolerance, reconnect handling. Flagged as needing a dedicated
brainstorming session rather than an inline answer — this is the project's
centerpiece feature, so it deserves its own turn, not a paragraph here.

### Q5 — Tag-editing scope
**Asked:** 2026-09-09 · **Blocking:** no

Which fields are editable, whether batch-edit exists, and what undo/backup
behaviour looks like when the edit writes back to the file on disk.

### Q10 — Gapless playback
**Asked:** 2026-09-10 · **Blocking:** no

Opus pre-skip / LAME delay-padding handling. Raised in the 2026-09-10 backend
playback review and still undecided — the only item from that review's
"undecided" pair that has not since been built ([A9](#a9--resume-position--cross-device-playback-state)
took the other).

---

### Q12 — Does the first-play wait need a live fallback for very long tracks?
**Asked:** 2026-09-10 · **Blocking:** no

[A5](#a5--cold-cache-strategy-and-cache-sizing-for-box-24) chose convert-first,
then serve. The wait scales with track length: measured ~96x realtime, so about
**4.5 s for a 7-minute track** and roughly **37 s for an hour-long mix**. Four
seconds of silence after pressing play is fine. Thirty-seven is not.

Nothing in the library is long enough to hit this today, which is why it is not
blocking.

**Assumption being built on:** every track converts on first play, however long
it is. If that bites, the fix is to reinstate the removed live `-ss` path for
tracks over a threshold — they would start instantly and give up byte-range
seeking, which is the right trade for a mix nobody scrubs precisely. The code
is in `216aaf7^`.

---

### Q19 — What does a theme control?
**Asked:** 2026-09-11 · **Blocking:** at phase 2

Narrow (**colour only** — palette swaps, same layout and type) or wide (colour
*and* typography, border weights, corner radii, maybe the backdrop's pattern).

Colour-only is a day's work and mechanical: lift today's hard-coded Tailwind
colours into custom properties, then a theme is a list of values. Wide themes
are a different project — every component grows a set of knobs, and each new
theme is then a design exercise rather than a palette.

**Recommendation: colour only for now**, with the token layer built so type and
metrics *can* join later without re-touching every component.

### Q20 — Where does the theme choice live?
**Asked:** 2026-09-11 · **Blocking:** no

`localStorage` (this browser only) or on the server against the user row (so it
follows the identity, including across a handoff QR).

**Assumption I will build on unless you say otherwise: `localStorage`.** A theme
is a property of the screen you are looking at, not of who you are — a phone in
a dark room and a desktop by a window can reasonably disagree. It also needs no
migration, no endpoint and no round trip before the first paint, which matters
because a theme that arrives late is a visible flash of the wrong colours.

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

### Q23 — Should selecting a track preview it?
**Asked:** 2026-09-11 · **Blocking:** no

In the reference, moving the selection starts the song's preview clip. It is a
large part of why that screen feels alive.

Against it here: no preview clips exist, so it would mean streaming the real
track from its start on every arrow-key press — expensive over the network the
roadmap is about to expose, and startling if someone is already listening to
something else.

**Assumption I will build on: no preview.** Selection is silent; `Enter` plays.
If you want it later, the honest version is a debounce plus a decode of the
first ~15 seconds, cached like the transcodes already are — worth its own box
rather than a phase here.

---

### Q24 — Does bulk hide/delete on `/manage` need a real bulk endpoint?
**Asked:** 2026-09-15 · **Blocking:** no

Today "bulk" hide/un-hide/delete on the admin track table fires one
`PATCH`/`DELETE /tracks/:id` per selected row (`Promise.all` in
`ManageTracksPage`), not a real batch endpoint. Fine at a handful of rows;
noticeably slower and noisier in the network tab if someone ever selects
hundreds at once.

**Assumption I will build on: skip it for now.** This library is
friends-scale, not enterprise-scale, and no one has hit this as an actual
problem yet — building a batch endpoint speculatively is exactly what
"prefer surfacing over building" argues against. Revisit if bulk selections
in practice turn out to be large.

---

### Q25 — Does `/manage` need a library-wide stats surface?
**Asked:** 2026-09-15 · **Blocking:** no

"See what music is in the library" could mean the searchable/sortable table
itself (already true), or a dashboard-style summary — total tracks, total
size on disk, format breakdown. The second is genuinely new backend work (no
`GET /library/stats`-shaped endpoint exists), not something already sitting
unexposed.

**Assumption I will build on: not building it this pass.** The table already
answers "what's in the library" for anything you'd search or filter for; a
stats dashboard is a distinct, larger feature and not implied by "full
sorting search and more." Say the word if you actually want the dashboard.

---

### Q26 — Does removing a library root delete its tracks, or just mark them missing?
**Asked:** 2026-09-15 · **Blocking:** no

Multi-root library support means a root's *registration* can be removed
independently of whether the drive/folder still has music on it. Deleting
the registration could either hard-delete every track that came from that
root, or leave them as permanently-missing rows (same treatment as a single
file going missing today).

**Assumption I will build on: mark missing, don't delete.** Consistent with
this app's existing hide-vs-delete philosophy — removing a root's
registration is an admin decision about *tracking* that folder, not a
decision to destroy the track rows, their play history, or their favorites.
Re-adding the same path later would make them reappear naturally through the
normal reconcile.

---

### Q27 — Should uploads let you pick which library root they file into?
**Asked:** 2026-09-15 · **Blocking:** no

With multiple roots, `POST /tracks/upload` still only knows about one
destination (the original default root).

**Assumption I will build on: uploads stay single-destination.** Extra roots
are for folders that already hold music you want scanned in, not upload
targets — a root picker on the upload UI is a separate, un-asked-for
decision. Say so if you want uploads to target a chosen root instead.

---

### Q28 — Indeterminate scan bar now, or real weighted progress later?
**Asked:** 2026-09-15 · **Blocking:** no

`POST /library/scan` is one blocking request with no incremental-progress
reporting today. A true "234 of 5,000 files" bar needs an async job plus a
status-polling endpoint — a materially bigger, separate piece of backend
work than what was asked for.

**Assumption I will build on: an indeterminate animated bar** (reusing the
existing progress-bar visual from `UploadPage.tsx`, just without a real
percentage) while the scan request is in flight. Real weighted progress is a
distinct future feature, not a corner cut silently.

---

### Q29 — Should Android Phase 0 support guest entry, not just password login?
**Asked:** 2026-09-18 · **Blocking:** no

`.docs/process/android-phased-plan.md`'s Phase 0 was written before guest
access shipped (2026-09-11) and only specs `POST /auth/login` (username +
password). The web app's front door is now guest-entry-first, with password
login demoted to an unadvertised `/login`.

**Assumption I will build on: password login only, for now.** This is the
owner's own device, not a friend's — Phase 0's done-when ("credentials
persist across app restarts") reads as written for a real account, and guest
entry has no persistent identity to restore on restart anyway. `AuthRepository`
is structured so a `guestLogin()` method would be additive (same token shape,
same `TokenProvider`/`SessionStore` plumbing), not a rework, if this turns out
wrong. Say so if the Android app should offer a guest option too.

---

## Answered

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

**Still genuinely open, and cheap to change:** number 4 on **Android**. A native
client has no autoplay restriction, so it *can* resume playing, and whether it
should is a taste question this decision does not settle. Numbers 1–3 are in the
schema and would cost a migration to revisit; number 4 is a client-side choice
with no stored state behind it.

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
taken after it. Git keeps the removed path if [Q12](#q12--does-the-first-play-wait-need-a-live-fallback-for-very-long-tracks)
ever needs it.

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
