import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';

// Lazy-loaded per route: each page ships as its own chunk instead of one
// monolithic bundle, so a visitor only downloads the screens they actually
// reach — this matters most for the /enter screens (loaded by every visitor
// before they've even logged in) and the admin-only pages that most accounts
// never open at all.
const TitleScreenPage = lazy(() => import('./pages/TitleScreenPage').then((m) => ({ default: m.TitleScreenPage })));
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
const ManageTracksPage = lazy(() =>
  import('./pages/ManageTracksPage').then((m) => ({ default: m.ManageTracksPage })),
);
const UploadPage = lazy(() => import('./pages/UploadPage').then((m) => ({ default: m.UploadPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const HealthPage = lazy(() => import('./pages/HealthPage').then((m) => ({ default: m.HealthPage })));

export function App() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-blue-300">Loading…</p>}>
      <Routes>
        {/* The way in: the title screen, then the account select screen it
            hands off to — sign in (password or a bound passcode) or continue
            as a guest, all reachable typed directly too, since hiding a route
            in a bundle hides nothing. There is no hidden admin door any more:
            an account is protected by what it actually holds. */}
        <Route path="/enter" element={<TitleScreenPage />} />
        <Route path="/enter/profile" element={<AccountSelectPage />} />
        {/* `/login` was the old standalone sign-in screen, folded into the
            account select screen's sign-in card. Redirected rather than
            removed, so anything that had it bookmarked still lands somewhere
            useful. */}
        <Route path="/login" element={<Navigate to="/enter/profile" replace />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/albums" element={<AlbumsPage />} />
            <Route path="/albums/:id" element={<AlbumDetailPage />} />
            <Route path="/artists" element={<ArtistsPage />} />
            <Route path="/artists/:id" element={<ArtistDetailPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/options" element={<OptionsPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="/manage" element={<ManageTracksPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/health" element={<HealthPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
