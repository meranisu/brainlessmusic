import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAuth } from './auth/RequireAuth';
import { AccountSelectPage } from './pages/AccountSelectPage';
import { AppShell } from './components/AppShell';
import { AlbumDetailPage } from './pages/AlbumDetailPage';
import { AlbumsPage } from './pages/AlbumsPage';
import { ArtistDetailPage } from './pages/ArtistDetailPage';
import { ArtistsPage } from './pages/ArtistsPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HealthPage } from './pages/HealthPage';
import { LibraryPage } from './pages/LibraryPage';
import { ManageTracksPage } from './pages/ManageTracksPage';
import { OptionsPage } from './pages/OptionsPage';
import { TitleScreenPage } from './pages/TitleScreenPage';
import { PlaylistDetailPage } from './pages/PlaylistDetailPage';
import { PlaylistsPage } from './pages/PlaylistsPage';
import { SearchPage } from './pages/SearchPage';
import { UploadPage } from './pages/UploadPage';
import { UsersPage } from './pages/UsersPage';

export function App() {
  return (
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
  );
}
