import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAccount } from './auth/RequireAccount';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';

// One chunk per route, so visitors download only the screens they reach (most never open the admin pages).
const AccountSelectPage = lazy(() =>
  import('./pages/AccountSelectPage').then((m) => ({ default: m.AccountSelectPage })),
);
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const AlbumsPage = lazy(() => import('./pages/AlbumsPage').then((m) => ({ default: m.AlbumsPage })));
const AlbumDetailPage = lazy(() => import('./pages/AlbumDetailPage').then((m) => ({ default: m.AlbumDetailPage })));
const ArtistsPage = lazy(() => import('./pages/ArtistsPage').then((m) => ({ default: m.ArtistsPage })));
const ArtistDetailPage = lazy(() =>
  import('./pages/ArtistDetailPage').then((m) => ({ default: m.ArtistDetailPage })),
);
const FavoritesPage = lazy(() => import('./pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage').then((m) => ({ default: m.PlaylistsPage })));
const PlaylistDetailPage = lazy(() =>
  import('./pages/PlaylistDetailPage').then((m) => ({ default: m.PlaylistDetailPage })),
);
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const OptionsPage = lazy(() => import('./pages/OptionsPage').then((m) => ({ default: m.OptionsPage })));
const TogetherPage = lazy(() => import('./pages/TogetherPage').then((m) => ({ default: m.TogetherPage })));
const UploadPage = lazy(() => import('./pages/UploadPage').then((m) => ({ default: m.UploadPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const ControlCenterPage = lazy(() =>
  import('./pages/ControlCenterPage').then((m) => ({ default: m.ControlCenterPage })),
);

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
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/control-center" element={<ControlCenterPage />} />
              {/* The page's old name, kept for bookmarks. */}
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
