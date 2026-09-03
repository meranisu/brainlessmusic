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
      <div className="mx-auto mt-16 max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-center">
        <h2 className="text-lg font-semibold text-neutral-100">Admins only</h2>
        <p className="mt-2 text-sm text-neutral-400">
          You're signed in as {user?.username}, but this page needs admin access.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
