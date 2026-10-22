import { useAuth } from '../auth/AuthContext';
import { Avatar } from './Avatar';
import { ExitIcon, FadersIcon, GearIcon } from './icons';

interface ShellActionsProps {
  pathname: string;
  /** Slides to a page that has no sidebar item (profile, Options, Control Center). */
  go: (to: string) => void;
  onExit: () => void;
}

/**
 * Account, Control Center, Options and Exit, at the right end of the top bar from `md` (A283). They moved here from the
 * sidebar's foot, so they stay in one place however the sidebar folds. A phone has them in the tab bar's More sheet.
 */
export function ShellActions({ pathname, go, onExit }: ShellActionsProps) {
  const { user } = useAuth();
  const isGuest = Boolean(user?.isGuest);
  const onProfile = user != null && pathname === `/people/${user.id}`;
  const onControlCenter = pathname.startsWith('/control-center');
  const onOptions = pathname === '/options';

  return (
    <div className="hidden shrink-0 items-center gap-1 md:flex">
      {user && !isGuest && (
        <button
          type="button"
          onClick={() => go(`/people/${user.id}`)}
          aria-label="Your profile"
          aria-current={onProfile ? 'page' : undefined}
          data-tip={user.displayName}
          className={`tip bar-action ${onProfile ? 'is-active' : ''}`}
        >
          <Avatar userId={user.id} name={user.displayName} avatarId={user.avatarId} size="xs" />
        </button>
      )}
      {user?.isAdmin && (
        <button
          type="button"
          onClick={() => go('/control-center')}
          aria-label="Control Center"
          aria-current={onControlCenter ? 'page' : undefined}
          data-tip="Control Center"
          className={`tip bar-action ${onControlCenter ? 'is-active' : ''}`}
        >
          <FadersIcon className="h-5 w-5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => go('/options')}
        aria-label="Options"
        aria-current={onOptions ? 'page' : undefined}
        data-tip="Options"
        className={`tip bar-action ${onOptions ? 'is-active' : ''}`}
      >
        <GearIcon className="h-5 w-5" />
      </button>
      {/* Back to the title screen, signed out. Orange, the title screen's colour. */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Log out and exit to the title screen"
        data-tip="Exit (signs you out)"
        className="tip bar-action bar-exit"
      >
        <ExitIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
