import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Guests are listen-only (A37): playlists and favorites need a real account.
 * Renders an inline message rather than redirecting, the same way
 * RequireAdmin does, so a guest following an old link sees why.
 */
export function RequireAccount() {
  const { user } = useAuth();

  if (user?.isGuest) {
    return (
      <div className="card mx-auto mt-16 max-w-md p-6 text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-600/10 text-orange-500">
          !
        </span>
        <h2 className="text-lg font-semibold text-white">Needs an account</h2>
        <p className="mt-2 text-sm text-blue-200">
          Guests can browse and listen. Playlists and favorites are for accounts.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
