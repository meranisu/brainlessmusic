package com.brainlessmusic.app.ui.splash

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue

/**
 * Whether a full-screen intro (the welcome or a skin change) is playing. The update sheet is its own window, so it
 * would sit on top of an intro; it waits on this instead.
 */
object IntroGate {
    private var playing by mutableIntStateOf(0)

    val isPlaying: Boolean get() = playing > 0

    /** Called while an intro is on screen; leaving composition ends the hold. */
    @Composable
    fun Hold() {
        DisposableEffect(Unit) {
            playing++
            onDispose { playing-- }
        }
    }
}
