// import { useEffect, useState, type MouseEvent } from 'react';
// import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { consumeJustEntered, markAtTitle } from '../lib/boot';
import { arrivalDuration, interstitialDuration, prefersReducedMotion } from '../lib/interstitial';
import { setSectionTitle } from '../lib/documentTitle';
import { loadSidebarCollapsed, saveSidebarCollapsed } from '../lib/sidebar';
import { BrandMark, Wordmark } from './BrandLockup';
import { GlobalSearch } from './GlobalSearch';
import { EmailPrompt } from './EmailPrompt';
import { InviteBanner } from './InviteBanner';
import { HandoffDialog } from './HandoffDialog';
import { ArcadeInterstitial, ArrivalVeil } from './ArcadeInterstitial';
import { ShellBackdrop } from './BackdropDepth';
import { ChevronRightIcon, CloseIcon, SearchIcon, SidebarIcon } from './icons';
import { AccountMenu } from './AccountMenu';
import { activeIndex, navSectionsFor, type NavItem } from './navItems';
import { PhoneTabBar } from './PhoneTabBar';
import { ScrollTopButton } from './ScrollTopButton';
import { SideNav } from './SideNav';
import { Presence } from './Presence';

/** Must match `.options-panel.is-closing` in `index.css`; the search panel reuses the More menu's chrome. */
const SEARCH_CLOSE_MS = 160;

/** Below this the sidebar starts as a rail, until the user opens or folds it themselves (A275). Tailwind's `lg`. */
const WIDE_QUERY = '(min-width: 1024px)';

/** Width of the open sidebar and of its rail; `main` and the header move over by the same amount. */
const SIDE_OPEN = '16rem';
const SIDE_RAIL = '4.5rem';

/**
 * Lists you come back to, whose window scroll is put back where you left it (A281). Keyed with the query, so Albums
 * page 3 and page 1 each keep their own. Any other page opens at the top.
 */
const REMEMBER_SCROLL = new Set(['/', '/albums', '/artists', '/genres', '/playlists', '/people']);

/** How long a return waits for the page to grow tall enough to scroll back, ms. Lazy pages load in about 1 s. */
const SCROLL_RESTORE_MS = 2500;

/** Pages with no sidebar item, named for the browser tab. Detail pages name themselves (`usePageTitle`). */
const OTHER_TITLES: Record<string, string> = {
  '/options': 'Options',
  '/search': 'Search',
  '/control-center': 'Control Center',
};

/**
 * Pages opened from somewhere else, which get a back button in the top bar (A291), and where it goes when the tab has
 * no earlier page in the app (a pasted link or a reload). Mixes are opened from Home.
 */
