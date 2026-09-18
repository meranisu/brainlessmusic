package com.brainlessmusic.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.brainlessmusic.app.ui.albums.AlbumDetailScreen
import com.brainlessmusic.app.ui.artists.ArtistDetailScreen
import com.brainlessmusic.app.ui.artists.ArtistsListScreen
import com.brainlessmusic.app.ui.search.SearchScreen
import com.brainlessmusic.app.ui.serverconfig.ServerConfigScreen
import com.brainlessmusic.app.ui.splash.SplashScreen

@Composable
fun BrainlessNavGraph(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = Routes.SPLASH) {
        composable(Routes.SPLASH) {
            SplashScreen(
                onResolved = { route ->
                    navController.navigate(route) {
                        popUpTo(Routes.SPLASH) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.SERVER_CONFIG) {
            ServerConfigScreen(
                onLoggedIn = {
                    navController.navigate(Routes.ARTISTS) {
                        popUpTo(Routes.SERVER_CONFIG) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.ARTISTS) {
            ArtistsListScreen(
                navController = navController,
                onLoggedOut = {
                    navController.navigate(Routes.SERVER_CONFIG) {
                        popUpTo(Routes.ARTISTS) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.SEARCH) {
            SearchScreen(navController = navController)
        }
        composable(
            Routes.ARTIST_DETAIL,
            arguments = listOf(intArg(Routes.ARG_ARTIST_ID)),
        ) {
            ArtistDetailScreen(
                onBack = { navController.popBackStack() },
                onAlbumClick = { albumId -> navController.navigate(Routes.albumDetail(albumId)) },
            )
        }
        composable(
            Routes.ALBUM_DETAIL,
            arguments = listOf(intArg(Routes.ARG_ALBUM_ID)),
        ) {
            AlbumDetailScreen(onBack = { navController.popBackStack() })
        }
    }
}

private fun intArg(name: String): NamedNavArgument = navArgument(name) { type = NavType.IntType }
