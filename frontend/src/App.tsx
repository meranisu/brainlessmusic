import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAccount } from './auth/RequireAccount';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { NowLoading } from './components/NowLoading';
import { lazyPage } from './lib/lazyPage';

// One chunk per route, so visitors download only the screens they reach (most never open the admin pages).
const AccountSelectPage = lazyPage(() =>
  import('./pages/AccountSelectPage').then((m) => ({ default: m.AccountSelectPage })),
);
const InvitePage = lazyPage(() => import('./pages/InvitePage').then((m) => ({ default: m.InvitePage })));
const JoinPage = lazyPage(() => import('./pages/JoinPage').then((m) => ({ default: m.JoinPage })));
const LibraryPage = lazyPage(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const AlbumsPage = lazyPage(() => import('./pages/AlbumsPage').then((m) => ({ default: m.AlbumsPage })));
const AlbumDetailPage = lazyPage(() => import('./pages/AlbumDetailPage').then((m) => ({ default: m.AlbumDetailPage })));
const ArtistsPage = lazyPage(() => import('./pages/ArtistsPage').then((m) => ({ default: m.ArtistsPage })));
const GenresPage = lazyPage(() => import('./pages/GenresPage').then((m) => ({ default: m.GenresPage })));
const GenreDetailPage = lazyPage(() =>
  import('./pages/GenreDetailPage').then((m) => ({ default: m.GenreDetailPage })),
);
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
const FriendsPage = lazyPage(() => import('./pages/FriendsPage').then((m) => ({ default: m.FriendsPage })));
const PeoplePage = lazyPage(() => import('./pages/PeoplePage').then((m) => ({ default: m.PeoplePage })));
const StatsPage = lazyPage(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })));
const ProfilePage = lazyPage(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const LogsPage = lazyPage(() => import('./pages/LogsPage').then((m) => ({ default: m.LogsPage })));
const LevellingPage = lazyPage(() => import('./pages/LevellingPage').then((m) => ({ default: m.LevellingPage })));
const ControlCenterPage = lazyPage(() =>
  import('./pages/ControlCenterPage').then((m) => ({ default: m.ControlCenterPage })),
);
const AdminDashboard = lazyPage(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));

export function App() {
  return (
    <Suspense fallback={<NowLoading />}>
      <Routes>
        {/* The way in: the title screen (at `/` while signed out, see RequireAuth), then account select (password,
            passcode or guest). No hidden admin door. */}
        <Route path="/login" element={<AccountSelectPage />} />
        {/* An invite link (A107-A112): works signed out, and for a guest accepting their own upgrade. */}
        <Route path="/invite/:token" element={<InvitePage />} />
        {/* The same page without a link: type the invite code (A191). */}
        <Route path="/signup" element={<InvitePage />} />
        {/* A room link without the Android app: works signed out, and sends you on to the room after sign-in. */}
        <Route path="/join/:code" element={<JoinPage />} />
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
            <Route path="/genres" element={<GenresPage />} />
            <Route path="/genres/:id" element={<GenreDetailPage />} />
            <Route element={<RequireAccount />}>
              <Route path="/favorites" element={<FavoritesPage />} />
              {/* Your own listening only (A230); guests have no history (A37). */}
              <Route path="/stats" element={<StatsPage />} />
            </Route>
            {/* Guests too: they see and play public playlists, and have none of their own (A163). */}
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
            {/* Everyone signed in sees everyone's profile, guests included (A167). */}
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/people/:id" element={<ProfilePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/options" element={<OptionsPage />} />
            {/* Guests too: they join rooms with full controls (A100). */}
            <Route path="/together" element={<TogetherPage />} />
            {/* Now the Library's Full view; redirected for bookmarks and the old nav link. */}
            <Route path="/manage" element={<Navigate to="/?view=full" replace />} />
            <Route element={<RequireAdmin />}>
              {/* One dashboard with tabs (owner request, 2026-10-11): Overview, Logs (A158), Upload, Users, Levelling. */}
              <Route path="/control-center" element={<AdminDashboard />}>
                <Route index element={<ControlCenterPage />} />
                <Route path="logs" element={<LogsPage />} />
                <Route path="upload" element={<UploadPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="levelling" element={<LevellingPage />} />
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
