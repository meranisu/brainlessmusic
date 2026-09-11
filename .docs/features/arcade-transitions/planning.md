# Phase Plan — Arcade transitions

## Goal

Make getting into the app feel like a machine booting rather than a page
navigating: the title screen shuts off like a CRT while the logo zooms past the
camera, and the library assembles itself — header, then each nav button, then
the track list — behind an orange line that runs the border once and leaves.

Reference: the beatmania IIDX 10th style / RED attract screens the title screen
already borrows its composition from. **Composition and timing only** — no
Konami artwork, marks, or wordmarks are reproduced anywhere, which is the same
line `index.css` already draws for the mosaic panel.

## Why this is worth building

The title screen landed in `guest-access-and-title-screen` and is the only part
of the app with any theatre to it. Pressing the button currently swaps to a
table instantly, which makes the title screen read as a splash page in front of
an ordinary web app rather than as the front of one thing.

Everything here is presentation. Nothing in this feature may change what the app
*does*, and a reader who turns motion off must get the whole app immediately,
with nothing missing and nothing mid-animation.

## Phase Overview

| Phase | What it covers | Status | Est. | Checklist |
|---|---|---|---|---|
| 1. Plan (blueprint) | Sequence, timings, the two rules below | **Done 2026-09-11** | — | [Phase 1](#phase-1-plan) |
| 2. Structure (foundation) | The exit: CRT shut-off, logo zoom, panel to fullscreen, and the request that rides along with it | **Done 2026-09-11** | ~half a day | [Phase 2](#phase-2-structure) |
| 3. Interior (finishing) | The entry: staged assembly of the shell, and the orange border lap | **Done 2026-09-11** | ~half a day | [Phase 3](#phase-3-interior) |
| 4. Interior — background | Parallax full-screen, two layers counter-scrolling, infinite | **Done 2026-09-11** | ~2 hours | [Phase 4](#phase-4-parallax) |
| 5. Interior — tabs | Per-tab transition on the top bar, like a game menu | **Done 2026-09-11** | ~2 hours | [Phase 5](#phase-5-tabs) |
| 6. Walkthrough | Reduced motion, phone, slow network, docs | **Done 2026-09-11** — 29/29 + 12/12 + 20/20 | ~2 hours | [Phase 6](#phase-6-walkthrough) |

---

## Phase 1: Plan

Two rules the rest of the phases are built on. Both exist because an animation
that gets these wrong is worse than no animation.

- [x] **Motion never gates the app.** The guest mint is a network round trip,
      and the animation is not allowed to wait for it or to hide it. The exit
      plays *while* the request is in flight, and a failure has to be able to
      come back — animating away from a screen and then discovering the server
      said no is the one outcome this must not produce.
- [x] **The boot plays on entry, not on mount.** `AppShell` mounts on every
      reload and every route change. Replaying a 1.2-second assembly each time
      would be intolerable within a minute. The title screen leaves a one-shot
      flag; the shell consumes it once.
- [x] **Timings.** Exit 820 ms, entry 1,150 ms. Both are single-purpose numbers
      in one place per side, not scattered through the CSS.
- [x] **Reduced motion collapses every stage to its finished state.** Which
      here means `animation: none` — correct precisely *because* the hidden
      state lives only inside the keyframes and never in a base rule, so an
      element with no animation renders at its ordinary full opacity. (The
      trap this rule was written against is the other shape: `opacity: 0` in a
      class, cancelled to nothing, leaving the element permanently invisible.)
      The real fault turned out to be specificity, not this choice — see the
      change log.

## Phase 2: Structure — the exit

- [x] `TitleScreenPage` gains a `leaving` state driving `.title-exit-*` classes.
- [x] The `<Navigate>` that fires the moment `user` is set has to be held: it
      would otherwise cut the animation on its first frame. Gated on `leaving`,
      with the navigation done by hand when the sequence ends.
- [x] `Promise.all([enterAsGuest(), delay(EXIT_MS)])` — the request and the
      animation run together, and whichever is slower decides when the app
      appears. On a fast LAN that is always the animation, so the timing is
      predictable; on a slow one the screen holds at black rather than
      stuttering.
- [x] Failure reverses: the classes come off, the error renders, and the button
      comes back. Verified by pointing the client at a refusing server.
- [x] The CRT collapse is the **band** — it squashes to a bright line and goes.
      The logo does not collapse with it; it zooms *through* the camera, which
      is what makes the two read as different planes.
- [x] The mosaic panel goes from `w-1/2` to full width over the same 820 ms, so
      the last thing visible before black is the background, not the form.

## Phase 3: Interior — the entry

- [x] One-shot flag in `sessionStorage`, written by the title screen, read and
      cleared by `AppShell` on mount.
- [x] Staged assembly, all `animation-delay` off one base so the order is
      readable in one place: wordmark → nav buttons, 60 ms apart, individually →
      search → the page's own content.
- [x] The orange border lap: one SVG rect, `pathLength="1"`, a dash that runs
      the perimeter once and fades — one element rather than four divs whose
      four separate animations would have to be kept in step by hand. **No
      `viewBox`**, for the three reasons in the change log.
- [x] The nav buttons animate **individually**, which is the detail that makes
      this read as a machine enumerating its parts rather than a container
      fading in.

## Phase 4: Parallax

- [x] `ShellBackdrop` today is two gutter columns hidden below `2xl`. Make it
      full-bleed, two layers counter-scrolling (one up, one down), infinite.
- [x] **The thing to be careful about:** this sits behind a dense table. The
      current opacity is already a sixth of the title screen's. Full-bleed means
      it crosses the text, so it needs to lose more, not less — and the
      `2xl`-only rule exists precisely because decoration behind a data table is
      a bug. Measure contrast on a real track row before keeping it.
      **Measured**: 5/255 worst pixel behind the page heading, against 20/255 in
      the gutter. The `2xl` rule is replaced by a mask tied to the content
      column, not dropped.

## Phase 5: Tabs

- [x] `document.startViewTransition` — but **called directly, not through
      React Router's `viewTransition` prop**. That prop is a data-router API
      and this app is mounted under `<BrowserRouter>`, so it is accepted and
      silently ignored; counted at the API it started zero transitions while
      every visible symptom looked correct.
- [x] Direction-aware, and it was cheap: `data-nav-dir` on the root, set on the
      click, read by `:root[data-nav-dir='back']::view-transition-*`.
- [x] The active-tab underline travels rather than cross-fading. It had to stop
      being an `::after` to do it — a pseudo-element cannot carry a
      `view-transition-name`, and a name present twice disables the transition
      for the whole page, so rendering it only inside the active tab is a
      correctness requirement.

## Phase 6: Walkthrough

- [x] Reduced motion: the whole sequence collapses, and the app is fully present
      and interactive with nothing left mid-animation.
- [x] Phone and landscape-phone.
- [x] A failing mint during the exit returns to the title screen with its error.
- [x] Re-check after Phases 4–5. 20/20 on the tab pass; the earlier 29 and 12 re-run clean.
- [x] `tsc`, `oxlint`, backend suite, browser pass.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-11 | Structure | Exit runs the mint and the animation concurrently rather than sequentially | Awaiting the mint first meant the button sat on "Entering…" for a round trip before anything moved, which reads as a hang on exactly the slow connection the animation was meant to cover | Yes |
| 2026-09-11 | Tabs | Dropped React Router's `viewTransition` prop for a direct `document.startViewTransition` call | The prop does nothing under `<BrowserRouter>`. Caught only by instrumenting the API and counting calls — the underline, the direction attribute and running animations all looked right while nothing was transitioning | Yes |
| 2026-09-11 | Tabs | Found, and did **not** fix, a pre-existing phone fault: the top bar's six tabs measure 933px at 390px, so every page scrolls sideways on a phone | Present on a direct load with no transition involved, so out of this feature's scope. Which tabs survive a narrow screen — and whether the answer is a scrolling bar or an overflow menu — is a design decision, not a patch | Yes — flagged rather than absorbed |
| 2026-09-11 | Interior | The boot sequence gained a 1,500ms deadline in JS, and its delays were compressed from a 780ms tail to 480ms | **Owner-reported bug: pressing enter did not show the library.** React StrictMode remounts components in development, restarting the CSS animations and their delays — the track list was still invisible 1.5s in. The deeper fault is that staged classes hide content that has already loaded, so any disturbance to the animation blanks the app | Yes — it is the same sequence, bounded |
| 2026-09-11 | Interior | Tap feedback on the logo (line sweep + glow), and fade in/out on the numpad | Owner request. The tap feedback trades a little of the gesture's invisibility for being able to tell you are part-way through it; nothing is added to the DOM at rest | Yes |
| 2026-09-11 | Parallax | The readability check was rewritten after its first version proved nothing | It clipped to the track table, which sits on an opaque `.card`, and reported a difference of exactly zero — it would have passed with a screaming backdrop. It now measures the page heading, which is really on the page background, plus a gutter as a control | Yes — this is the measurement Phase 4 was conditioned on |
| 2026-09-11 | Parallax | Mask stops moved from percentages to `calc(50% ± 36rem)` | Gutters are 5% of a 1280px window and 20% of a 1920px one, so a percentage cannot track the content column. At 26% the heading measured 12/255; tied to the column it measures 5 | Yes |
| 2026-09-11 | Structure | The zoomed logo lightens partway through, which was not planned | It is near-black because it was drawn for a white band, and the band collapses out from under it — unchanged, it spent the second half of the zoom as dark type on a dark mosaic | Yes |
| 2026-09-11 | Structure | The zoomed logo is a second, duplicate copy on its own layer | Nesting a zoom inside an element being squashed to a line squashes the zoom with it; no transform maths untangles the two | Yes |
| 2026-09-11 | Interior | The border lap was rebuilt three times — square SVG, then a 25px slab, then ten dashes | Each fix exposed the next: `inset: 0` does not size an `<svg>`; a stretched `viewBox` scales the stroke; `non-scaling-stroke` moves the dash into screen space. Removing the viewBox solves all three | Yes |
| 2026-09-11 | Interior | Reduced-motion override rewritten to match the stagger's specificity | `.boot-nav > *` loses to `.boot-nav > *:nth-child(N)`, so half the top bar stayed invisible for up to 600ms for the people who asked for no motion. The JS timer had the same fault in a different form | Yes — and it is the reason Phase 1's fourth rule exists |
| 2026-09-11 | Interior | Boot flag lives in `sessionStorage`, not in router state | Router state is lost on a reload but *kept* on a back-navigation — precisely backwards from what is wanted, since a reload should not replay the boot and pressing back into the app should not either | Yes |
