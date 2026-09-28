package com.brainlessmusic.app.ui.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import com.brainlessmusic.app.ui.playback.MiniPlayer

/** The mini player stacked on the navigation bar — used by the two top-level tabs. */
@Composable
fun AppBottomBar(navController: NavHostController) {
    Column {
        MiniPlayer(onClick = { navController.navigate(Routes.NOW_PLAYING) })
        LibraryBottomBar(navController)
    }
}
