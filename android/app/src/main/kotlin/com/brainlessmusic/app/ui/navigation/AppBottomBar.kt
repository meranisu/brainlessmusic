package com.brainlessmusic.app.ui.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import com.brainlessmusic.app.ui.playback.MiniPlayer

/** The mini player stacked on the navigation bar, for the top-level tabs. [onReselect]: the current tab tapped again. */
@Composable
fun AppBottomBar(navController: NavHostController, onReselect: () -> Unit = {}) {
    Column {
        MiniPlayer(onClick = { navController.openNowPlaying() }, extendUnderSystemBar = false)
        LibraryBottomBar(navController, onReselect)
    }
}
