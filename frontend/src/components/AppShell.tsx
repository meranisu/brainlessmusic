import { useEffect, useState, type MouseEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { consumeJustEntered, markAtTitle } from '../lib/boot';
import { arrivalDuration, interstitialDuration } from '../lib/interstitial';
import { BrandMark, Wordmark } from './BrandLockup';
import { GlobalSearch } from './GlobalSearch';
import { HandoffDialog } from './HandoffDialog';
import { ArcadeInterstitial, ArrivalVeil } from './ArcadeInterstitial';
import { FloatingMotes, SpinRing } from './BackdropDepth';
import { ExitIcon, GearIcon } from './icons';
import { NavOverflow, type NavItem } from './NavOverflow';
import { WordmarkBand, WordmarkColumn } from './WordmarkColumn';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `nav-tab ${isActive ? 'nav-tab-active' : ''}`;

/**
 * The bar's order, as data rather than as markup, because three things need to
 * know it: which tab is active, whether the one being clicked is to the left or
 * the right of it, and which of them fit.
 *
 * Split in two because the bar does not fit and never did. Six tabs measured
 * **933px at a 390px viewport** — every page scrolled sideways on a phone — and
 * five would still measure ~375px before the wordmark, the search box or a
 * single button. So `primary` is what earns a place on the bar at `lg` and up,
 * and `overflow` is what lives behind **More** at every width: Upload and Users
 * are administrative, and Health is a thing you visit when something is wrong.
 * Below `lg` the primary tabs join them there.
 *
 * The breakpoint is `lg` and not `md` because `md` was measured and found
 * wanting: at exactly 768px the five tabs plus the brand, More, Options and
 * Exit came to 785px inside a 721px bar, and the page scrolled sideways again —
 * the very fault this split exists to fix, moved rather than removed.
 */
function navItemsFor(isAdmin: boolean): { primary: NavItem[]; overflow: NavItem[] } {
  return {
    primary: [
      { to: '/', label: 'Library', end: true },
      { to: '/albums', label: 'Albums' },
      { to: '/artists', label: 'Artists' },
      { to: '/favorites', label: 'Favorites' },
      { to: '/playlists', label: 'Playlists' },
    ],
    overflow: [
      ...(isAdmin
        ? [
            { to: '/manage', label: 'Manage' },
            { to: '/upload', label: 'Upload' },
            { to: '/users', label: 'Users' },
          ]
        : []),
      { to: '/health', label: 'Health' },
    ],
  };
}

/** Which tab the current URL belongs to, or -1 for a page that has no tab. */
function activeIndex(items: NavItem[], pathname: string): number {
  return items.findIndex((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}

/**
 * Two tiers, at different sizes and speeds, running in opposite directions.
 *
 * That is the whole trick: a single sheet of scrolling type reads as a sheet
 * of scrolling type. Two of them passing each other at different rates reads
 * as depth, and costs nothing extra — the near tier is bigger, brighter and
 * quicker, which is what "nearer" means to an eye.
 *
 * Beat counts are co-prime so no two columns ever line up and the field never
 * visibly loops. Every duration is in beats rather than seconds, so this keeps
 * time with the title screen and the player.
 */
/* Three sizes rather than two. With only a far and a near tier the field reads
   as two planes; a middle one turns it into a gradient of distance, and it is
   the cheapest way to make the same number of elements look like more depth. */
const FAR_SIZE = 'clamp(2.5rem, 8vh, 5vw)';
const MID_SIZE = 'clamp(3.5rem, 12.5vh, 8vw)';
const NEAR_SIZE = 'clamp(5.5rem, 20vh, 13vw)';

/* Named in CSS rather than written here, so a theme can reach them. A colour
   inlined in a component is a colour no `[data-theme]` selector can override,
   which is precisely how a red theme ends up with a blue backdrop. The values
   and the reasoning for them live on `:root` in `index.css`. */
const FAR_STROKE = 'var(--backdrop-far)';
const MID_STROKE = 'var(--backdrop-mid)';
const NEAR_STROKE = 'var(--backdrop-near)';

/**
 * The crawling bands. Sized between the two column tiers so they belong to the
 * same field rather than sitting in front of it, and stroked at the far tier's
 * weight — they cross the whole screen, including the part with the reading on
 * it, so they are the layer that can least afford to be loud.
 */
const BAND_SIZE = 'clamp(3.5rem, 13vh, 8vw)';
const BAND_STROKE = 'var(--backdrop-band)';

/**
 * The app's moving backdrop. Full-bleed since 2026-09-11; it used to be two
 * columns confined to the gutters and hidden below `2xl`, for the good reason
 * that decoration behind a data table is a bug rather than a feature.
 *
 * Going full-bleed keeps that constraint and answers it with a mask instead of
 * a breakpoint: `.shell-backdrop` holds the middle of the screen — where the
 * content column actually sits — at a fraction of the strength it has in the
 * gutters. Motion is visible everywhere, and loudest where there is nothing to
 * read. The measured cost to a track row is in the change log; it is under a
 * unit of colour per channel.
 *
 * Below `md` the inner columns drop out. A phone has no gutters, so every
 * column there is behind the text, and three of them is clutter rather than
 * depth.
 */
/**
 * How long the staged assembly may hold the app back, in total. A little
 * longer than the last stage's delay plus its duration, so nothing is cut
 * short — and short enough that a broken animation is a glitch rather than an
 * outage. Must stay ahead of the delays in `index.css`.
 */
const BOOT_MS = 1500;

function ShellBackdrop() {
  return (
    <div aria-hidden className="shell-backdrop pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Deepest. Behind every piece of type, and the only orange back here. */}
      <SpinRing />

      {/* Far tier — small, faint, slow, climbing. */}
      <WordmarkColumn className="left-[-3%]" size={FAR_SIZE} beats={128} stroke={FAR_STROKE} />
      <WordmarkColumn
        className="left-[43%] hidden lg:block"
        size={FAR_SIZE}
        beats={97}
        offset={-31}
        stroke={FAR_STROKE}
      />
      <WordmarkColumn className="right-[-3%]" size={FAR_SIZE} beats={113} offset={-17} stroke={FAR_STROKE} />

      {/* Middle tier — the one that turns two planes into a sense of distance. */}
      <WordmarkColumn
        className="left-[9%] hidden xl:block"
        size={MID_SIZE}
        beats={83}
        offset={-53}
        stroke={MID_STROKE}
        reverse
      />
      <WordmarkColumn
        className="left-[57%] hidden xl:block"
        size={MID_SIZE}
        beats={103}
        offset={-11}
        stroke={MID_STROKE}
      />

      {/* Motes drift through the type rather than behind it, so they cross in
          front of some columns and behind others. */}
      <FloatingMotes />

      {/* Near tier — larger, brighter, quicker, and falling against the rest. */}
      <WordmarkColumn
        className="left-[19%] hidden md:block"
        size={NEAR_SIZE}
        beats={67}
        stroke={NEAR_STROKE}
        reverse
      />
      <WordmarkColumn
        className="left-[68%] hidden md:block"
        size={NEAR_SIZE}
        beats={53}
        offset={-23}
        stroke={NEAR_STROKE}
        reverse
      />

      {/* Two bands crossing the columns, in opposite directions and at
          different heights. The columns give the field a grain; a grain has no
          direction, and after a few seconds the eye stops reading it as motion
          at all. Something travelling the full width is what it follows.

          Placed high and low on purpose — off the vertical middle, where the
          content sits and where a line crossing the reading would be a bug
          rather than decoration. Every beat count in this backdrop is co-prime
          with every other (128/97/113/83/103/67/53/149/181, and the ring's
          340/289/233/181), so nothing ever comes back into step. */}
      <WordmarkBand
        className="top-[14%]"
        size={BAND_SIZE}
        beats={149}
        stroke={BAND_STROKE}
      />
      <WordmarkBand
        className="bottom-[16%]"
        size={BAND_SIZE}
        beats={181}
        offset={-41}
        stroke={BAND_STROKE}
        reverse
      />
    </div>
  );
}

/**
 * One lap of the frame in orange, then gone.
 *
 * `pathLength="1"` rescales the dash maths into units of "the whole
 * perimeter", so a dash of 0.34 is a third of the way round at any window size
 * with nothing measured and no resize observer.
 *
 * **No `viewBox`, deliberately.** A viewBox plus `preserveAspectRatio="none"`
 * is the obvious way to make an SVG fill a box, and it cost two rounds of this
 * to get right: the non-uniform scale turns a 2-unit stroke into a 25px slab
 * down one side and 16px along the other, and `vector-effect:
 * non-scaling-stroke` then fixes the thickness but moves the *dash* into
 * screen space while its length still came from user space — which draws ten
 * stubby segments round the border instead of one line running it. With no
 * viewBox, user units are CSS pixels, the scale is uniform, and neither
 * problem exists. The rect's geometry comes from CSS, where percentages
 * resolve against the element box.
 */
function BootFrame() {
  return (
    <svg className="boot-frame" aria-hidden>
      <rect pathLength="1" />
    </svg>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const [showHandoff, setShowHandoff] = useState(false);
  const [showMore, setShowMore] = useState(false);
  /** The card playing over everything, if any. Null the rest of the time. */
  const [leaving, setLeaving] = useState<{ text: string; detail?: string } | null>(null);
  /** Black still covering the page just arrived on, lifting off it. */
  const [arriving, setArriving] = useState(false);

  // Read during the first render after an entry, not in an effect: the classes
  // have to be on the very first paint or the elements flash at full opacity
  // before animating in from nothing.
  const [isBooting, setIsBooting] = useState(consumeJustEntered);

  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { primary, overflow } = navItemsFor(Boolean(user?.isAdmin));
  const current = activeIndex(primary, pathname);

  /**
   * Leaves through a card: a line of type at size, a held beat, a fade to
   * black, and only then the navigation.
   *
   * The overlay is opaque and the app stays mounted underneath it, so nothing
   * is torn down to play this — if the navigation never happened the app would
   * simply still be there. Guarded against a second press, because two cards
   * racing each other is two timers racing each other.
   */
  function leaveThrough(card: { text: string; detail?: string }, to: string, onNavigate?: () => void) {
    if (leaving) return;
    const wait = interstitialDuration();
    if (wait === 0) {
      onNavigate?.();
      navigate(to);
      return;
    }
    setLeaving(card);
    setTimeout(() => {
      // Order matters. The card's blackout has just finished opaque and the
      // veil begins opaque, so swapping one for the other in the same commit
      // means the route changes under cover and nothing is ever seen to cut.
      //
      // `onNavigate` fires here rather than up front for the same reason —
      // Exit uses it to clear the session, and clearing it before the card
      // is up would drop `RequireAuth`'s guard mid-animation and unmount this
      // whole overlay along with the page underneath it.
      onNavigate?.();
      navigate(to);
      setLeaving(null);

      const reveal = arrivalDuration();
      if (reveal === 0) return;
      setArriving(true);
      setTimeout(() => setArriving(false), reveal);
    }, wait);
  }

  /**
   * Records which way along the bar this click is going, for the CSS to read.
   * Set on the click rather than after the navigation because that is the only
   * moment both the old tab and the new one are known — and it lands before
   * `startViewTransition` runs its animations, which is when the attribute is
   * consulted.
   *
   * Falls back to `forward` from a page with no tab of its own (an album
   * detail, say), where "which way" has no answer.
   */
  function rememberDirection(target: number) {
    /* The lint rule below wants this moved into an effect, which would be
       wrong rather than merely different: an effect runs *after* the
       navigation, and this attribute has to be set before
       `startViewTransition` takes its snapshot. Mutating the DOM inside an
       event handler is exactly where a side effect belongs. */
    // oxlint-disable-next-line react/immutability
    document.documentElement.dataset.navDir = current >= 0 && target < current ? 'back' : 'forward';
  }

  /**
   * Changes tabs through the same card the rest of the bar leaves through.
   *
   * **This replaced the directional view transition**, and the replacement is
   * total rather than additive: the card is opaque and covers the whole
   * viewport, so a page sliding in underneath it is a snapshot nobody can see
   * and a composite nobody asked for. Running both would be paying twice for
   * one effect and showing neither properly.
   *
   * What was lost is worth naming, in case it is wanted back: the old
   * transition slid the outgoing page left or right depending on which way you
   * moved along the bar, which gave the tabs a sense of position. The card
   * trades that for the section announcing itself, which is the arcade idiom.
   * `rememberDirection` is kept because the CSS that reads `data-nav-dir` is
   * still there, so restoring the slide is a matter of putting four lines back
   * rather than rebuilding it.
   *
   * It runs at the **same length as Exit and Options** — 1,420ms. It briefly
   * ran at 620ms on my reasoning that a card on every navigation would start to
   * feel like a toll; the owner compared the two and the short one read as
   * hurried beside the long one. A transition inconsistent with itself is worse
   * than one that is merely unhurried.
   *
   * Everything about a plain link is preserved on the paths that matter — a
   * modified click (new tab, new window, download) and anything that is not a
   * primary button fall through to the browser untouched.
   */
  function onTabClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem, index: number) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Already here. A card for a navigation that changes nothing is a wait for
    // no reason.
    if (index === current) return;

    rememberDirection(index);
    event.preventDefault();
    leaveThrough({ text: item.label }, item.to);
  }

  /**
   * Back to the title screen — still signed in for a guest, signed out for a
   * real account.
   *
   * The flag is the whole mechanism: the title screen redirects a signed-in
   * visitor into the app, and without something to say "this one meant it" the
   * Exit button would bounce straight back off it. Set before navigating, since
   * the title screen reads it on its first render.
   *
   * Not a log out for a guest, and deliberately so — the token stays in this
   * browser, so pressing enter again returns to the same listening history
   * rather than minting a stranger. Discarding *that* identity is a different,
   * heavier action and it stays behind the warning in "This device".
   *
   * A real account is the opposite trade: it has a password, so nothing is
   * lost by making Exit actually sign it out, and a shared device is exactly
   * where an admin session left open is the more likely mistake. `logout` runs
   * as `leaveThrough`'s `onNavigate`, not before — see the comment there.
   */
  function handleExit() {
    markAtTitle();
    leaveThrough(
      { text: 'Thank you for using this system', detail: 'See you again' },
      '/enter',
      user?.isGuest ? undefined : logout,
    );
  }

  /**
   * The sequence gets a deadline, and this is not belt-and-braces — it is the
   * fix for a real bug. The staged classes hide content that has *already
   * loaded*, so anything that disturbs the animation leaves the app blank:
   * React StrictMode remounts every component in development, which recreates
   * these elements and restarts their animations, delay and all. Measured
   * before this: the track list was still at opacity 0 a second and a half
   * after entering, on the dev server the owner actually uses.
   *
   * With a deadline the worst case is a sequence that finishes abruptly. With
   * only CSS, the worst case is an app that never appears.
   */
  useEffect(() => {
    if (!isBooting) return;
    const done = setTimeout(() => setIsBooting(false), BOOT_MS);
    return () => clearTimeout(done);
  }, [isBooting]);

  const boot = (stage: string) => (isBooting ? `boot-stage ${stage}` : '');

  return (
    <div className="app-ground relative min-h-screen pb-20 text-white">
      <ShellBackdrop />

      {/*
        Floating, and taller than it was. The bar used to be a full-width band
        welded to the top of the page; it is now a panel with air around it,
        which is what an arcade frame looks like and — more usefully — lets the
        moving backdrop run behind and around it instead of stopping at a hard
        edge.

        `sticky` rather than `fixed`, so the bar keeps its place in the document
        and the page below needs no compensating padding that would have to be
        kept in sync with the bar's height by hand.

        The gradient on the wrapper is doing real work: with a detached bar,
        content scrolls through the gap above it, and a hard cut there looks
        like a rendering fault. Fading the page out behind that strip makes the
        bar read as floating over the content rather than punched through it.
      */}
      <header className="sticky top-0 z-30 bg-gradient-to-b from-blue-950 via-blue-950/90 to-transparent px-3 pb-4 pt-3 sm:px-4">
        <div className="shell-bar page-shell relative flex items-center gap-3 rounded-xl border border-blue-700 bg-blue-950/92 px-3 backdrop-blur-md sm:gap-5 sm:px-5">
          <div className={`flex shrink-0 items-center gap-2.5 ${boot('boot-wordmark')}`}>
            <BrandMark className="h-8 w-8 border-2 border-blue-200" />
            {/* The word goes below `sm`; the mark alone still identifies the
                app, and those ~140px are the difference between a bar that
                fits a phone and one that does not. */}
            <Wordmark className="hidden text-base text-white sm:block" />
          </div>

          {/* Divides the brand from the navigation. The bar is one continuous
              strip of unrelated things otherwise — a logo, some tabs, a search
              box, some buttons — and a rule here says which of them is the
              name of the thing and which is the controls, the way a game's
              frame separates its title plate from its menu. Shorter than the
              bar so it reads as a seam rather than a wall. */}
          <span aria-hidden className="h-7 w-px shrink-0 bg-blue-700/80" />

          {/* Tabs and More share one wrapper so `gap-1` sits between all of
              them equally, More included — a tab's distance from its
              neighbour is the same as Playlists's distance from More, instead
              of the tight cluster of tabs this used to be next to a More set
              apart by the bar's own wider gap.

              That gap has to stay `gap-1` and not the bar's own `gap-3
              sm:gap-5` — this row was measured at 933px of tabs alone at a
              390px viewport, and widening every gap in it here reproduces
              that overflow at a wider, but still real, viewport. The bar's
              wider gap keeps doing its job everywhere else: between the
              divider and this wrapper, and between this wrapper and search.

              The wrapper itself is always `flex`, never `hidden` — only
              `nav` hides below `lg`. More has to survive that: it's the only
              way a guest on a phone reaches the primary tabs at all, so it
              cannot disappear along with them. Below `lg`, `nav` is
              `display: none` and contributes no width, so this wrapper's own
              `gap-1` has nothing on its left to space against — More just
              sits where it always did. */}
          <div className="flex items-center gap-1">
            {/* `boot-nav` staggers its children individually rather than
                fading the row in as a block — a machine naming its parts, not
                a container appearing. */}
            <nav className={`hidden items-center gap-1 lg:flex ${isBooting ? 'boot-nav' : ''}`}>
              {primary.map((item, i) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={(event) => onTabClick(event, item, i)}
                  className={navLinkClass}
                >
                  {({ isActive }) => (
                    <>
                      {item.label}
                      {/* The underline is a real element, present only in the
                          active tab, so exactly one of them exists at a time —
                          which is what lets it carry a `view-transition-name`
                          and slide between tabs instead of cross-fading. It was
                          an `::after` before, and a pseudo-element cannot be
                          named.

                          The overflow menu repeats these links below `lg` and
                          deliberately gives them no underline: a second element
                          carrying the same name does not merely look wrong, it
                          disables the transition for the whole page. Below `lg`
                          this whole nav is `display: none`, so nothing here is
                          rendered to collide with it. */}
                      {isActive && <span className="nav-underline" />}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <NavOverflow
              className={boot('boot-more')}
              primary={primary}
              overflow={overflow}
              isOpen={showMore}
              onToggle={() => setShowMore((open) => !open)}
              onClose={() => setShowMore(false)}
            />
          </div>

          {/* A plain spacer takes the slack, and search keeps its natural width
              beside the buttons.

              Stretching the search wrapper itself was the obvious thing and it
              was wrong: `GlobalSearch` is a `relative` box with a fixed-width
              input and its `/` hint pinned to `right-2`, so a wrapper that grew
              left the badge stranded 100px away from the field it belongs to. */}
          {/* `flex` with `justify-end`, not `block`. The wrapper needs to take
              the bar's slack (so the two ends stay put as the window changes)
              while the box inside it keeps its own width — `GlobalSearch` is a
              `relative` container with its `/` hint pinned to `right-2`, so a
              wrapper that stretched it left the badge stranded 100px from the
              field it labels. A flex child sizes to its content on the main
              axis; a block child fills. */}
          <div className={`hidden min-w-0 flex-1 justify-end lg:flex ${boot('boot-search')}`}>
            <GlobalSearch />
          </div>
          <div className="flex-1 lg:hidden" />

          <div className={`relative flex shrink-0 items-center gap-2 py-3 text-sm ${boot('boot-account')}`}>
            {user?.isAdmin && <span className="badge-admin mr-1 hidden shrink-0 xl:inline">Admin</span>}

            {/* Icons, not words. Two labelled buttons were the widest thing on
                the right of a bar that had no room to spare, and these two are
                the only controls here that have a universally understood
                picture — a gear and a door. The tooltip is `.tip` rather than
                the native `title` attribute, which waits about a second before
                appearing: long enough that an icon-only control reads as
                unlabelled in exactly the moment someone is wondering what it
                is. `aria-label` carries the same text for anyone not hovering. */}
            <button
              onClick={() =>
                leaveThrough({ text: 'Options', detail: 'Settings for this device' }, '/options')
              }
              aria-label="Options"
              data-tip="Options"
              className="tip btn-ghost btn-sm shrink-0 px-2"
            >
              <GearIcon className="h-5 w-5" />
            </button>

            {/* Back to the attract screen — session intact for a guest (the
                arcade sense of exit, not the account sense), signed out for a
                real account (see `handleExit`). Orange, which in this app is
                the accent nothing else in the bar uses: the tab underline,
                the boot frame and the title screen's enter button are all
                orange, so the control that returns you to that screen wears
                its colour. */}
            <button
              onClick={handleExit}
              aria-label={user?.isGuest ? 'Exit to the title screen' : 'Log out and exit to the title screen'}
              data-tip={user?.isGuest ? 'Exit — you stay signed in' : 'Exit — signs you out'}
              className="tip btn-primary btn-sm shrink-0 px-2"
            >
              <ExitIcon className="h-5 w-5" />
            </button>
          </div>

          {/* The sign-in banner's accent line. It used to run along the
              header's full-width bottom edge; with the bar detached it belongs
              to the bar and has to be clipped to its rounded corners.

              Its own layer, rather than `overflow-hidden` on the bar itself —
              the bar is the positioning context for two dropdowns that hang
              *below* it, and clipping there would have swallowed both menus
              whole. Same clock as the title screen, so both pulse together. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
          >
            <span className="band-sweep band-sweep-rail band-sweep-bottom" />
          </span>
        </div>
      </header>

      {/* Named, so it is lifted out of the root snapshot and animates on its
          own while the header — identical between tabs — simply swaps. */}
      {/* `page-enter` while the veil lifts: the content rises into place rather
          than being uncovered already settled. A reveal alone is the curtain
          moving; this is the thing behind it arriving, which is the difference
          between a transition and a wipe. */}
      <main
        className={`view-page page-shell relative z-10 px-6 py-6 ${boot('boot-content')} ${
          arriving ? 'page-enter' : ''
        }`}
      >
        <Outlet />
      </main>

      {isBooting && <BootFrame />}

      {showHandoff && <HandoffDialog onClose={() => setShowHandoff(false)} />}

      {/* Over everything, including the player bar — this is the cabinet
          changing screens, not a dialog inside one. */}
      {leaving && <ArcadeInterstitial text={leaving.text} detail={leaving.detail} />}
      {arriving && <ArrivalVeil />}
    </div>
  );
}
