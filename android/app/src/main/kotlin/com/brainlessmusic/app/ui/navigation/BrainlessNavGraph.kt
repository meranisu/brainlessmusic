package com.brainlessmusic.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.brainlessmusic.app.ui.albums.AlbumDetailScreen
import com.brainlessmusic.app.ui.artists.ArtistDetailScreen
import com.brainlessmusic.app.ui.downloads.DownloadGroupScreen
import com.brainlessmusic.app.ui.downloads.DownloadsScreen
import com.brainlessmusic.app.ui.library.LibraryScreen
import com.brainlessmusic.app.ui.login.LoginScreen
import com.brainlessmusic.app.ui.playback.NowPlayingScreen
import com.brainlessmusic.app.ui.profile.PlaylistDetailScreen
import com.brainlessmusic.app.ui.profile.PlaylistsScreen
import com.brainlessmusic.app.ui.profile.SongListKind
import com.brainlessmusic.app.ui.profile.SongListScreen
import com.brainlessmusic.app.ui.profile.YouScreen
import com.brainlessmusic.app.ui.search.SearchScreen
import com.brainlessmusic.app.ui.settings.SettingsPage
import com.brainlessmusic.app.ui.settings.SettingsPageScreen
import com.brainlessmusic.app.ui.settings.SettingsScreen
import com.brainlessmusic.app.ui.splash.SplashScreen
import com.brainlessmusic.app.ui.splash.StartViewModel

@Composable
fun BrainlessNavGraph(
    startViewModel: StartViewModel,
    navController: NavHostController = rememberNavController(),
) {
    val resolvedRoute by startViewModel.resolvedRoute.collectAsStateWithLifecycle()
    val needsSignIn by startViewModel.needsSignIn.collectAsStateWithLifecycle()

    // After the system kills the app in the background, the saved back stack comes back without the splash, so its
    // screens would start loading before the session is restored, and every call would fail. Hold the graph until it is.
    if (resolvedRoute == null) {
        SplashScreen(viewModel = startViewModel, onResolved = {})
        return
    }

    // The server refused the session mid-use (expired or revoked): back to sign-in, with nothing behind it. The splash
    // and the login screen already lead there themselves.
    LaunchedEffect(needsSignIn) {
        if (!needsSignIn) return@LaunchedEffect
        val here = navController.currentDestination?.route
        if (here == Routes.LOGIN || here == Routes.SPLASH) return@LaunchedEffect
        navController.navigate(Routes.LOGIN) {
            popUpTo(navController.graph.id) { inclusive = true }
        }
    }

    NavHost(navController = navController, startDestination = Routes.SPLASH) {
        composable(Routes.SPLASH) {
            SplashScreen(
                viewModel = startViewModel,
                onResolved = { route ->
                    // Downloads is a tab, and tabs sit on the Library anchor, so an offline start opens both.
                    val first = if (route == Routes.DOWNLOADS) Routes.ARTISTS else route
                    navController.navigate(first) {
                        popUpTo(Routes.SPLASH) { inclusive = true }
                    }
                    if (route == Routes.DOWNLOADS) navController.navigate(Routes.DOWNLOADS) { launchSingleTop = true }
                },
            )
        }
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(Routes.ARTISTS) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.ARTISTS) {
            LibraryScreen(navController = navController)
        }
        composable(Routes.SEARCH) {
            SearchScreen(navController = navController)
        }
        composable(Routes.DOWNLOADS) {
            DownloadsScreen(navController = navController)
        }
        composable(
            Routes.DOWNLOAD_GROUP,
            arguments = listOf(navArgument(Routes.ARG_DOWNLOAD_GROUP) { type = NavType.StringType }),
        ) { entry ->
            DownloadGroupScreen(onBack = { navController.popFrom(entry) }, onOpenNowPlaying = { navController.openNowPlaying() })
        }
        composable(
            Routes.ARTIST_DETAIL,
            arguments = listOf(intArg(Routes.ARG_ARTIST_ID)),
        ) { entry ->
            ArtistDetailScreen(
                onBack = { navController.popFrom(entry) },
                onAlbumClick = { albumId -> navController.navigate(Routes.albumDetail(albumId)) },
                onOpenNowPlaying = { navController.openNowPlaying() },
            )
        }
        composable(
            Routes.ALBUM_DETAIL,
            arguments = listOf(intArg(Routes.ARG_ALBUM_ID)),
        ) { entry ->
            AlbumDetailScreen(
                onBack = { navController.popFrom(entry) },
                onOpenNowPlaying = { navController.openNowPlaying() },
            )
        }
        composable(Routes.NOW_PLAYING) { entry ->
            NowPlayingScreen(
                onBack = { navController.popFrom(entry) },
                // The album opens in the player's place, so back from it goes to where the player was opened.
                onOpenAlbum = { albumId ->
                    navController.navigate(Routes.albumDetail(albumId)) {
                        popUpTo(Routes.NOW_PLAYING) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.YOU) {
            YouScreen(
                navController = navController,
                onOpenArtist = { id -> navController.navigate(Routes.artistDetail(id)) },
                onOpenAlbum = { navController.navigate(Routes.albumDetail(it)) },
                onOpenLiked = { navController.navigate(Routes.songList(SongListKind.LIKED.route)) { launchSingleTop = true } },
                onOpenLessOften = { navController.navigate(Routes.songList(SongListKind.LESS_OFTEN.route)) { launchSingleTop = true } },
                onOpenPlaylists = { navController.navigate(Routes.PLAYLISTS) { launchSingleTop = true } },
            )
        }
        composable(
            Routes.SONG_LIST,
            arguments = listOf(navArgument(Routes.ARG_SONG_LIST) { type = NavType.StringType }),
        ) { entry ->
            SongListScreen(onBack = { navController.popFrom(entry) }, onOpenNowPlaying = { navController.openNowPlaying() })
        }
        composable(Routes.PLAYLISTS) { entry ->
            PlaylistsScreen(
                onBack = { navController.popFrom(entry) },
                onOpenPlaylist = { id -> navController.navigate(Routes.playlistDetail(id)) { launchSingleTop = true } },
                onOpenNowPlaying = { navController.openNowPlaying() },
            )
        }
        composable(
            Routes.PLAYLIST_DETAIL,
            arguments = listOf(intArg(Routes.ARG_PLAYLIST_ID)),
        ) { entry ->
            PlaylistDetailScreen(
                onBack = { navController.popFrom(entry) },
                onOpenNowPlaying = { navController.openNowPlaying() },
                onOpenAlbum = { navController.navigate(Routes.albumDetail(it)) },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                navController = navController,
                onOpenPage = { page -> navController.navigate(Routes.settingsPage(page.route)) { launchSingleTop = true } },
            )
        }
        composable(
            Routes.SETTINGS_PAGE,
            arguments = listOf(navArgument(Routes.ARG_SETTINGS_PAGE) { type = NavType.StringType }),
        ) { entry ->
            val page = SettingsPage.entries.firstOrNull { it.route == entry.arguments?.getString(Routes.ARG_SETTINGS_PAGE) }
                ?: SettingsPage.APPEARANCE
            SettingsPageScreen(
                page = page,
                onBack = { navController.popFrom(entry) },
                onOpenNowPlaying = { navController.openNowPlaying() },
                // The pages sit on the Library anchor too, so popping that clears every tab.
                onLoggedOut = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.ARTISTS) { inclusive = true }
                    }
                },
            )
        }
    }
}

private fun intArg(name: String): NamedNavArgument = navArgument(name) { type = NavType.IntType }
