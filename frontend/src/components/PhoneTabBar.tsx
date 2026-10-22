import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePresence } from '../hooks/usePresence';
import { Avatar } from './Avatar';
import { ExitIcon, FadersIcon, GearIcon, MoreIcon } from './icons';
import { isItemActive, type NavItem, type NavSection } from './navItems';

/** Always on the bar; everything else is in the sheet behind the last tab. */
const TAB_PATHS = ['/', '/library', '/together'];

interface PhoneTabBarProps {
  sections: NavSection[];
  pathname: string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, item: NavItem) => void;
  go: (to: string) => void;
  onExit: () => void;
}

/**
 * The phone's navigation (A274): a tab bar docked at the bottom, the player strip sitting on it. Home, Library and
 * Listen together are tabs; the last tab (your picture, or More for a guest) opens a sheet with the rest.
 * Sets `data-tabbar` on the root while mounted, so `--tabbar-h` lifts the player strip, toasts and Back to top.
 */
export function PhoneTabBar({ sections, pathname, onNavigate, go, onExit }: PhoneTabBarProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const sheet = usePresence(open || null, 120);
  const ref = useRef<HTMLDivElement>(null);

  const all = sections.flatMap((section) => section.items);
  const tabs = TAB_PATHS.map((to) => all.find((item) => item.to === to)).filter((item) => item !== undefined);
  const rest = sections
    .map((section) => ({ ...section, items: section.items.filter((item) => !TAB_PATHS.includes(item.to)) }))
    .filter((section) => section.items.length > 0);

  const isGuest = Boolean(user?.isGuest);
  const onProfile = user != null && pathname === `/people/${user.id}`;
  const restActive =
    rest.some((section) => section.items.some((item) => isItemActive(item, pathname))) ||
    onProfile ||
    pathname === '/options' ||
    pathname.startsWith('/control-center');

  useEffect(() => {
    document.documentElement.dataset.tabbar = '';
    return () => {
      delete document.documentElement.dataset.tabbar;
    };
  }, []);

  // A page change closes the sheet, whichever way it happened.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function close(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function pick(to: string) {
    setOpen(false);
    go(to);
  }

  return (
    <div ref={ref} className="md:hidden">
      {sheet.item && (
        <div
          data-state={sheet.state}
          className="tab-sheet motion-menu fixed inset-x-3 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-blue-700 bg-blue-950 p-2"
        >
          {user && !isGuest && (
            <button
              type="button"
              onClick={() => pick(`/people/${user.id}`)}
              className={`tab-sheet-item ${onProfile ? 'is-active' : ''}`}
            >
              <Avatar userId={user.id} name={user.displayName} avatarId={user.avatarId} size="xs" />
              <span className="min-w-0">
                <span className="block truncate">{user.displayName}</span>
                <span className="block text-xs font-normal text-blue-300">Your profile, stats and friends</span>
              </span>
            </button>
          )}
          {rest.map((section) => (
            <div key={section.title} className="mt-1">
              <p className="side-heading">{section.title}</p>
              <ul className="grid grid-cols-2 gap-1">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={(event) => {
                        setOpen(false);
                        onNavigate(event, item);
                      }}
                      className={({ isActive }) => `tab-sheet-item ${isActive ? 'is-active' : ''}`}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <ul className="mt-2 grid grid-cols-2 gap-1 border-t border-blue-800 pt-2">
            {user?.isAdmin && (
              <li>
                <button
                  type="button"
                  onClick={() => pick('/control-center')}
                  className={`tab-sheet-item ${pathname.startsWith('/control-center') ? 'is-active' : ''}`}
                >
                  <FadersIcon className="h-5 w-5 shrink-0" />
                  <span className="truncate">Control Center</span>
                </button>
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() => pick('/options')}
                className={`tab-sheet-item ${pathname === '/options' ? 'is-active' : ''}`}
              >
                <GearIcon className="h-5 w-5 shrink-0" />
                <span className="truncate">Options</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onExit();
                }}
                className="tab-sheet-item side-exit"
              >
                <ExitIcon className="h-5 w-5 shrink-0" />
                <span className="truncate">Exit</span>
              </button>
            </li>
          </ul>
        </div>
      )}

      <nav className="tab-bar fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 select-none" aria-label="Main">
        {tabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={(event) => onNavigate(event, item)}
            className={({ isActive }) => `tab-bar-item ${isActive && !open ? 'is-active' : ''}`}
          >
            <item.icon className="h-5 w-5" />
            {/* "Together" fits a quarter of a 320px phone; "Listen together" does not. */}
            <span>{item.to === '/together' ? 'Together' : item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={isGuest || !user ? 'More pages' : 'You, and more pages'}
          className={`tab-bar-item ${open || restActive ? 'is-active' : ''}`}
        >
          {user && !isGuest ? (
            <Avatar userId={user.id} name={user.displayName} avatarId={user.avatarId} size="tab" />
          ) : (
            <MoreIcon className="h-5 w-5" />
          )}
          <span>{user && !isGuest ? 'You' : 'More'}</span>
        </button>
      </nav>
    </div>
  );
}
