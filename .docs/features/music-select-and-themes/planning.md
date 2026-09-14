# Arcade music select, themes, and a top bar that fits

**Status:** planning · **Opened:** 2026-09-11
**Asks:** owner, 2026-09-11 — click-to-play (done), an IIDX-style music select,
themes behind an Options button.

---

## What was asked

1. **Clicking a track plays it** rather than opening the tag editor. **Done and
   shipped** — see the 2026-09-11 changelog entry. Not part of the phases below.
2. **A music-select screen modelled on beatmania IIDX**: a scrollable song list,
   with the selected song's details, format and album art shown on the left.
   Navigable by keyboard *or* mouse.
3. **Themes**, with an **Options button in the top bar** as the first step.

---

## The blocker, stated first

**The top bar does not fit a phone, and ask 3 adds to it.**

Six tabs measure **933px at a 390px viewport**; the Exit button took that to
**981px**. Every page in the app scrolls sideways on a phone today. An Options
button is another 70-80px on a row that is already two and a half times too
wide.

This is not a reason to refuse the button — it is a reason to do the header
first. Adding to a broken row and calling it done would be quietly shipping the
fault forward, and the arcade select view is the *other* thing that needs
narrow-screen answers. So **Phase 1 is the header**, and Options arrives on a
bar that can hold it. See [Q18](../../QUESTIONS.md#q18).

---

## Phase 1 — A top bar that survives a phone, with Options on it — **Done** (2026-09-11)

**Why first:** it is the precondition for ask 3 and it is a live bug.

- Decide the narrow-screen strategy ([Q18](../../QUESTIONS.md#q18)): a
  horizontally scrolling tab rail, an overflow "More" menu, icon-only tabs, or a
  bottom bar on mobile.
- Add **Options** to the bar. Ships in this phase as the panel shell plus the
  one control that already exists somewhere worse — *Data saver*, currently
  stranded in the player bar — so the button does something real on day one
  rather than opening an empty box.
- Keep the view-transition underline working across whatever the new layout is;
  it depends on exactly one `.nav-underline` existing at a time.

**Done when:** `document.documentElement.scrollWidth === 390` at a 390px
viewport on every page, Options opens, and the tab transition still starts (the
instrumented count, not the appearance).

**Done.** 87/87 checks across nine viewport widths (360→1920), plus 9/9 on the
navigation row's cohesion and hover. Two things changed shape along the way:

- **Options became a page, not a dropdown**, at the owner's request — a
  cabinet's option screen is somewhere you go, announced by a plate. `/options`
  now holds Data saver and the identity controls.
- **The tab transition became the card, replacing the directional slide.** They
  cannot coexist: the card is opaque and full-screen, so the slide underneath is
  a snapshot nobody sees. `rememberDirection` and the `data-nav-dir` CSS are
  kept so restoring the slide is four lines rather than a rebuild.

Also recorded: the `md` breakpoint was tried and measured at 785px inside a
721px bar, which moved the overflow rather than removing it. `lg` is not a
preference, it is the measurement.

## Phase 2 — Themes — **Done** (2026-09-11)

- Palette as CSS custom properties on `:root`. Today's colours are written
  directly into components as Tailwind classes (`bg-blue-950`, `text-orange-600`
  and so on), so this phase is mostly a mechanical lift of those into tokens —
  that is the bulk of the work, and it is what makes every later theme cheap.
- Ship at least two: the current blue, and a red one from the IIDX RED
  reference. Scope of what a theme controls is [Q19](../../QUESTIONS.md#q19).
- Persistence is [Q20](../../QUESTIONS.md#q20) — per-device, or carried with the
  identity so a handoff brings it along.
- The backdrop, boot frame, band sweep and tap flash all hard-code blue and
  orange; they have to move to tokens in the same pass or a red theme will have
  blue furniture.

**Done when:** switching theme in Options repaints the whole app with no reload,
survives a refresh, and the arcade furniture changes with it.

**Done, and far cheaper than this plan assumed.** The plan budgeted the phase
for "a mechanical lift of hard-coded classes into tokens… the bulk of the work".
That work turned out to be unnecessary: Tailwind 4 compiles `bg-blue-900` to
`background-color: var(--color-blue-900)`, so redefining those variables under
`[data-theme]` repaints every component without touching one of them. **Not**
doing the sweep is worth more than doing it well would have been — a diff across
twenty-five components is twenty-five chances to change something that was not a
colour.

Three themes shipped rather than two (blue, crimson, void): two look like a
choice between two moods, three looks like a setting. 34/34 checks.

## Phase 3 — The music select view, with a mouse — **Done** (2026-09-14)

The layout from the reference: list on the right, detail on the left.

- **Right:** the track list as a vertical strip — title, artist, a format badge.
  The selected entry is outlined and sits **vertically centred**; the list moves
  past it rather than a cursor moving down a static list. That one detail is
  most of what makes the reference feel like the reference.
- **Left:** the selected track at size — album art large, then title, artist,
  album, duration, format, bitrate, play count.
- Click to select, click the selected entry (or a Play control) to play.
- Whether this **replaces** the table or is a **second view mode** was
  [Q21](../../QUESTIONS.md#q21) — answered A18: **replace**, on `/`. The table
  moves to `/manage`, admin-gated, with sorting, filtering, per-row flags and
  bulk actions untouched.

**Done when:** selection and playback work by mouse, the left panel tracks the
selection, and the narrow-screen answer from Q22 is implemented rather than
deferred.

**Done.** `ArcadeSelect` renders the strip and detail panel; `LibraryPage`
fetches with `useInfiniteQuery` (200-row pages, the server's own cap) and pages
in automatically as the selection nears the loaded tail. The old table-based
`LibraryPage` was renamed to `ManageTracksPage` and moved to `/manage`
(admin-only, reachable from the top bar's overflow menu) rather than deleted —
every filter, sort, flag and bulk action survives intact.

Two things worth flagging:

- **Q22 (phone layout) shipped simpler than recommended.** The plan's
  recommendation was a slide-up sheet; what shipped is a plain vertical stack
  (strip above detail, via CSS `order`). Recorded honestly as
  [A19](../../QUESTIONS.md#a19--a-phone-stacks-the-strip-above-the-detail-was-q22)
  rather than claimed as the sheet.
- **`formatDuration` existed three times** across the codebase before this
  phase, two of them rounding seconds (which can print `0:60`) and one
  flooring. Consolidated into `lib/format.ts`, flooring — see FUNCTIONLOG.

**Verified:** 50/50 across four headless-Chromium suites — centred-cursor
mechanics, click-to-select vs. click-to-play, wheel selection with clamping at
both ends, a missing track shown-but-unplayable, real pagination proven by
counting actual network requests (200 rows → select the tail → exactly one more
request → 231 total, no runaway or duplicate fetches), the phone layout, reduced
motion, and the management page still fully functional for an admin. Plus tsc
clean, no new lint warnings, and 281/281 backend tests (untouched this phase,
confirming no regression).

## Phase 4 — Keyboard, and the scroll feel — **Done** (2026-09-14)

- `↑`/`↓` move the selection, `Enter` plays, `Home`/`End` jump, typing letters
  jumps to a title. Wheel scrolls the strip.
- The selected row stays centred while the strip animates under it.
- Focus management: the strip is a listbox, not a table — real roles, real
  `aria-activedescendant`, so keys work for anyone who reaches it by keyboard
  rather than only for someone who clicked it first. The current library table
  has clickable `<tr>`s that are not keyboard-reachable at all; this phase is
  where that gets fixed for the new view.
- Respect `prefers-reduced-motion`: the strip jumps rather than glides.

**Done when:** the view is fully operable without a mouse, measured in headless
Chromium by key events rather than by clicks.

**Done.** The strip is `role="listbox"` and holds focus (`tabIndex={0}`); rows
became non-focusable `role="option"` elements (were `<button>`s, individually
tabbable — the exact problem this phase exists to fix) reporting position via
`aria-activedescendant` rather than each being its own tab stop. `↑`/`↓`,
`Home`/`End`, `Enter`, and type-ahead all work; type-ahead buffers over 700ms
and searches forward from just past the current selection so repeating a
short buffer cycles through matches instead of sticking on the first.
`prefers-reduced-motion` was already handled in Phase 3 (the rail's
transition is unconditionally disabled) — this phase confirmed it holds for
keyboard-driven selection changes too, no new work needed.

**Found along the way:** the player bar already had a global `window`
keydown handler for space/`n`/`p` (pause/next/previous) guarded only against
actual form fields, not this listbox. Typing a title containing a space or
the letters `n`/`p` during type-ahead would have doubled as a play/pause or
skip on whatever was already playing. Fixed by `stopPropagation()` on every
key the strip's own handler consumes.

**Verified:** 16/16 checks driven entirely by `page.keyboard.press`, plus the
full Phase 3 mouse/wheel/pagination/reduced-motion regression suite
(34/37 — the three failures are `/manage`'s admin gate rejecting a
non-admin test fixture, unrelated to this phase). tsc clean, no new lint
warnings.

## Phase 5 — Polish — **Done** (2026-09-14)

- Per-theme skins for the select screen.
- Transition when the selection changes; transition into playback.
- Whether selecting a track **previews** it is [Q23](../../QUESTIONS.md#q23).
- (Added mid-phase, on request): the strip should be **draggable** with a
  mouse or a finger, not just wheel/keyboard.

**Done.** Three findings, in order:

1. **Per-theme skins turned out to already exist.** Every colour the arcade
   select uses (`--color-blue-*`, `--color-orange-*`) is one of the tokens
   Phase 2 already made theme-aware, so the strip, cursor and detail panel
   repaint correctly under all three themes with zero new code — the same
   "far cheaper than assumed" result Phase 2 itself reported. Verified per
   theme rather than assumed: blue's and void's accent are intentionally the
   *same* orange (void only retunes the ground to near-black), red's is gold
   — confirmed by reading `getComputedStyle` on the live cursor band in all
   three, not just eyeballing screenshots.
2. **Transition into playback:** a one-shot orange flash on the cursor band
   when a track actually starts (`.arcade-launch-flash`, replayed via the
   same key-remount trick `.arcade-detail-inner` already used). Selecting
   alone stays silent, matching Q23's stated assumption — the flash is
   specifically the acknowledgment that a *different*, decisive gesture
   (Enter, the Play button, or clicking the already-selected row) just fired.
   Transition when the selection changes was already covered by Phase 3/4
   (the rail's glide, the row's colour/padding transition, the detail panel's
   re-key animation) — nothing new needed there.
3. **Drag-to-scroll**, added mid-phase: one Pointer Events implementation
   covers mouse and touch. The rail follows the pointer continuously while
   held — unlike the wheel and keyboard, which are committed to "one notch,
   one row" — and only snaps to the nearest row on release, the same feel as
   a real turntable platter or an iOS-style picker wheel. A drag is
   distinguished from a tap by a 6px movement threshold, so an unsteady click
   still reaches the row underneath rather than being swallowed by the drag
   handler.

**A real bug caught by the browser test, not by reading the code:** the
clamp that keeps a drag from being pulled past either end of the list had
its `min`/`max` bounds swapped. Dragging up from row 0 (the only direction
with anywhere to go) clamped straight back to zero every time, because the
lower bound was wrongly keyed off "rows behind the start" (0, at the first
row) rather than "rows left" — the two are the *opposite* ends of the valid
range once the delta-to-row sign flip is accounted for. Caught because the
Puppeteer test asserted the actual resulting selection, not just that
`dragDeltaPx` changed mid-gesture (which it did — the bug was purely in the
release-time snap). A second, smaller issue was found and fixed alongside
it: reading the drag's final offset from React state at release time raced
the last `pointermove`'s render commit against the `pointerup` event; fixed
by having the release handler read `clientY` straight off its own event
instead, the same way `pointermove` already does.

**Verified:** 37/37 across three Puppeteer suites — 19 for the launch flash
(silent-select vs. flash-on-play, Enter parity, reduced-motion suppression,
all three themes) and 12 for drag (mouse and CDP-emulated touch, correct
direction in both, boundary clamping, a plain click still working
unaffected, `is-dragging` toggling the rail's transition off mid-drag and
back on after), plus a 6-check regression pass confirming Phase 3/4 behaviour
(click-to-select vs. click-to-play, Home/End) survived. tsc clean, two real
lint findings from the new code (a ref read during render, a ternary used as
a statement) fixed rather than suppressed.

---

## Open questions

[Q18](../../QUESTIONS.md#q18) (blocking Phase 1) ·
[Q19](../../QUESTIONS.md#q19) · [Q20](../../QUESTIONS.md#q20) ·
[Q21](../../QUESTIONS.md#q21) (blocking Phase 3) ·
[Q22](../../QUESTIONS.md#q22) · [Q23](../../QUESTIONS.md#q23)
