package com.brainlessmusic.app.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState

/** The top-level tabs. Detail screens push on top with a back arrow instead. Tapping the current tab calls [onReselect]. */
@Composable
fun LibraryBottomBar(navController: NavHostController, onReselect: () -> Unit = {}) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    NavigationBar {
        NavigationBarItem(
            selected = currentRoute == Routes.HOME,
            onClick = { if (currentRoute == Routes.HOME) onReselect() else navController.navigateToTab(Routes.HOME) },
            icon = { Icon(Icons.Filled.Home, contentDescription = null) },
            label = { Text("Home") },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.ARTISTS,
            onClick = { if (currentRoute == Routes.ARTISTS) onReselect() else navController.navigateToTab(Routes.ARTISTS) },
            icon = { Icon(Icons.Filled.LibraryMusic, contentDescription = null) },
            label = { Text("Library") },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.SEARCH,
            onClick = { if (currentRoute == Routes.SEARCH) onReselect() else navController.navigateToTab(Routes.SEARCH) },
            icon = { Icon(Icons.Filled.Search, contentDescription = null) },
            label = { Text("Search") },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.DOWNLOADS,
            onClick = { if (currentRoute == Routes.DOWNLOADS) onReselect() else navController.navigateToTab(Routes.DOWNLOADS) },
            icon = { Icon(Icons.Filled.DownloadForOffline, contentDescription = null) },
            label = { Text("Downloads") },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.SETTINGS,
            onClick = { if (currentRoute == Routes.SETTINGS) onReselect() else navController.navigateToTab(Routes.SETTINGS) },
            icon = { Icon(Icons.Filled.Settings, contentDescription = null) },
            label = { Text("Settings") },
        )
    }
}

/** Pops to the fixed `HOME` anchor (A97); fine for flat tabs, not for nested per-tab stacks. */
private fun NavHostController.navigateToTab(route: String) {
    if (currentDestination?.route == route) return
    navigate(route) {
        popUpTo(Routes.HOME) { inclusive = false }
        launchSingleTop = true
    }
}
