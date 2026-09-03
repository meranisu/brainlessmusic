import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
  }`;

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-950 pb-16 text-neutral-100">
      <header className="flex items-center gap-4 border-b border-neutral-800 px-6 py-3">
        <span className="text-sm font-semibold tracking-tight text-neutral-300">brainlessmusic</span>
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
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-neutral-400">{user?.username}</span>
          {user?.isAdmin && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
              Admin
            </span>
          )}
          <button onClick={logout} className="text-neutral-500 hover:text-neutral-300">
            Log out
          </button>
        </div>
      </header>
      <main className="px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