const BACK_FALLBACK: [prefix: string, to: string][] = [
  ['/albums/', '/albums'],
  ['/artists/', '/artists'],
  ['/genres/', '/genres'],
  ['/playlists/', '/playlists'],
  ['/people/', '/people'],
  ['/mixes/', '/'],
];

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
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

  /** Null until the user folds or opens the sidebar on this device; until then the width decides. */
  const [savedCollapsed, setSavedCollapsed] = useState(loadSidebarCollapsed);
  const [isWide, setIsWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const sync = () => setIsWide(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const collapsed = savedCollapsed ?? !isWide;

  function toggleSidebar() {
    saveSidebarCollapsed(!collapsed);
    setSavedCollapsed(!collapsed);
  }

  // `[` folds or opens the sidebar (A281), as in YT Music. Not while typing, and not on a phone, which has no sidebar.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '[' || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (!window.matchMedia('(min-width: 768px)').matches) return;
      event.preventDefault();
      saveSidebarCollapsed(!collapsed);
      setSavedCollapsed(!collapsed);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed]);

  /** The phone search panel: below `md` the bar has no room for `GlobalSearch`, so this is a phone's only search. */
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

  const { pathname, search, key: locationKey } = useLocation();
  const navigate = useNavigate();
  const sections = navSectionsFor(Boolean(user?.isGuest));
  const items = sections.flatMap((section) => section.items);
  const current = activeIndex(items, pathname);

  const sectionTitle =
    current >= 0
      ? items[current].label
      : (Object.entries(OTHER_TITLES).find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] ?? null);
  useEffect(() => {
    setSectionTitle(sectionTitle);
    return () => setSectionTitle(null);
  }, [sectionTitle]);

  // Scroll memory (A281): the scroll of each remembered list, kept for this tab's life.
  const scrollMemory = useRef(new Map<string, number>());
  const scrollKey = `${pathname}${search}`;
  const scrollKeyRef = useRef(scrollKey);
  useEffect(() => {
    function remember() {
      const key = scrollKeyRef.current;
      if (REMEMBER_SCROLL.has(key.split('?')[0])) scrollMemory.current.set(key, window.scrollY);
    }
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, []);
  useEffect(() => {
    scrollKeyRef.current = scrollKey;
    const saved = REMEMBER_SCROLL.has(pathname) ? (scrollMemory.current.get(scrollKey) ?? 0) : 0;
    if (saved <= 0) {
      window.scrollTo(0, 0);
      return;
    }
    // The page arrives empty and fills as its data loads; wait until it is tall enough, then put the scroll back.
    const deadline = performance.now() + SCROLL_RESTORE_MS;
    let frame = requestAnimationFrame(function tryRestore() {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room >= saved || performance.now() > deadline) {
        window.scrollTo(0, Math.min(saved, room));
        return;
      }
      frame = requestAnimationFrame(tryRestore);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollKey, pathname]);

  /** Leaves through a card (type, a held beat, fade to black), then navigates. Exit only (A285). The app stays mounted underneath. */
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

  /** Resolves the running slide's update once the new route has committed. Null when no slide waits. */
  const slideCommitted = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    slideCommitted.current?.();
    slideCommitted.current = null;
  }, [pathname, search]);

  /**
   * Changes pages at once, sliding the old page out and the new one in (A285; it replaced the 1,420ms card, which made
   * every page change wait). The router commits inside a React transition, so `flushSync` can't force it: the update
   * callback waits for the commit instead. Without view transitions the new page just fades in (`route-in`).
   * `data-sliding` keeps `route-in` from fading the page a second time inside the slide.
   */
  function slideTo(to: string | number) {
    const go = () => (typeof to === 'number' ? navigate(to) : navigate(to));
    if (!document.startViewTransition || prefersReducedMotion()) {
      go();
      return;
    }
    const root = document.documentElement;
    const slide = document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          slideCommitted.current = resolve;
          go();
        }),
    );
    root.dataset.sliding = '';
    slide.finished.finally(() => delete root.dataset.sliding);
  }

  /** Off the sidebar (profile, Control Center, Options): no position to compare, so it goes forward. */
  function goTo(to: string) {
    if (to === pathname) return;
    // oxlint-disable-next-line react/immutability
    document.documentElement.dataset.navDir = 'forward';
    slideTo(to);
  }

  const backFallback = BACK_FALLBACK.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null;

  /**
   * The top bar's back button (A291): one step back through the tab's history, so the list it returns to gets its
   * scroll back (A281). With no earlier page in the app ("default" key), the page's own list instead.
   */
  function goBack() {
    if (backFallback === null) return;
    // oxlint-disable-next-line react/immutability
    document.documentElement.dataset.navDir = 'back';
    slideTo(locationKey === 'default' ? backFallback : -1);
  }

  /** Records which way along the sidebar the click goes, before `startViewTransition` reads it. `forward` off-tab. */
  function rememberDirection(target: number) {
    /* An effect would run after navigation, too late for the snapshot; a DOM write in a handler is correct here. */
    // oxlint-disable-next-line react/immutability
    document.documentElement.dataset.navDir = current >= 0 && target < current ? 'back' : 'forward';
  }

  /** Slides to the clicked tab. Modified clicks pass through. Shared by the sidebar, its rail and the phone's tab bar. */
  function onNavClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const index = items.indexOf(item);
    event.preventDefault();
    // Already here: nothing to slide to.
    if (index === current) return;

    rememberDirection(index);
    slideTo(item.to);
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
    <div
      className="app-ground relative min-h-screen pb-[calc(5rem+var(--tabbar-h))] text-white md:pb-20"
      style={{ '--side-w': collapsed ? SIDE_RAIL : SIDE_OPEN } as CSSProperties}
    >
      {/* Vivid on Home, whose cards give text its own ground; other pages keep the restrained backdrop. */}
      <ShellBackdrop vivid={pathname === '/'} />

      <SideNav
        sections={sections}
        pathname={pathname}
        collapsed={collapsed}
        onNavigate={onNavClick}
        bootClass={isBooting ? 'boot-nav' : ''}
      />

      {/* Everything right of the sidebar. The padding follows the sidebar's width as it folds. */}
      <div className="shell-column md:pl-(--side-w)">
      {/* One flat panel with the sidebar (A289): edge to edge across the top, the sidebar hanging below its left end.
          Fixed, not sticky (A288): sticky moved with the body, so a scroll lock (which pins the body at
          `top: -scrollY`) slid the bar off the top. `.shell-column`'s top padding holds its place. */}
      <header className="fixed inset-x-0 top-0 z-30 select-none">
        <div className="shell-bar relative flex items-center gap-3 pr-3 sm:gap-5 sm:pr-5">
          {/* From `md`, the sidebar's head: as wide as the sidebar, its edge running up through the bar. */}
          <div className="shell-brand hidden shrink-0 items-center gap-2 md:flex">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? 'Open the sidebar' : 'Fold the sidebar'}
              aria-keyshortcuts="["
              aria-expanded={!collapsed}
              data-tip={collapsed ? 'Open the sidebar  [' : 'Fold the sidebar  ['}
              className="tip tip-right side-toggle"
            >
              <SidebarIcon className="h-5 w-5" />
            </button>
            {!collapsed && (
              <Link to="/" className="flex min-w-0 items-center gap-2.5">
                <BrandMark className="h-7 w-7 border-2 border-blue-200" />
                <Wordmark className="truncate text-base text-white" />
              </Link>
            )}
          </div>

          {/* From `md`, one of two equal sides around the search, so it sits in the middle (A292). */}
          <div className="contents md:flex md:min-w-9 md:flex-1">
            {backFallback !== null && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                data-tip="Back"
                className="tip btn-ghost btn-sm ml-2 shrink-0 px-2 md:ml-0"
              >
                <ChevronRightIcon className="h-5 w-5 rotate-180" />
              </button>
            )}
          </div>

          {/* A phone has no sidebar, so the name sits here. */}
          <Link to="/" className={`${backFallback !== null ? '' : 'ml-3'} flex shrink-0 items-center gap-2.5 md:hidden ${boot('boot-wordmark')}`}>
            <BrandMark className="h-8 w-8 border-2 border-blue-200" />
            <Wordmark className="text-base text-white" />
          </Link>

          {/* From `md` the bar is search and nothing else: the pages moved to the sidebar (A273). Centred over the
              page, as in YouTube Music (A292); it narrows before the sides do. */}
          <div className={`hidden min-w-0 shrink py-3 md:flex md:w-lg ${boot('boot-search')}`}>
            <GlobalSearch
              className="relative w-full"
              inputClassName="input w-full select-text py-2 pr-8 text-sm"
            />
          </div>

          {/* Below `md`, search's only way in. `min-w-0` lets it shrink. */}
          <div className="flex min-w-0 flex-1 justify-end py-3 md:hidden">
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

          <div className="contents md:flex md:flex-1 md:justify-end">
            <AccountMenu pathname={pathname} go={goTo} onExit={handleExit} />
          </div>

          {/* The accent line, on its own clipped layer: `overflow-hidden` on the bar would swallow its dropdowns. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <span className="band-sweep band-sweep-rail band-sweep-bottom" />
          </span>

          {/* Absolute off `shell-bar`, not in flow: in flow, the 160ms close left a gap that then snapped shut. */}
          {mobileSearchVisible && (
            <>
              <div
                className="fixed inset-0 z-20 md:hidden"
                onClick={() => setShowMobileSearch(false)}
                aria-hidden
              />
              <div className="absolute inset-x-0 top-full z-30 mt-2 md:hidden">
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
        {/* Keyed on the path so a move inside the app (into an album, back to a list) fades in too. Not while the
            veil lifts, which already animates the page. */}
        <div key={pathname} className={arriving || leaving ? undefined : 'route-in'}>
          <Outlet />
        </div>
      </main>
      </div>

      <PhoneTabBar sections={sections} pathname={pathname} onNavigate={onNavClick} go={goTo} onExit={handleExit} />

      <ScrollTopButton />

      {isBooting && <BootFrame />}

      <Presence value={showHandoff || null}>{() => <HandoffDialog onClose={() => setShowHandoff(false)} />}</Presence>

      {!isBooting && <EmailPrompt />}

      {!isBooting && <InviteBanner />}

      {/* Above the player bar too: the cabinet changing screens. */}
      {leaving && <ArcadeInterstitial text={leaving.text} detail={leaving.detail} />}
      {arriving && <ArrivalVeil />}
    </div>
  );
}
