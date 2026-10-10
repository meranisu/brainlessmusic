package com.brainlessmusic.app.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Person
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

/** The three top-level tabs. Detail screens push on top with a back arrow instead. Tapping the current tab calls [onReselect]. */
@Composable
fun LibraryBottomBar(navController: NavHostController, onReselect: () -> Unit = {}) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    NavigationBar {
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
            selected = currentRoute == Routes.YOU,
            onClick = { if (currentRoute == Routes.YOU) onReselect() else navController.navigateToTab(Routes.YOU) },
            icon = { Icon(Icons.Filled.Person, contentDescription = null) },
            label = { Text("You") },
        )
        NavigationBarItem(
            selected = currentRoute == Routes.SETTINGS,
            onClick = { if (currentRoute == Routes.SETTINGS) onReselect() else navController.navigateToTab(Routes.SETTINGS) },
            icon = { Icon(Icons.Filled.Settings, contentDescription = null) },
            label = { Text("Settings") },
        )
    }
}

/** Pops to the fixed `ARTISTS` anchor; fine for flat tabs, not for nested per-tab stacks. */
private fun NavHostController.navigateToTab(route: String) {
    if (currentDestination?.route == route) return
    navigate(route) {
        popUpTo(Routes.ARTISTS) { inclusive = false }
        launchSingleTop = true
    }
}
