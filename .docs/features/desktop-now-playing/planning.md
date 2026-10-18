# Plan: desktop Now Playing view (YouTube Music style)

## Context
On desktop the player is only the bottom bar. Phones get a full Now Playing sheet (`NowPlaying.tsx`), but it is
`md:hidden`, and `isSheetOpen = isExpanded && isPhone` (`PlayerBar.tsx:314`). The owner wants a desktop view that feels
like YouTube Music. Their answers on 2026-10-18:
- Tabs: Up next and Related. Lyrics later, as its own feature.
- Background: a flat tint taken from the cover, with no blur (DESIGN.md bans blur and glow).
- Queue: jump to a song and remove a song. No drag reorder.

Facts this builds on (verified):
- `PlayerContextValue` (`PlayerBar.tsx:234-275`) can only edit the queue through `goTo`. It has no remove.
- Rooms already have a `{ op: 'remove'; entryId }` message (`lib/roomClient.ts:47`, server `services/rooms.ts:324`).
- Related needs no backend. `GET /albums/:id` returns `AlbumDetail` with tracks and `artistId`. `GET /artists/:id`
  returns `ArtistDetail.albums`. Both are open to guests (`guestAccess.test.ts:34,39`). Tracks have only `albumId`, no
  `artistId` (`types/api.ts:19-39`), so the artist comes from the album.
- The desktop bar is `fixed bottom-0 z-40`, about 60 px tall (`PlayerBar.tsx:1998`). The header is `sticky z-30`.
- Nothing in the app extracts colour from artwork yet.

## Layout (md and up only; phones keep the sheet)
- `fixed inset-x-0 top-0 z-[35]`, bottom inset by the bar's height, so the bar stays visible and keeps working.
- Left column: a large square cover (`min(62vh, 44vw)`), the title in Barlow Condensed, and artist and album as links.
  Like and add to playlist sit below.
- Right column: tabs "Up next" and "Related", with an orange underline that slides between them. The list scrolls on its
  own.
  - **Up next:** the current song first with a small 3-bar level meter, which only moves while playing. Then the rest:
    number, cover, title, artist, length. Click a row to jump (`goTo`). On hover an X removes the row (hidden on the
    current song). The row collapses as it goes. In a room the X sends the room's remove op.
  - **Related:** "More from this album" (album tracks except the current one; a click plays the album from that track
    through `playQueue`). Then "More by {artist}", a small album strip linking to album pages, which closes the view.
    Each part says plainly when there is nothing to show (no album id, a single, unknown artist).
- Close: a chevron button top left, Escape (unless a dialog is open), or any route change. Space, N and P keep working.
- Open: click the cover or title in the desktop bar, or a new expand chevron at the bar's right end. The chevron turns
  180° while the view is open.

## Motion (reuses the kit from the last pass)
- Open: the view rises 24 px and fades in over 400 ms on `--ease-out-expo`. Close: falls and fades over 240 ms. Through
  `Presence`.
- Song change: the cover lands with `np-art`, and the title slides in with `useSwapClass`.
- Tabs: the underline slides with `--ease-spring`, and the panels cross-fade. Up next rows rise with `motion-rise`.
- Tint: `--np-tint` is registered with `@property` as `<color>` and transitions over 600 ms, so the colour flows from
  song to song.
- Everything is added to the reduced-motion block. Under reduced motion the meter is still and the tint swaps
  instantly.

## Implementation
1. **`PlayerBar.tsx`**
   - Add `removeAt(at)` to the context. In a room, send `{ op: 'remove', entryId }`. Otherwise drop the song from
     `queue` and from `originalQueueRef`. Lower `index` when the removed song came before the current one. Refuse
     `at === index`. If the removed song was the next one, clear the preloaded spare and the gapless transition the
     way a queue change already does. Check `preloadRef` and `clearTransition()` while implementing.
   - Mount `<Presence value={isExpanded && !isPhone ...}>` with `DesktopNowPlaying`.
   - Add the expand button and make the bar's cover and title clickable.
   - Close on route change (`useLocation`, already imported).
2. **New `components/DesktopNowPlaying.tsx`**: the view above. It reuses `CoverArt`, `FavoriteButton`,
   `AddToPlaylistDialog` (in `Presence`), `useScrollLock`, `formatClock` (the helper `NowPlaying` uses), and React Query
   for `['album', albumId]` and `['artist', artistId]`. Match the keys the album and artist pages use, so their cache is
   shared.
3. **New `hooks/useCoverTint.ts`**:
   - Get the cover's object URL through `useMediaUrl` / `buildCoverUrl('tracks', id, 'thumb')` (both already
     cached) and draw it on a 16×16 canvas.
   - Average the more saturated pixels and cap the lightness, so white text on the wash stays above 4.5:1.
   - Return an `rgb()` string, or null so the theme is used.
   - The wash is `color-mix` of the tint at about 40% into `--app-ground`, top to bottom. It is a flat colour field,
     not a blur.
4. **`index.css`**: the `@property --np-tint`, the open and close keyframes, the tab underline, the row collapse, the
   level meter, and the reduced-motion entries.

## Docs
- Save this plan to `.docs/features/desktop-now-playing/planning.md` (repo rule for approved feature plans).
- `.docs/QUESTIONS.md`: Q210 (motion follow-ups: swipe down yes, label "Back", hover lift yes, desktop view yes) and
  Q211 (tabs, tint, queue edit), both answered in chat. A-entries newest first.
- DESIGN.md: one line under Motion or Palette that the desktop Now Playing wash is the one place colour comes from the
  cover, flat and mixed into the theme ground.
- CHANGELOG and FUNCTIONLOG entries for `removeAt`, `useCoverTint` and `DesktopNowPlaying`.

## Verification
1. `free -h`, then `npx tsc -b`, `npm run build`, `npm run lint` in `frontend/`.
2. Signed-in browser check. Use the isolated backend from the memory note "try on the real library safely": a copied
   DB, never the container, and never sign in against `:3000`. Run Playwright at 1280×800:
   - Open the view from the bar, then close it with the chevron, with Escape, and by navigating.
   - Switch tabs.
   - Remove a row before the current song and check the current song keeps playing and the counter is right.
   - Remove the next row and check the next skip plays the right song.
   - Skip, and check the tint and cover change.
   - Play from Related.
   - Repeat at 390 px to confirm phones still get the sheet.
   - Repeat with reduced motion.
3. Screenshots go to the owner. Nothing is committed or pushed unless asked; a push to `main` deploys to production.

## Unresolved questions
1. Should the phone sheet get the same remove X and Related section later, or stay as it is?
