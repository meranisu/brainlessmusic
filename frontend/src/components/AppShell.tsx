import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative px-3 py-4 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors ${
    isActive
      ? 'text-white after:bg-orange-600'
      : 'text-blue-300 after:bg-transparent hover:text-blue-100'
  }`;

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-600 text-xs font-bold text-blue-950">
        b
      </span>
      <span className="font-brand text-sm font-semibold italic tracking-tight text-blue-100">brainlessmusic</span>
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-blue-950 pb-20 text-white">
      <header className="sticky top-0 z-30 border-b border-blue-800 bg-blue-950">
        <div className="page-shell flex items-center gap-6 px-6">
          <Wordmark />
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Library
            </NavLink>
            {user?.isAdmin && (
              <NavLink to="/upload" className={navLinkClass}>
                Upload
              </NavLink>
            )}
            <NavLink to="/health" className={navLinkClass}>
              Health
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 py-3 text-sm">
            <span className="text-blue-200">{user?.username}</span>
            {user?.isAdmin && <span className="badge-admin">Admin</span>}
            <button onClick={logout} className="btn-ghost btn-sm">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="page-shell px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
