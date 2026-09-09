import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BrandMark, Wordmark } from './BrandLockup';
import { GlobalSearch } from './GlobalSearch';
import { WordmarkColumn } from './WordmarkColumn';

/**
 * Small enough to clear the content at the breakpoint the backdrop appears
 * at: `page-shell` caps at 72rem, so a 10vw column still has room beside it
 * from 1536px up.
 */
const AMBIENT_SIZE = 'clamp(4rem, 18vh, 10vw)';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative px-3 py-4 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors ${
    isActive
      ? 'text-white after:bg-orange-600'
      : 'text-blue-300 after:bg-transparent hover:text-blue-100'
  }`;

/**
 * The title screen's wordmark columns, dialled right down and parked in the
 * gutters either side of the content. This sits behind a dense table, so it
 * has to lose: a sixth of the stroke opacity the login screen uses, and laps
 * measured in tens of seconds rather than seconds.
 *
 * Hidden below `2xl`, where the gutters are too narrow to hold a column clear
 * of the content — decoration behind a data table is a bug, not a feature.
 */
function ShellBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 hidden overflow-hidden 2xl:block">
      <WordmarkColumn
        className="left-[1.5%]"
        size={AMBIENT_SIZE}
        beats={64}
        stroke="rgba(59, 130, 246, 0.16)"
      />
      <WordmarkColumn
        className="right-[1.5%]"
        size={AMBIENT_SIZE}
        beats={91}
        offset={-23}
        stroke="rgba(59, 130, 246, 0.12)"
      />
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="relative min-h-screen bg-blue-950 pb-20 text-white">
      <ShellBackdrop />

      <header className="sticky top-0 z-30 border-b border-blue-800 bg-blue-950">
        <div className="page-shell flex items-center gap-6 px-6">
          <div className="flex shrink-0 items-center gap-2.5">
            <BrandMark className="h-7 w-7 border-2 border-blue-200" />
            <Wordmark className="text-base text-white" />
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Library
            </NavLink>
            <NavLink to="/albums" className={navLinkClass}>
              Albums
            </NavLink>
            <NavLink to="/artists" className={navLinkClass}>
              Artists
            </NavLink>
            <NavLink to="/favorites" className={navLinkClass}>
              Favorites
            </NavLink>
            <NavLink to="/playlists" className={navLinkClass}>
              Playlists
            </NavLink>
            {user?.isAdmin && (
              <NavLink to="/upload" className={navLinkClass}>
                Upload
              </NavLink>
            )}
            {user?.isAdmin && (
              <NavLink to="/users" className={navLinkClass}>
                Users
              </NavLink>
            )}
            <NavLink to="/health" className={navLinkClass}>
              Health
            </NavLink>
          </nav>
          <GlobalSearch />
          {/* shrink-0 + nowrap: the nav grew a Users link, and without these the
              right-hand block is the first thing the flex row squeezes — "Log
              out" was wrapping onto two lines and stretching the header. */}
          <div className="flex shrink-0 items-center gap-3 py-3 text-sm">
            <span className="hidden truncate text-blue-200 lg:inline">{user?.username}</span>
            {user?.isAdmin && <span className="badge-admin shrink-0">Admin</span>}
            <button onClick={logout} className="btn-ghost btn-sm shrink-0 whitespace-nowrap">
              Log out
            </button>
          </div>
        </div>
        {/* The sign-in banner's accent line, on the edge that plays the same
            role here. Same clock, so both screens pulse together. */}
        <span className="band-sweep band-sweep-rail band-sweep-bottom" />
      </header>

      <main className="page-shell relative z-10 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
