import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAccount } from './auth/RequireAccount';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { lazyPage } from './lib/lazyPage';

// One chunk per route, so visitors download only the screens they reach (most never open the admin pages).
const AccountSelectPage = lazyPage(() =>
  import('./pages/AccountSelectPage').then((m) => ({ default: m.AccountSelectPage })),
);
const LibraryPage = lazyPage(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const AlbumsPage = lazyPage(() => import('./pages/AlbumsPage').then((m) => ({ default: m.AlbumsPage })));
const AlbumDetailPage = lazyPage(() => import('./pages/AlbumDetailPage').then((m) => ({ default: m.AlbumDetailPage })));
const ArtistsPage = lazyPage(() => import('./pages/ArtistsPage').then((m) => ({ default: m.ArtistsPage })));
const ArtistDetailPage = lazyPage(() =>
  import('./pages/ArtistDetailPage').then((m) => ({ default: m.ArtistDetailPage })),
);
const FavoritesPage = lazyPage(() => import('./pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));
const PlaylistsPage = lazyPage(() => import('./pages/PlaylistsPage').then((m) => ({ default: m.PlaylistsPage })));
const PlaylistDetailPage = lazyPage(() =>
  import('./pages/PlaylistDetailPage').then((m) => ({ default: m.PlaylistDetailPage })),
);
const SearchPage = lazyPage(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const OptionsPage = lazyPage(() => import('./pages/OptionsPage').then((m) => ({ default: m.OptionsPage })));
const TogetherPage = lazyPage(() => import('./pages/TogetherPage').then((m) => ({ default: m.TogetherPage })));
const UploadPage = lazyPage(() => import('./pages/UploadPage').then((m) => ({ default: m.UploadPage })));
const UsersPage = lazyPage(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const ControlCenterPage = lazyPage(() =>
  import('./pages/ControlCenterPage').then((m) => ({ default: m.ControlCenterPage })),
);
const AdminDashboard = lazyPage(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));

export function App() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-blue-300">Loading…</p>}>
      <Routes>
        {/* The way in: the title screen (at `/` while signed out, see RequireAuth), then account select (password,
            passcode or guest). No hidden admin door. */}
        <Route path="/login" element={<AccountSelectPage />} />
        {/* The old addresses, kept for printed guest-code cards (`?code=`) and handoff links (`#t=`). */}
        <Route path="/enter" element={<Moved to="/" />} />
        <Route path="/enter/profile" element={<Moved to="/login" />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/albums" element={<AlbumsPage />} />
            <Route path="/albums/:id" element={<AlbumDetailPage />} />
            <Route path="/artists" element={<ArtistsPage />} />
            <Route path="/artists/:id" element={<ArtistDetailPage />} />
            <Route element={<RequireAccount />}>
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/playlists" element={<PlaylistsPage />} />
              <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
            </Route>
            <Route path="/search" element={<SearchPage />} />
            <Route path="/options" element={<OptionsPage />} />
            {/* Guests too: they join rooms with full controls (A100). */}
            <Route path="/together" element={<TogetherPage />} />
            {/* Now the Library's Full view; redirected for bookmarks and the old nav link. */}
            <Route path="/manage" element={<Navigate to="/?view=full" replace />} />
            <Route element={<RequireAdmin />}>
              {/* One dashboard with tabs (owner request, 2026-10-11): Overview, Upload, Users. */}
              <Route path="/control-center" element={<AdminDashboard />}>
                <Route index element={<ControlCenterPage />} />
                <Route path="upload" element={<UploadPage />} />
                <Route path="users" element={<UsersPage />} />
              </Route>
              {/* Old addresses, kept for bookmarks: the two pages before they became tabs, and the page's old name. */}
              <Route path="/upload" element={<Navigate to="/control-center/upload" replace />} />
              <Route path="/users" element={<Navigate to="/control-center/users" replace />} />
              <Route path="/health" element={<Navigate to="/control-center" replace />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

/** A redirect that keeps the query and the hash, which carry the guest code and the handoff token. */
function Moved({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}
