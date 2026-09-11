import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { consumeJustEntered, markAtTitle } from '../lib/boot';
import { BrandMark, Wordmark } from './BrandLockup';
import { GlobalSearch } from './GlobalSearch';
import { HandoffDialog } from './HandoffDialog';
import { WordmarkBand, WordmarkColumn } from './WordmarkColumn';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative px-3 py-4 text-sm font-medium transition-colors ${
    isActive ? 'text-white' : 'text-blue-300 hover:text-blue-100'
  }`;

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

/**
 * The bar's order, as data rather than as markup, because two things now need
 * to know it: which tab is active, and whether the one being clicked is to the
 * left or the right of it. A view transition slides the page the way the eye
 * expects only if it knows which way along the bar you went.
 */
function navItemsFor(isAdmin: boolean): NavItem[] {
  return [
    { to: '/', label: 'Library', end: true },
    { to: '/albums', label: 'Albums' },
    { to: '/artists', label: 'Artists' },
    { to: '/favorites', label: 'Favorites' },
    { to: '/playlists', label: 'Playlists' },
    ...(isAdmin
      ? [
          { to: '/upload', label: 'Upload' },
          { to: '/users', label: 'Users' },
        ]
      : []),
    { to: '/health', label: 'Health' },
  ];
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
const FAR_SIZE = 'clamp(3rem, 11vh, 7vw)';
const NEAR_SIZE = 'clamp(4.5rem, 17vh, 11vw)';

const FAR_STROKE = 'rgba(59, 130, 246, 0.13)';
const NEAR_STROKE = 'rgba(59, 130, 246, 0.2)';

/**
 * The crawling bands. Sized between the two column tiers so they belong to the
 * same field rather than sitting in front of it, and stroked at the far tier's
 * weight — they cross the whole screen, including the part with the reading on
 * it, so they are the layer that can least afford to be loud.
 */
const BAND_SIZE = 'clamp(3.5rem, 13vh, 8vw)';
const BAND_STROKE = 'rgba(59, 130, 246, 0.14)';

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
          table body sits and where a line crossing the reading would be a bug
          rather than decoration. Beat counts stay co-prime with the columns'
          (128/97/113/67/53), so nothing in the backdrop ever comes back into
          step with anything else. */}
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

  // Read during the first render after an entry, not in an effect: the classes
  // have to be on the very first paint or the elements flash at full opacity
  // before animating in from nothing.
  const [isBooting, setIsBooting] = useState(consumeJustEntered);

  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navItems = navItemsFor(Boolean(user?.isAdmin));
  const current = activeIndex(navItems, pathname);

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
   * Runs the tab change inside a view transition.
   *
   * **React Router's own `viewTransition` prop does nothing here**, which cost
   * a check to discover: it is a data-router API, and this app is mounted
   * under `<BrowserRouter>`, so the prop is accepted and silently ignored —
   * the page swapped instantly while the CSS sat unused. Calling
   * `document.startViewTransition` directly works under either router and is
   * four lines. `flushSync` is required: the callback must leave the DOM in
   * its new state before it returns, and React would otherwise batch the
   * update until after the snapshot had been taken.
   *
   * Everything about a plain link is preserved on the paths that matter — a
   * modified click (new tab, new window, download) and anything that is not a
   * primary button fall through to the browser untouched.
   */
  function onTabClick(event: MouseEvent<HTMLAnchorElement>, to: string, index: number) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    rememberDirection(index);

    if (!document.startViewTransition) return;

    event.preventDefault();
    document.startViewTransition(() => {
      flushSync(() => navigate(to));
    });
  }

  /**
   * Back to the title screen, still signed in.
   *
   * The flag is the whole mechanism: the title screen redirects a signed-in
   * visitor into the app, and without something to say "this one meant it" the
   * Exit button would bounce straight back off it. Set before navigating, since
   * the title screen reads it on its first render.
   *
   * Not a log out, and deliberately so for a guest — the token stays in this
   * browser, so pressing enter again returns to the same listening history
   * rather than minting a stranger. Discarding the identity is a different,
   * heavier action and it stays behind the warning in "This device".
   */
  function handleExit() {
    markAtTitle();
    navigate('/enter');
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
    <div className="relative min-h-screen bg-blue-950 pb-20 text-white">
      <ShellBackdrop />

      <header className="sticky top-0 z-30 border-b border-blue-800 bg-blue-950">
        <div className="page-shell flex items-center gap-6 px-6">
          <div className={`flex shrink-0 items-center gap-2.5 ${boot('boot-wordmark')}`}>
            <BrandMark className="h-7 w-7 border-2 border-blue-200" />
            <Wordmark className="text-base text-white" />
          </div>
          {/* `boot-nav` staggers its children individually rather than fading
              the row in as a block — a machine naming its parts, not a
              container appearing. */}
          {/* `boot-nav` staggers its children individually rather than fading
              the row in as a block — a machine naming its parts, not a
              container appearing. */}
          <nav className={`flex items-center gap-1 ${isBooting ? 'boot-nav' : ''}`}>
            {navItems.map((item, i) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={(event) => onTabClick(event, item.to, i)}
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
                        named. */}
                    {isActive && <span className="nav-underline" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className={boot('boot-search')}>
            <GlobalSearch />
          </div>
          {/* shrink-0 + nowrap: the nav grew a Users link, and without these the
              right-hand block is the first thing the flex row squeezes — "Log
              out" was wrapping onto two lines and stretching the header. */}
          <div className={`flex shrink-0 items-center gap-2 py-3 text-sm ${boot('boot-account')}`}>
            {/* No name for a guest. The row is called `guest-a83f2c` — a
                database identifier, not a name anybody chose — and the word
                "Guest" standing in its place named nothing the listener did not
                already know, while taking up the width the header can least
                afford. An account still shows its username, which answers a
                question a shared machine can genuinely raise. */}
            {user && !user.isGuest && (
              <span className="mr-1 hidden truncate text-blue-200 lg:inline">{user.username}</span>
            )}
            {user?.isAdmin && <span className="badge-admin mr-1 shrink-0">Admin</span>}
            {user?.isGuest ? (
              // No "Log out" for a guest. There is nothing to log back in
              // with: clearing the token abandons the row and everything on it,
              // so that action belongs behind a warning, not in the header
              // beside everything else. The dialog carries both it and the
              // handoff that makes a second device the same listener.
              <button
                onClick={() => setShowHandoff(true)}
                className="btn-ghost btn-sm shrink-0 whitespace-nowrap"
              >
                This device
              </button>
            ) : (
              <button onClick={logout} className="btn-ghost btn-sm shrink-0 whitespace-nowrap">
                Log out
              </button>
            )}
            {/* Back to the attract screen, session intact — the arcade sense of
                exit, not the account sense. Orange, which in this app is the
                accent nothing else in the header uses: the tab underline, the
                boot frame and the title screen's enter button are all orange,
                so a control that returns you to that screen wearing that colour
                is consistent rather than merely loud. It also stops it reading
                as a second, milder "Log out" sitting beside the real one. */}
            <button
              onClick={handleExit}
              className="btn-primary btn-sm shrink-0 whitespace-nowrap"
              title="Back to the title screen. You stay signed in."
            >
              Exit
            </button>
          </div>
        </div>
        {/* The sign-in banner's accent line, on the edge that plays the same
            role here. Same clock, so both screens pulse together. */}
        <span className="band-sweep band-sweep-rail band-sweep-bottom" />
      </header>

      {/* Named, so it is lifted out of the root snapshot and animates on its
          own while the header — identical between tabs — simply swaps. */}
      <main className={`view-page page-shell relative z-10 px-6 py-6 ${boot('boot-content')}`}>
        <Outlet />
      </main>

      {isBooting && <BootFrame />}

      {showHandoff && <HandoffDialog onClose={() => setShowHandoff(false)} />}
    </div>
  );
}
