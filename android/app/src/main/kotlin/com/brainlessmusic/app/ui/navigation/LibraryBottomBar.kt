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
import com.brainlessmusic.app.ui.common.tabBarColor
import androidx.compose.foundation.layout.Column
import com.brainlessmusic.app.ui.common.TabIcon
import com.brainlessmusic.app.ui.common.TabLabel
import com.brainlessmusic.app.ui.common.tabColors
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.ui.graphics.vector.ImageVector
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.LocalSkin
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.brainlessmusic.app.ui.theme.AppIcons

/** The top-level tabs. Detail screens push on top with a back arrow instead. Tapping the current tab calls [onReselect]. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryBottomBar(navController: NavHostController, onReselect: () -> Unit = {}) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    val items: @Composable RowScope.() -> Unit = {
        // Material's ripple is a rounded pill whatever the skin; the game skins light their own key shape ([TabIcon]).
        val ripple = if (LocalSkin.current == Skin.STANDARD) LocalRippleConfiguration.current else null
        CompositionLocalProvider(LocalRippleConfiguration provides ripple) {
            for ((route, label) in tabs) {
                val selected = currentRoute == route
                val interaction = remember { MutableInteractionSource() }
                val pressed by interaction.collectIsPressedAsState()
                NavigationBarItem(
                    selected = selected,
                    onClick = { if (selected) onReselect() else navController.navigateToTab(route) },
                    icon = { TabIcon(selected = selected, pressed = pressed) { Icon(tabIcon(route), contentDescription = null) } },
                    label = { TabLabel(label) },
                    colors = tabColors(),
                    interactionSource = interaction,
                )
            }
        }
    }
    if (floatingBars) {
        // Hit circle: an outlined pill clear of the edges, above the system bar rather than under it.
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = tabBarColor(),
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
            NavigationBar(containerColor = tabBarColor(), content = items)
        }
    }
}

private val tabs = listOf(
    Routes.HOME to "Home",
    Routes.ARTISTS to "Library",
    Routes.SEARCH to "Search",
    Routes.DOWNLOADS to "Downloads",
    Routes.SETTINGS to "Settings",
)

@Composable
private fun tabIcon(route: String): ImageVector = when (route) {
    Routes.HOME -> AppIcons.home
    Routes.ARTISTS -> AppIcons.library
    Routes.SEARCH -> AppIcons.search
    Routes.DOWNLOADS -> AppIcons.downloads
    else -> AppIcons.settings
}

/** Pops to the fixed `HOME` anchor (A97); fine for flat tabs, not for nested per-tab stacks. */
private fun NavHostController.navigateToTab(route: String) {
    if (currentDestination?.route == route) return
    navigate(route) {
        popUpTo(Routes.HOME) { inclusive = false }
        launchSingleTop = true
    }
}
