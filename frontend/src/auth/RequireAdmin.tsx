import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Unlike RequireAuth, this doesn't redirect — it renders an inline message.
 * A non-admin landing on an admin-only route (e.g. via a stale bookmark)
 * should see why they can't get in, not silently bounce to a different page.
 */
export function RequireAdmin() {
  const { user } = useAuth();

  if (!user?.isAdmin) {
    return (
      <div className="card mx-auto mt-16 max-w-md p-6 text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-600/10 text-orange-500">
          !
        </span>
        <h2 className="text-lg font-semibold text-white">Admins only</h2>
        <p className="mt-2 text-sm text-blue-200">
          You're signed in as {user?.username}, but this page needs admin access.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
