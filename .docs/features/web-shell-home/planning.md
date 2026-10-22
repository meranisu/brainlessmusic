# Web shell redo: Home page and arcade sidebar

## Goal

Give the web app a Home page that offers your music (mixes, recent plays, playlists, friends, new albums) and replace
the crowded top bar with a collapsible arcade sidebar on desktop and a bottom tab bar on phones.

**Done when:** in the browser, the app opens on Home with real shelves; the sidebar collapses to an icon rail and stays
that way after a reload; on a 375px phone every page is reachable from the bottom tabs with the player deck above them.

## Not doing

- Rebuilding Android's navigation (it already has Home and tabs).
- Web skins.
- The UX ideas list below until the owner picks some.

## Decisions

A35 (design direction; sidebar ban lifted by A273), A273 (arcade sidebar), A274 (phone bottom tab bar), A275 (icon
rail), A276 (Home shelves). A279 (three web themes), A280 (shelf order, Library buttons stay), A281 (UX ideas 1-3 and 5-10), A282 (Android theme ids).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Routes | `/` is Home, Library to `/library` | Done | [Phase 1](#phase-1-routes) |
| 2. Desktop sidebar | `SideNav`, icon rail, remembered state | Done | [Phase 2](#phase-2-desktop-sidebar) |
| 3. Phone tab bar | `PhoneTabBar` under the player deck | Done | [Phase 3](#phase-3-phone-tab-bar) |
| 4. Home page | Shelves, `GET /albums?sort=added` | Done | [Phase 4](#phase-4-home-page) |
| 5. Walkthrough | Browser checks at 375/900/1440px, docs | In progress | [Phase 5](#phase-5-walkthrough) |

---

## Phase 1: Routes

- [x] `App.tsx`: `/` HomePage (lazy), `/library` LibraryPage, `/manage` to `/library?view=full`
- [x] Every link and check that assumed Library is `/` (nav items, `ShellBackdrop vivid`, stragglers found by grep)

## Phase 2: Desktop sidebar

- [x] One nav-item source shared by sidebar, rail and phone tabs, each with an icon
- [x] `SideNav`: wordmark and toggle; Home, Library, Albums, Artists, Genres; Yours (Favorites, Playlists,
  Listen together, People); your playlists list; avatar, Options, Control Center (admin), Exit
- [x] Icon rail with tooltips; `lib/sidebar.ts` remembers it per device; rail by default between 768 and 1023px
- [x] Arcade look: flat column, solid right border, active item lit in the accent, theme tokens only
- [x] Keeps `leaveThrough()`, nav direction, boot stagger; slim top bar with `GlobalSearch` on desktop
- [x] Sidebar stops above the full-width desktop player deck

## Phase 3: Phone tab bar

- [x] `PhoneTabBar`: Home, Library, Together, You (More for guests)
- [x] Phone player deck sits on the tab bar; page padding clears both; safe-area inset
- [x] Phone header is wordmark plus search; `NavOverflow` removed when unused
- [x] Now Playing sheet covers the tab bar

## Phase 4: Home page

- [x] `Shelf` component: horizontal snap row, prev/next on desktop, See all only where a page exists
- [x] Shelves: Daily mixes, Recently played, Your playlists, Friends listening, On this day, New in your library
- [x] Guests see only guest-safe shelves; empty shelves hide; per-shelf loading and error states
- [x] Backend: `listAlbums` sort `added` by newest track `date_added`; `?sort=added` on `GET /albums`; test

## Phase 5: Walkthrough

- [x] `npm run build` and `npm run lint` in `frontend/`; `npm test` in `backend/` (785/785)
- [x] Playwright at 375, 900x700 and 1440px; guest and account; Deep blue and Crimson (other themes not looked at)
- [x] `DESIGN.md` web shell paragraph; CHANGELOG, FUNCTIONLOG, STATUS
- [ ] Shelves with real data (mixes, playlists, friends, On this day): the scratch DB had none
- [ ] Owner looks at it; real phone; Firefox or Safari

## UX ideas (A281: all but 4)

Built 2026-10-22 except 4. Browser-checked on a scratch copy of the dev DB; Library Full scroll and Albums page 2 not
seen (too little data).

1. Quick picks grid at the top of Home. 2. Jump back in (resume last album, playlist or mix). 3. Play key on card
hover. 4. Drag a song onto a sidebar playlist. 5. Keyboard: `/` search, `[` sidebar, space play/pause. 6. Scroll memory
on Library and Albums. 7. Hide or reorder Home shelves. 8. "Because you played X" radio shelf. 9. Browser tab title
per page and song. 10. Now-playing chip in the rail.

## Change log

- 2026-10-22: plan approved in chat (plan mode).
- 2026-10-22: phone tab bar has four tabs, not five: Search stayed in the phone header (an icon), so a Search tab would
  have been a second door to the same thing. Desktop search stays in the top bar, not the sidebar.
- 2026-10-22: Jump back in is recorded on the device, not the server: the saved queue has no source, and adding one
  means a migration for a Home shelf. Revisit if it should follow you between devices.
- 2026-10-22: the rail's names are one fixed tooltip placed by JavaScript, not CSS `.tip`: a scrolling rail (needed on
  short windows) clipped the CSS ones. The sidebar ends above the player deck via `data-deck` rather than padding.
