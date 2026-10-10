package com.brainlessmusic.app.ui.navigation

import androidx.lifecycle.Lifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavHostController

/**
 * Pops [entry] only while it is the settled top screen. An unguarded `popBackStack()` from a back arrow pops twice on
 * a double tap or a tap during the exit animation, takes the Library with it and leaves the NavHost empty: a blank
 * screen that ignores every touch until the app is killed.
 */
fun NavHostController.popFrom(entry: NavBackStackEntry) {
    if (entry.lifecycle.currentState == Lifecycle.State.RESUMED) popBackStack()
}

/** Opens the player once; a second tap on the mini player or a Play button doesn't stack another copy. */
fun NavHostController.openNowPlaying() {
    navigate(Routes.NOW_PLAYING) { launchSingleTop = true }
}
