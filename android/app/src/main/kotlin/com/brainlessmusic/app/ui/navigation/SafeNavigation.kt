package com.brainlessmusic.app.ui.navigation

import androidx.lifecycle.Lifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavHostController
import com.brainlessmusic.app.ui.playback.PLAYER_ENTRANCE_HOLD_MS

/**
 * Pops [entry] only while it is the settled top screen. An unguarded `popBackStack()` from a back arrow pops twice on
 * a double tap or a tap during the exit animation, takes Home (the anchor) with it and leaves the NavHost empty: a blank
 * screen that ignores every touch until the app is killed.
 */
fun NavHostController.popFrom(entry: NavBackStackEntry) {
    if (entry.lifecycle.currentState == Lifecycle.State.RESUMED) popBackStack()
}

/**
 * Closes the player even while it is still arriving. [popFrom] waits for RESUMED, which the player only reaches once
 * the screen under it is let go ([PLAYER_ENTRANCE_HOLD_MS]); a swipe down inside that hold was dropped, so the player
 * slid off onto a blank screen and came back. Popping only while it is the top entry still stops a double pop.
 */
fun NavHostController.closePlayer(entry: NavBackStackEntry) {
    if (currentBackStackEntry?.id == entry.id) popBackStack()
}

/** Opens the player once; a second tap on the mini player or a Play button doesn't stack another copy. */
fun NavHostController.openNowPlaying() {
    navigate(Routes.NOW_PLAYING) { launchSingleTop = true }
}
