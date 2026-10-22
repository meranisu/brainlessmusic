import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { usePresence } from '../hooks/usePresence';
import { Avatar } from './Avatar';
import { ChevronDownIcon, ExitIcon, FadersIcon, GearIcon } from './icons';

interface AccountMenuProps {
  pathname: string;
  /** Slides to a page that has no sidebar item (profile, Options, Control Center). */
  go: (to: string) => void;
  onExit: () => void;
}

/**
 * The avatar at the top bar's right end, from `md` (A290). Profile, Control Center (admins), Options and Exit live in
 * its menu, so Exit is never one stray click away. A phone has the same four in the tab bar's More sheet.
 */
export function AccountMenu({ pathname, go, onExit }: AccountMenuProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const menu = usePresence(open || null, 120);
  const ref = useRef<HTMLDivElement>(null);

  // A page change closes the menu, whichever way it happened.
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

  if (!user) return null;
  const isGuest = user.isGuest;
  const onProfile = pathname === `/people/${user.id}`;
  const onControlCenter = pathname.startsWith('/control-center');
  const onOptions = pathname === '/options';

  function pick(to: string) {
    setOpen(false);
    go(to);
  }

  return (
    <div ref={ref} className="relative hidden shrink-0 md:block">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={`account-trigger ${open || onProfile || onControlCenter || onOptions ? 'is-active' : ''}`}
      >
        <Avatar userId={user.id} name={user.displayName} avatarId={user.avatarId} size="xs" />
        <span className="max-w-40 truncate">{user.displayName}</span>
        <ChevronDownIcon className={`account-chevron h-4 w-4 shrink-0 ${open ? 'is-open' : ''}`} />
      </button>

      {menu.item && (
        <div
          role="menu"
          data-state={menu.state}
          className="motion-menu absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-blue-700 bg-blue-950 p-2"
        >
          {!isGuest && (
            <button
              type="button"
              role="menuitem"
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
          {user.isAdmin && (
            <button
              type="button"
              role="menuitem"
              onClick={() => pick('/control-center')}
              className={`tab-sheet-item ${onControlCenter ? 'is-active' : ''}`}
            >
              <FadersIcon className="h-5 w-5 shrink-0" />
              Control Center
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => pick('/options')}
            className={`tab-sheet-item ${onOptions ? 'is-active' : ''}`}
          >
            <GearIcon className="h-5 w-5 shrink-0" />
            Options
          </button>
          {/* Back to the title screen, signed out. Orange, the title screen's colour. */}
          <div className="mt-1 border-t border-blue-800 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExit();
              }}
              className="tab-sheet-item side-exit"
            >
              <ExitIcon className="h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block">Exit</span>
                <span className="block text-xs font-normal text-blue-300">Signs you out</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
