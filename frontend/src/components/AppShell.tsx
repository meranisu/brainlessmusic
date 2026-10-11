// import { useEffect, useState, type MouseEvent } from 'react';
// import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { consumeJustEntered, markAtTitle } from '../lib/boot';
import { arrivalDuration, interstitialDuration } from '../lib/interstitial';
import { BrandMark, Wordmark } from './BrandLockup';
import { GlobalSearch } from './GlobalSearch';
import { HandoffDialog } from './HandoffDialog';
import { ArcadeInterstitial, ArrivalVeil } from './ArcadeInterstitial';
import { ShellBackdrop } from './BackdropDepth';
import { CloseIcon, ExitIcon, GearIcon, SearchIcon } from './icons';
import { NavOverflow, type NavItem } from './NavOverflow';

/** Must match `.options-panel.is-closing` in `index.css`; the search panel reuses the More menu's chrome. */
const SEARCH_CLOSE_MS = 160;

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `nav-tab ${isActive ? 'nav-tab-active' : ''}`;

/**
 * Tab order as data (active tab, click direction, what fits). Six tabs measured 933px at a 390px viewport, so only
 * `primary` sits on the bar from `lg` (at `md` it overflowed 785px into 721px); `overflow` lives behind More.
 */
function navItemsFor(isAdmin: boolean, isGuest: boolean): { primary: NavItem[]; overflow: NavItem[] } {
  return {
    primary: [
      { to: '/', label: 'Library', end: true },
      { to: '/albums', label: 'Albums' },
      { to: '/artists', label: 'Artists' },
      // Guests are listen-only (A37).
      ...(isGuest
        ? []
        : [
            { to: '/favorites', label: 'Favorites' },
            { to: '/playlists', label: 'Playlists' },
          ]),
    ],
    overflow: [
      // Everyone, guests included (A100). Behind More: a sixth tab doesn't fit the bar (see above).
      { to: '/together', label: 'Listen together' },
      ...(isAdmin
        ? [
            { to: '/upload', label: 'Upload' },
            { to: '/users', label: 'Users' },
            { to: '/control-center', label: 'Control Center' },
          ]
        : []),
    ],
  };
}

