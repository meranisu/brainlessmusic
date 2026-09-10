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
| [Q1](#q1--is-the-home-network-behind-cgnat) | Is the home network behind CGNAT? | 2026-09-09 | **Yes** — box 13, and all of v0.2 behind it |
| [Q2](#q2--when-does-open-registration-get-turned-off) | When does open registration get turned off? | 2026-09-09 | Yes, at box 13's done-when |
| [Q3](#q3--which-os-for-the-server) | Which OS for the server? | 2026-09-09 | No |
| [Q4](#q4--room-sync-design-details) | Room-sync design details | 2026-09-09 | Not yet — v0.3 |
| [Q5](#q5--tag-editing-scope) | Tag-editing scope | 2026-09-09 | No |
| [Q7](#q7--should-the-track-title-be-uppercased) | Should the track title be uppercased? | 2026-09-09 | No |
| [Q8](#q8--should-the-play-fab-keep-overlapping-the-scrubber) | Should the play FAB keep overlapping the scrubber? | 2026-09-09 | No |
| [Q9](#q9--resume-position--cross-device-playback-state) | Resume position / cross-device playback state | 2026-09-10 | No — box 25 |
| [Q10](#q10--gapless-playback) | Gapless playback | 2026-09-10 | No |
| [Q12](#q12--does-the-first-play-wait-need-a-live-fallback-for-very-long-tracks) | Does the first-play wait need a live fallback for very long tracks? | 2026-09-10 | No |
| [Q13](#q13--should-the-64k-opus-recipe-switch-to-constrained-vbr) | Should the 64k Opus recipe switch to constrained VBR? | 2026-09-10 | No |

### Q1 — Is the home network behind CGNAT?
**Asked:** 2026-09-09 · **Blocking:** yes · **Owner action, not a code question**

Roadmap box 13 (reach the server from outside the LAN) can't be designed until
this is known — behind CGNAT, port-forwarding is off the table and it becomes a
tunnel/relay problem instead. Box 13 blocks the rest of v0.2. Details in
`.docs/ops/infrastructure.md`.

**What I need:** whether the WAN IP the router reports matches the public IP a
site like `ifconfig.me` reports. Same → not CGNAT. Different (and the router's
is `100.64.x.x`–`100.127.x.x`) → CGNAT.

### Q2 — When does open registration get turned off?
**Asked:** 2026-09-09 · **Blocking:** yes, at box 13's done-when

`ALLOW_OPEN_REGISTRATION` defaults on, which is fine on the LAN and was
re-opened at your request. It must be `false` before the server is reachable
from outside. The backend warns at every boot while it's on.

**Assumption I'm working under:** it stays on until box 13 is actually built,
and flipping it is part of that box rather than a separate task.

### Q3 — Which OS for the server?
**Asked:** 2026-09-09 · **Blocking:** no

Arch-based is leaning but not locked in. Only matters when the deploy is real;
Docker keeps the app itself indifferent.

### Q4 — Room-sync design details
**Asked:** 2026-09-09 · **Blocking:** not yet — v0.3 work

Data model, drift tolerance, reconnect handling. Flagged as needing a dedicated
brainstorming session rather than an inline answer — this is the project's
centerpiece feature, so it deserves its own turn, not a paragraph here.

### Q5 — Tag-editing scope
**Asked:** 2026-09-09 · **Blocking:** no

Which fields are editable, whether batch-edit exists, and what undo/backup
behaviour looks like when the edit writes back to the file on disk.

### Q7 — Should the track title be uppercased?
**Asked:** 2026-09-09 · **Blocking:** no

The source mockup specified Barlow Condensed 900 uppercase. That was
deliberately dropped: much of this library is Japanese, where `text-transform`
does nothing to the CJK half and flattens the Latin titles beside it
(`WORTH LIVING ~ FROM 智代アフター`). Revisit only if you want the mockup
followed exactly.

### Q8 — Should the play FAB keep overlapping the scrubber?
**Asked:** 2026-09-09 · **Blocking:** no

As the mockup has it, the FAB sits over the scrubber's centre. Dragging through
the middle still seeks, but a tap at dead centre hits play instead of seeking
there. The alternative is moving the FAB down into the transport row.

### Q9 — Resume position / cross-device playback state
**Asked:** 2026-09-10 · **Blocking:** no — this is roadmap box 25

Needs a `playback_state` table. Ranked and listed during the 2026-09-10 backend
playback review but left undecided, unlike the items in [Answered](#answered)
from the same review.

**Expanded 2026-09-10** with the four decisions the table's shape actually turns
on. Each has a recommended default, so this can be built without an answer if
you would rather just see it work.

1. **What is saved — position only, or the queue too?**
   *Recommended: the queue too.* Track + position alone means the phone
   resumes the song but forgets what was meant to come after it, which is
   half a feature. The queue is a list of ids; it costs a JSON column.

2. **How often does the client write?**
   *Recommended: every 10 s while playing, plus on pause, track change and
   page hide.* A write per second is wasteful and a write only on unload
   loses everything to a crash or a killed tab. `visibilitychange` is the
   event that actually fires on a phone; `beforeunload` does not fire
   reliably on mobile Safari or when Android kills a backgrounded tab.

3. **Two devices playing at once — who wins?**
   *Recommended: last write wins, one row per user.* This is a three-person
   server. Per-device state would mean the desktop never learns where the
   phone got to, which is the entire point of the box. The failure mode is
   mild and self-correcting: whichever device you touched last is right.

4. **On opening the app, does it start playing?**
   *Recommended: no — restore the queue and the position, paused.* Browsers
   block autoplay without a user gesture, so "resume and play" is not
   something the web client can honestly deliver; it would silently do
   nothing on the phone, which is exactly where it matters. Restore the
   state, show it in the bar, let the play button do the rest. **This is the
   one worth disagreeing with if you want the Android client to behave
   differently** — a native app has no such restriction, and box 25 is
   backend-then-clients.

**Assumption being built on:** the four defaults above, if this is started
before an answer arrives.

### Q10 — Gapless playback
**Asked:** 2026-09-10 · **Blocking:** no

Opus pre-skip / LAME delay-padding handling. Same review as Q9, same status:
raised, not decided.

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

### Q13 — Should the 64k Opus recipe switch to constrained VBR?
**Asked:** 2026-09-10 · **Blocking:** no

`LOW_QUALITY_VARIANT` asks ffmpeg for `-b:a 64k` and gets 74.3 kbps. libopus
treats that as a VBR target and runs 16% over it. Measured 2026-09-10 on
`04. 2 steps toward.opus` (115 kbps source, 172.1 s):

| Recipe | Bytes | Effective |
|---|---|---|
| `-b:a 64k` (today) | 1,597,894 | 74.3 kbps |
| `-b:a 64k -vbr constrained` | 1,395,366 | 64.9 kbps |

A further **13% off the wire**, and it makes the configured number mean what it
says — `TRANSCODE_MIN_SOURCE_BITRATE_RATIO` is reasoned about in terms of the
64k target, and today that target is fiction.

Two reasons it is not just done:

1. **It changes the audio.** Constrained VBR is what streaming services use, but
   it is a real quality decision on your music, not a bug fix.
2. **The cache key does not include the recipe.** `cacheEntryName` hashes
   `variant.id` + source size + mtime, so changing `configure` alone would leave
   every existing entry serving the old encode forever, with no way to tell them
   apart. Doing this means bumping the variant id (`opus64` → `opus64c`), which
   re-converts on next play and lets the old entries age out through normal LRU
   eviction.

**Assumption being built on:** the recipe stays as it is. Nothing depends on the
overshoot, so this can be taken at any time; it costs one constant and one id.

---

## Answered

Decided. Do not re-open without an explicit ask.

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
