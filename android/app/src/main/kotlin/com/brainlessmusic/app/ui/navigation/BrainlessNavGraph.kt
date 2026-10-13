package com.brainlessmusic.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.animation.AnimatedContentScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import com.brainlessmusic.app.ui.playback.playerPresence
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavBackStackEntry
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
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
import com.brainlessmusic.app.ui.genres.GenreDetailScreen
import com.brainlessmusic.app.ui.genres.GenresScreen
import com.brainlessmusic.app.ui.library.LibraryScreen
import com.brainlessmusic.app.ui.login.LoginScreen
import com.brainlessmusic.app.ui.playback.NowPlayingScreen
import com.brainlessmusic.app.ui.profile.PlaylistDetailScreen
import com.brainlessmusic.app.ui.profile.SongListKind
import com.brainlessmusic.app.ui.profile.SongListScreen
import com.brainlessmusic.app.ui.profile.YouScreen
import com.brainlessmusic.app.ui.search.SearchScreen
import com.brainlessmusic.app.ui.settings.SettingsPage
import com.brainlessmusic.app.ui.settings.SettingsPageScreen
import com.brainlessmusic.app.ui.settings.SettingsScreen
import com.brainlessmusic.app.ui.setup.SetupScreen
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.splash.SplashScreen
import com.brainlessmusic.app.ui.splash.StartViewModel
import com.brainlessmusic.app.ui.together.TogetherScreen
import com.brainlessmusic.app.ui.people.PeopleScreen
import com.brainlessmusic.app.ui.people.ProfileScreen
import com.brainlessmusic.app.invites.InviteLinks
import com.brainlessmusic.app.rooms.RoomLinks
import com.brainlessmusic.app.ui.signup.EmailPrompt
import com.brainlessmusic.app.ui.signup.SignUpScreen

