package com.brainlessmusic.app.ui.navigation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.ui.common.floatingBars
import com.brainlessmusic.app.ui.common.EdgeLine
import androidx.compose.foundation.layout.Column
import com.brainlessmusic.app.ui.common.TabIcon
import com.brainlessmusic.app.ui.common.tabColors
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.brainlessmusic.app.ui.theme.AppIcons

/** The top-level tabs. Detail screens push on top with a back arrow instead. Tapping the current tab calls [onReselect]. */
@Composable
fun LibraryBottomBar(navController: NavHostController, onReselect: () -> Unit = {}) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    val items: @Composable RowScope.() -> Unit = {
        NavigationBarItem(
            selected = currentRoute == Routes.HOME,
            onClick = { if (currentRoute == Routes.HOME) onReselect() else navController.navigateToTab(Routes.HOME) },
            icon = { TabIcon(selected = currentRoute == Routes.HOME) { Icon(AppIcons.home, contentDescription = null) } },
            label = { Text("Home") },
            colors = tabColors(),
        )
        NavigationBarItem(
            selected = currentRoute == Routes.ARTISTS,
            onClick = { if (currentRoute == Routes.ARTISTS) onReselect() else navController.navigateToTab(Routes.ARTISTS) },
            icon = { TabIcon(selected = currentRoute == Routes.ARTISTS) { Icon(AppIcons.library, contentDescription = null) } },
            label = { Text("Library") },
            colors = tabColors(),
        )
        NavigationBarItem(
            selected = currentRoute == Routes.SEARCH,
            onClick = { if (currentRoute == Routes.SEARCH) onReselect() else navController.navigateToTab(Routes.SEARCH) },
            icon = { TabIcon(selected = currentRoute == Routes.SEARCH) { Icon(AppIcons.search, contentDescription = null) } },
            label = { Text("Search") },
            colors = tabColors(),
        )
        NavigationBarItem(
            selected = currentRoute == Routes.DOWNLOADS,
            onClick = { if (currentRoute == Routes.DOWNLOADS) onReselect() else navController.navigateToTab(Routes.DOWNLOADS) },
            icon = { TabIcon(selected = currentRoute == Routes.DOWNLOADS) { Icon(AppIcons.downloads, contentDescription = null) } },
            label = { Text("Downloads") },
            colors = tabColors(),
        )
        NavigationBarItem(
            selected = currentRoute == Routes.SETTINGS,
            onClick = { if (currentRoute == Routes.SETTINGS) onReselect() else navController.navigateToTab(Routes.SETTINGS) },
            icon = { TabIcon(selected = currentRoute == Routes.SETTINGS) { Icon(AppIcons.settings, contentDescription = null) } },
            label = { Text("Settings") },
            colors = tabColors(),
        )
    }
    if (floatingBars) {
        // Hit circle: an outlined pill clear of the edges, above the system bar rather than under it.
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainer,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier
                .windowInsetsPadding(WindowInsets.navigationBars)
                .padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 8.dp),
        ) {
            NavigationBar(containerColor = Color.Transparent, tonalElevation = 0.dp, windowInsets = WindowInsets(0), content = items)
        }
    } else {
        // Docked; Lane closes it with an edge line along the top.
        Column {
            EdgeLine()
            NavigationBar(content = items)
        }
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
