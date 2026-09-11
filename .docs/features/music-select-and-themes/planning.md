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

## Phase 2 — Themes

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

## Phase 3 — The music select view, with a mouse

The layout from the reference: list on the right, detail on the left.

- **Right:** the track list as a vertical strip — title, artist, a format badge.
  The selected entry is outlined and sits **vertically centred**; the list moves
  past it rather than a cursor moving down a static list. That one detail is
  most of what makes the reference feel like the reference.
- **Left:** the selected track at size — album art large, then title, artist,
  album, duration, format, bitrate, play count.
- Click to select, click the selected entry (or a Play control) to play.
- Whether this **replaces** the table or is a **second view mode** is
  [Q21](../../QUESTIONS.md#q21). Recommendation in that entry: a toggle, because
  the table carries sorting, filtering and the admin bulk actions that this
  layout has nowhere to put.

**Done when:** selection and playback work by mouse, the left panel tracks the
selection, and the narrow-screen answer from Q22 is implemented rather than
deferred.

## Phase 4 — Keyboard, and the scroll feel

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

## Phase 5 — Polish

- Per-theme skins for the select screen.
- Transition when the selection changes; transition into playback.
- Whether selecting a track **previews** it is [Q23](../../QUESTIONS.md#q23).

---

## Open questions

[Q18](../../QUESTIONS.md#q18) (blocking Phase 1) ·
[Q19](../../QUESTIONS.md#q19) · [Q20](../../QUESTIONS.md#q20) ·
[Q21](../../QUESTIONS.md#q21) (blocking Phase 3) ·
[Q22](../../QUESTIONS.md#q22) · [Q23](../../QUESTIONS.md#q23)