@Composable
fun BrainlessNavGraph(
    startViewModel: StartViewModel,
    roomLinks: RoomLinks,
    inviteLinks: InviteLinks,
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
        if (here == Routes.LOGIN || here == Routes.SPLASH || here == Routes.SIGNUP) return@LaunchedEffect
        navController.navigate(Routes.LOGIN) {
            popUpTo(navController.graph.id) { inclusive = true }
        }
    }

    // A room link opens Listen together, which takes the code. Signed out or mid-setup, it waits until Home is reached.
    val pendingRoom by roomLinks.pending.collectAsStateWithLifecycle()
    val onTop by navController.currentBackStackEntryAsState()
    LaunchedEffect(pendingRoom, onTop?.destination?.route) {
        val here = onTop?.destination?.route ?: return@LaunchedEffect
        if (pendingRoom == null || here in setOf(Routes.SPLASH, Routes.LOGIN, Routes.SIGNUP, Routes.SETUP, Routes.TOGETHER)) return@LaunchedEffect
        navController.navigate(Routes.TOGETHER) { launchSingleTop = true }
    }

    // An invite link opens Sign up with its code, signed in or not: an upgrade invite is opened by the signed-in guest.
    val pendingInvite by inviteLinks.pending.collectAsStateWithLifecycle()
    LaunchedEffect(pendingInvite, onTop?.destination?.route) {
        val here = onTop?.destination?.route ?: return@LaunchedEffect
        if (pendingInvite == null || here == Routes.SPLASH) return@LaunchedEffect
        val code = inviteLinks.take() ?: return@LaunchedEffect
        navController.navigate(Routes.signup(code)) {
            if (here == Routes.SIGNUP) popUpTo(Routes.SIGNUP) { inclusive = true }
        }
    }

    // After sign-up or log-in, and after setup: the session is whoever signed in now, with nothing behind it.
    val enterApp: () -> Unit = {
        startViewModel.signedIn { route ->
            navController.navigate(route) {
                popUpTo(navController.graph.id) { inclusive = true }
            }
        }
    }

    // Every screen goes through this, so only the one on top takes touches (see `OnTopOnly`).
    fun NavGraphBuilder.screen(
        route: String,
        arguments: List<NamedNavArgument> = emptyList(),
        content: @Composable AnimatedContentScope.(NavBackStackEntry) -> Unit,
    ) = composable(route, arguments) { entry -> OnTopOnly(navController, entry) { content(entry) } }

    val skin = LocalSkin.current
    // Kept after the bar hides, so a tab leaving for a detail page doesn't jump while it fades.
    var tabBarHeight by remember { mutableStateOf(0.dp) }
    Box(Modifier.fillMaxSize()) {
        CompositionLocalProvider(LocalTabBarHeight provides tabBarHeight) {
            NavHost(
                navController = navController,
                startDestination = Routes.SPLASH,
                // Going to Home pops and every other tab pushes, so one transition for both directions keeps switches alike.
                // The player draws its own way in and out over the screen under it, which stays put (A145).
                enterTransition = { if (toPlayer()) EnterTransition.None else tabEnter(skin) },
                exitTransition = { if (toPlayer()) UnderPlayer else tabExit(skin) },
                popEnterTransition = { if (fromPlayer()) EnterTransition.None else tabEnter(skin) },
                popExitTransition = { if (fromPlayer()) ExitTransition.None else tabExit(skin) },
            ) {
                screen(Routes.SPLASH) {
                    SplashScreen(
                        viewModel = startViewModel,
                        onResolved = { route ->
                            // Downloads is a tab, and tabs sit on the Home anchor, so an offline start opens both.
                            val first = if (route == Routes.DOWNLOADS) Routes.HOME else route
                            navController.navigate(first) {
                                popUpTo(Routes.SPLASH) { inclusive = true }
                            }
                            if (route == Routes.DOWNLOADS) navController.navigate(Routes.DOWNLOADS) { launchSingleTop = true }
                        },
                    )
                }
                screen(
                    Routes.SIGNUP,
                    arguments = listOf(
                        navArgument(Routes.ARG_INVITE_CODE) {
                            type = NavType.StringType
                            nullable = true
                            defaultValue = null
                        },
                    ),
                ) { entry ->
                    SignUpScreen(onBack = { navController.popFrom(entry) }, onSignedUp = enterApp)
                }
                screen(Routes.LOGIN) {
                    LoginScreen(
                        onSignUp = { navController.navigate(Routes.signup()) },
                        // A phone's first sign-in goes through the setup first (A139).
                        onLoggedIn = {
                            startViewModel.signedIn { route ->
                                navController.navigate(route) {
                                    popUpTo(Routes.LOGIN) { inclusive = true }
                                }
                            }
                        },
                    )
                }
                screen(Routes.SETUP) {
                    SetupScreen(
                        onDone = {
                            startViewModel.setupFinished()
                            navController.navigate(Routes.HOME) {
                                popUpTo(Routes.SETUP) { inclusive = true }
                            }
                        },
                    )
                }
                screen(Routes.ARTISTS) {
                    LibraryScreen(navController = navController)
                }
                screen(Routes.SEARCH) {
                    SearchScreen(navController = navController)
                }
                screen(Routes.DOWNLOADS) {
                    DownloadsScreen(navController = navController)
                }
                screen(
                    Routes.DOWNLOAD_GROUP,
                    arguments = listOf(navArgument(Routes.ARG_DOWNLOAD_GROUP) { type = NavType.StringType }),
                ) { entry ->
                    DownloadGroupScreen(onBack = { navController.popFrom(entry) }, onOpenNowPlaying = { navController.openNowPlaying() })
                }
                screen(
                    Routes.ARTIST_DETAIL,
                    arguments = listOf(intArg(Routes.ARG_ARTIST_ID)),
                ) { entry ->
                    ArtistDetailScreen(
                        onBack = { navController.popFrom(entry) },
                        onAlbumClick = { albumId -> navController.navigate(Routes.albumDetail(albumId)) },
                        onOpenNowPlaying = { navController.openNowPlaying() },
                    )
                }
                screen(Routes.GENRES) { entry ->
                    GenresScreen(
                        onBack = { navController.popFrom(entry) },
                        onGenreClick = { genreId -> navController.navigate(Routes.genreDetail(genreId)) },
                        onOpenNowPlaying = { navController.openNowPlaying() },
                    )
                }
                screen(
                    Routes.GENRE_DETAIL,
                    arguments = listOf(intArg(Routes.ARG_GENRE_ID)),
                ) { entry ->
                    GenreDetailScreen(
                        onBack = { navController.popFrom(entry) },
                        onAlbumClick = { albumId -> navController.navigate(Routes.albumDetail(albumId)) },
                        onOpenNowPlaying = { navController.openNowPlaying() },
                    )
                }
                screen(
                    Routes.ALBUM_DETAIL,
                    arguments = listOf(intArg(Routes.ARG_ALBUM_ID)),
                ) { entry ->
                    AlbumDetailScreen(
                        onBack = { navController.popFrom(entry) },
                        onOpenNowPlaying = { navController.openNowPlaying() },
                        onOpenArtist = { navController.navigate(Routes.artistDetail(it)) },
                    )
                }
                screen(Routes.NOW_PLAYING) { entry ->
                    // Opens and closes in the skin's manner, drawn by the player itself (A145, A146).
                    val presence by transition.playerPresence(skin)
                    NowPlayingScreen(
                        presence = { presence },
                        onBack = { navController.closePlayer(entry) },
                        // The album opens in the player's place, so back from it goes to where the player was opened.
                        onOpenAlbum = { albumId ->
                            navController.navigate(Routes.albumDetail(albumId)) {
                                popUpTo(Routes.NOW_PLAYING) { inclusive = true }
                            }
                        },
                        onOpenArtist = { artistId ->
                            navController.navigate(Routes.artistDetail(artistId)) {
                                popUpTo(Routes.NOW_PLAYING) { inclusive = true }
                            }
                        },
                        onOpenTogether = { navController.navigate(Routes.TOGETHER) { launchSingleTop = true } },
                    )
                }
                screen(Routes.TOGETHER) { entry ->
                    TogetherScreen(
                        onBack = { navController.popFrom(entry) },
                        onOpenNowPlaying = { navController.openNowPlaying() },
                        onOpenProfile = { navController.navigate(Routes.profile(it)) },
                        onOpenPeople = { navController.navigate(Routes.PEOPLE) { launchSingleTop = true } },
                    )
                }
                screen(Routes.HOME) {
                    YouScreen(
                        navController = navController,
                        onOpenArtist = { id -> navController.navigate(Routes.artistDetail(id)) },
                        onOpenAlbum = { navController.navigate(Routes.albumDetail(it)) },
                    )
                }
                screen(
                    Routes.SONG_LIST,
                    arguments = listOf(navArgument(Routes.ARG_SONG_LIST) { type = NavType.StringType }),
                ) { entry ->
                    SongListScreen(onBack = { navController.popFrom(entry) }, onOpenNowPlaying = { navController.openNowPlaying() })
                }
                screen(
                    Routes.PLAYLIST_DETAIL,
                    arguments = listOf(intArg(Routes.ARG_PLAYLIST_ID)),
                ) { entry ->
                    PlaylistDetailScreen(
                        onBack = { navController.popFrom(entry) },
                        onOpenNowPlaying = { navController.openNowPlaying() },
                        onOpenAlbum = { navController.navigate(Routes.albumDetail(it)) },
                        onOpenArtist = { navController.navigate(Routes.artistDetail(it)) },
                        onOpenProfile = { navController.navigate(Routes.profile(it)) },
                        // A saved copy opens in place of the playlist it was copied from.
                        onOpenPlaylist = { id ->
                            navController.navigate(Routes.playlistDetail(id)) {
                                popUpTo(entry.destination.id) { inclusive = true }
                            }
                        },
                    )
                }
                // Profiles (A167-A173). Opening one in a room leaves the room playing; Back returns to where you were.
                screen(Routes.PEOPLE) { entry ->
                    PeopleScreen(
                        onBack = { navController.popFrom(entry) },
                        onOpenNowPlaying = { navController.openNowPlaying() },
                        onOpenProfile = { navController.navigate(Routes.profile(it)) },
                    )
                }
                screen(Routes.PROFILE, arguments = listOf(intArg(Routes.ARG_USER_ID))) { entry ->
                    ProfileScreen(
                        onBack = { navController.popFrom(entry) },
                        onOpenNowPlaying = { navController.openNowPlaying() },
                        onOpenArtist = { navController.navigate(Routes.artistDetail(it)) },
                        onOpenAlbum = { navController.navigate(Routes.albumDetail(it)) },
                        onOpenGenre = { navController.navigate(Routes.genreDetail(it)) },
                        onOpenPlaylist = { navController.navigate(Routes.playlistDetail(it)) },
                    )
                }
                screen(Routes.SETTINGS) {
                    SettingsScreen(
                        navController = navController,
                        onOpenPage = { page -> navController.navigate(Routes.settingsPage(page.route)) { launchSingleTop = true } },
                    )
                }
                screen(
                    Routes.SETTINGS_PAGE,
                    arguments = listOf(navArgument(Routes.ARG_SETTINGS_PAGE) { type = NavType.StringType }),
                ) { entry ->
                    val page = SettingsPage.entries.firstOrNull { it.route == entry.arguments?.getString(Routes.ARG_SETTINGS_PAGE) }
                        ?: SettingsPage.APPEARANCE
                    SettingsPageScreen(
                        page = page,
                        onBack = { navController.popFrom(entry) },
                        onOpenNowPlaying = { navController.openNowPlaying() },
                        onOpenLessOften = { navController.navigate(Routes.songList(SongListKind.LESS_OFTEN.route)) { launchSingleTop = true } },
                        // The pages sit on the Home anchor too, so popping that clears every tab.
                        onLoggedOut = {
                            navController.navigate(Routes.LOGIN) {
                                popUpTo(Routes.HOME) { inclusive = true }
                            }
                        },
                    )
                }
            }
        }
        SharedTabBar(
            navController = navController,
            onHeight = { if (it > 0.dp) tabBarHeight = it },
            modifier = Modifier.align(Alignment.BottomCenter),
        )
        // An account with no email is asked for one once it is in the app (A190).
        val here = onTop?.destination?.route
        EmailPrompt(active = here != null && here !in setOf(Routes.SPLASH, Routes.LOGIN, Routes.SIGNUP, Routes.SETUP), route = here)
    }
}

private fun intArg(name: String): NamedNavArgument = navArgument(name) { type = NavType.IntType }

/** How far a screen that isn't on top is moved, for touch only: well past any screen's edge. */
private const val OFF_TOUCH_PX = 1_000_000

/**
 * Lets only the screen on top of the back stack take touches. After a skin change, the Appearance page could stay
 * composed under (or over) Settings once left, and taps on Settings' empty spots landed on its skin rows, picking a
 * skin by where you tapped (owner, 2026-10-12). Any other screen is laid out far off, where no finger reaches, and
 * drawn back where it was, so a fade still looks the same and the screen keeps its state; it just can't be touched.
 */
@Composable
private fun OnTopOnly(navController: NavHostController, entry: NavBackStackEntry, content: @Composable () -> Unit) {
    val top by navController.currentBackStackEntryAsState()
    val onTop = top?.id == entry.id
    Box(
        if (onTop) {
            Modifier
        } else {
            Modifier.drawWithContent { translate(top = -OFF_TOUCH_PX.toFloat()) { this@drawWithContent.drawContent() } }
        },
    ) {
        Box(if (onTop) Modifier else Modifier.offset { IntOffset(0, OFF_TOUCH_PX) }) { content() }
    }
}
