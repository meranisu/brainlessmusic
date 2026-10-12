import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { lazyPage } from '../lib/lazyPage';
import { NowLoading } from '../components/NowLoading';
import { pendingRoomLink } from '../lib/roomLink';

// Its own chunk, as before it moved here from the route table; App's Suspense covers the load.
const TitleScreenPage = lazyPage(() =>
  import('../pages/TitleScreenPage').then((m) => ({ default: m.TitleScreenPage })),
);

/** Signed out, the title screen is the home page, so the address bar shows just the domain. */
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const { pathname } = useLocation();

  if (isLoading) return <NowLoading />;
  if (!user) return pathname === '/' ? <TitleScreenPage /> : <Navigate to="/" replace />;
  // Signed in after following a room link (JoinPage): on to the room, where the code is waiting.
  if (pathname !== '/together' && pendingRoomLink()) return <Navigate to="/together" replace />;

  return <Outlet />;
}
