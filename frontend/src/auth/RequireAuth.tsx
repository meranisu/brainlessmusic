import { lazy } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Its own chunk, as before it moved here from the route table; App's Suspense covers the load.
const TitleScreenPage = lazy(() => import('../pages/TitleScreenPage').then((m) => ({ default: m.TitleScreenPage })));

/** Signed out, the title screen is the home page, so the address bar shows just the domain. */
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const { pathname } = useLocation();

  if (isLoading) return null;
  if (!user) return pathname === '/' ? <TitleScreenPage /> : <Navigate to="/" replace />;

  return <Outlet />;
}
