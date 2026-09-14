import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { AlbumDetailPage } from './pages/AlbumDetailPage';
import { AlbumsPage } from './pages/AlbumsPage';
import { ArtistDetailPage } from './pages/ArtistDetailPage';
import { ArtistsPage } from './pages/ArtistsPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HealthPage } from './pages/HealthPage';
import { LibraryPage } from './pages/LibraryPage';
import { LoginPage } from './pages/LoginPage';
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
      {/* The way in. `/login` still exists and still works typed directly —
          hiding a route in a bundle hides nothing — but it is unlinked, and
          the server is what refuses when ADMIN_ENTRY_CODE is set. */}
      <Route path="/enter" element={<TitleScreenPage />} />
      <Route path="/login" element={<LoginPage />} />

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
          <Route path="/health" element={<HealthPage />} />
          <Route path="/options" element={<OptionsPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/manage" element={<ManageTracksPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