/** Which tab the current URL belongs to, or -1 for a page that has no tab. */
function activeIndex(items: NavItem[], pathname: string): number {
  return items.findIndex((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}

/** Deadline for the staged entry, just past the last stage; must stay ahead of the delays in `index.css`. */
const BOOT_MS = 1500;

/**
 * One orange lap of the frame. `pathLength="1"` makes the dash a fraction of the perimeter at any size. No `viewBox`:
 * with `preserveAspectRatio="none"` the stroke scales unevenly and the dash breaks into segments.
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

  /** The mobile search panel: below `lg` the bar has no room for `GlobalSearch`, so this is a phone's only search. */
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const wasMobileSearchOpen = useRef(showMobileSearch);
  const [isMobileSearchClosing, setIsMobileSearchClosing] = useState(false);

  // Stays mounted through the close so the panel can animate back into its icon.
  useEffect(() => {
    if (wasMobileSearchOpen.current && !showMobileSearch) {
      setIsMobileSearchClosing(true);
      const timer = setTimeout(() => setIsMobileSearchClosing(false), SEARCH_CLOSE_MS);
      wasMobileSearchOpen.current = showMobileSearch;
      return () => clearTimeout(timer);
    }
    wasMobileSearchOpen.current = showMobileSearch;
  }, [showMobileSearch]);

  const mobileSearchVisible = showMobileSearch || isMobileSearchClosing;

  useEffect(() => {
    if (!mobileSearchVisible) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowMobileSearch(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileSearchVisible]);

  /** The card playing over everything, if any. Null the rest of the time. */
  const [leaving, setLeaving] = useState<{ text: string; detail?: string } | null>(null);
  /** Black still covering the page just arrived on, lifting off it. */
  const [arriving, setArriving] = useState(false);

  // Read on the first render, so the boot classes are on the first paint and nothing flashes.
  const [isBooting, setIsBooting] = useState(consumeJustEntered);

  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { primary, overflow } = navItemsFor(Boolean(user?.isAdmin), Boolean(user?.isGuest));
  const current = activeIndex(primary, pathname);

  /** Leaves through a card (type, a held beat, fade to black), then navigates. The app stays mounted underneath. */
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
      // Swap card for veil in one commit, both opaque, so the route changes unseen. `onNavigate` (Exit's logout) runs
      // here, since logging out earlier would unmount this overlay mid-animation.
      onNavigate?.();
      navigate(to);
      setLeaving(null);

      const reveal = arrivalDuration();
      if (reveal === 0) return;
      setArriving(true);
      setTimeout(() => setArriving(false), reveal);
    }, wait);
  }

  /** Records which way along the bar the click goes, before `startViewTransition` reads it. `forward` off-tab. */
  function rememberDirection(target: number) {
    /* An effect would run after navigation, too late for the snapshot; a DOM write in a handler is correct here. */
    // oxlint-disable-next-line react/immutability
    document.documentElement.dataset.navDir = current >= 0 && target < current ? 'back' : 'forward';
  }

  /**
   * Changes tabs through the same card as Exit and Options (1,420ms; a shorter one read as hurried). It replaced the
   * directional slide; `rememberDirection` and the CSS stay, so the slide can return. Modified clicks pass through.
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
   * Back to the title screen, signed out, guests included (to keep a guest identity, use Options' "Move or forget").
   * The flag stops the title screen bouncing a signed-in visitor back in. `logout` runs in `leaveThrough`.
   */
  function handleExit() {
    markAtTitle();
    leaveThrough(
      { text: 'Thank you for using this system', detail: 'See you again' },
      '/',
      logout,
    );
  }

  /**
   * A deadline for the boot sequence: StrictMode remounts restart the animations, which left loaded content at opacity 0.
   * Worst case now is an abrupt finish, not a blank app.
   */
  useEffect(() => {
    if (!isBooting) return;
    const done = setTimeout(() => setIsBooting(false), BOOT_MS);
    return () => clearTimeout(done);
  }, [isBooting]);

  const boot = (stage: string) => (isBooting ? `boot-stage ${stage}` : '');

  return (
    <div className="app-ground relative min-h-screen pb-20 text-white">
      {/* Vivid on the Library, whose cards give text its own ground; other pages keep the restrained backdrop. */}
      <ShellBackdrop vivid={pathname === '/'} />

      {/* A floating, sticky panel. The gradient fades content scrolling through the gap above it. */}
      <header className="sticky top-0 z-30 select-none bg-linear-to-b from-blue-950 via-blue-950/90 to-transparent px-3 pb-4 pt-3 sm:px-4">
        <div className="shell-bar page-shell relative flex items-center gap-3 rounded-xl border border-blue-700 bg-blue-950/92 px-3 sm:gap-5 sm:px-5">
          <Link
            to="/"
            className={`flex shrink-0 items-center gap-2.5 ${boot('boot-wordmark')}`}
          >
            <BrandMark className="h-8 w-8 border-2 border-blue-200" />
            {/* The word hides below `sm`; those ~140px decide whether the bar fits a phone. */}
            <Wordmark className="hidden text-base text-white sm:block" />
          </Link>

          {/* Separates the name from the controls, like a game's title plate. */}
          <span aria-hidden className="h-7 w-px shrink-0 bg-blue-700/80" />

          {/* One wrapper so `gap-1` spaces tabs and More evenly; wider gaps here bring back the overflow. Always
              `flex`: below `lg` only `nav` hides, and More is a phone's only route to the tabs. */}
          <div className="flex items-center gap-1">
            {/* `boot-nav` staggers each tab in rather than fading the row as a block. */}
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
                      {/* A real element in the active tab only, so it can carry a `view-transition-name` and slide.
                          The overflow menu's links get none: a duplicate name disables the transition. */}
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

          {/* Takes the bar's slack with `justify-end` so `GlobalSearch` keeps its width; stretching it would strand
              its `/` hint 100px from the field. */}
          <div className={`hidden min-w-0 flex-1 justify-end lg:flex ${boot('boot-search')}`}>
            <GlobalSearch />
          </div>

          {/* Below `lg`, search's only way in. `min-w-0` lets it shrink, or it pushes the gear and exit off-screen. */}
          <div className="flex min-w-0 flex-1 justify-end lg:hidden">
            <button
              onClick={() => setShowMobileSearch((open) => !open)}
              aria-label="Search"
              aria-expanded={showMobileSearch}
              data-tip="Search"
              className="tip btn-ghost btn-sm shrink-0 px-2"
            >
              <SearchIcon className="h-5 w-5" />
            </button>
          </div>

          <div className={`relative flex shrink-0 items-center gap-2 py-3 text-sm ${boot('boot-account')}`}>
            {user?.isAdmin && <span className="badge-admin mr-1 hidden shrink-0 xl:inline">Admin</span>}

            {/* Icons (a gear and a door) to save width. `.tip` shows at once, unlike `title`; `aria-label` carries the text. */}
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

            {/* Back to the title screen, signed out (see `handleExit`). Orange, the title screen's colour. */}
            <button
              onClick={handleExit}
              aria-label="Log out and exit to the title screen"
              data-tip="Exit (signs you out)"
              className="tip btn-primary btn-sm shrink-0 px-2"
            >
              <ExitIcon className="h-5 w-5" />
            </button>
          </div>

          {/* The accent line, on its own clipped layer: `overflow-hidden` on the bar would swallow its dropdowns. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
          >
            <span className="band-sweep band-sweep-rail band-sweep-bottom" />
          </span>

          {/* Absolute off `shell-bar`, not in flow: in flow, the 160ms close left a gap that then snapped shut. */}
          {mobileSearchVisible && (
            <>
              <div
                className="fixed inset-0 z-20 lg:hidden"
                onClick={() => setShowMobileSearch(false)}
                aria-hidden
              />
              <div className="absolute inset-x-0 top-full z-30 mt-2 lg:hidden">
                <div
                  className={`options-panel card flex items-center gap-2 p-2 ${
                    isMobileSearchClosing ? 'is-closing' : ''
                  }`}
                >
                  <GlobalSearch
                    className="relative flex-1"
                    inputClassName="input w-full select-text py-1.5 pr-3 text-sm"
                    showShortcutHint={false}
                    autoFocus
                    onNavigate={() => setShowMobileSearch(false)}
                  />
                  <button
                    onClick={() => setShowMobileSearch(false)}
                    aria-label="Close search"
                    className="btn-ghost btn-sm shrink-0 px-2"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Named, so it animates on its own while the identical header just swaps. */}
      {/* `page-enter` while the veil lifts: the content arrives rather than being uncovered. */}
      <main
        className={`view-page page-shell relative z-10 px-6 py-6 ${boot('boot-content')} ${
          arriving ? 'page-enter' : ''
        }`}
      >
        <Outlet />
      </main>

      {isBooting && <BootFrame />}

      {showHandoff && <HandoffDialog onClose={() => setShowHandoff(false)} />}

      {/* Above the player bar too: the cabinet changing screens. */}
      {leaving && <ArcadeInterstitial text={leaving.text} detail={leaving.detail} />}
      {arriving && <ArrivalVeil />}
    </div>
  );
}
