package com.brainlessmusic.app.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState

/** The two top-level destinations. Artist/album detail screens push on top of either and don't show this — they have their own back arrow instead. */
@Composable
fun LibraryBottomBar(navController: NavHostController) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    NavigationBar {
        NavigationBarItem(
            selected = currentRoute == Routes.ARTISTS,
            onClick = { navController.navigateToTab(Routes.ARTISTS) },
            icon = { Icon(Icons.Filled.LibraryMusic, contentDescription = null) },
            label = { Text("Library") },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.SEARCH,
            onClick = { navController.navigateToTab(Routes.SEARCH) },
            icon = { Icon(Icons.Filled.Search, contentDescription = null) },
            label = { Text("Search") },
        )
    }
}

/** A fixed anchor (`ARTISTS`) rather than a computed start destination — simple and correct for exactly two flat tabs; would need real bottom-nav-graph handling if a third tab or nested per-tab stacks ever show up. */
private fun NavHostController.navigateToTab(route: String) {
    if (currentDestination?.route == route) return
    navigate(route) {
        popUpTo(Routes.ARTISTS) { inclusive = false }
        launchSingleTop = true
    }
}
