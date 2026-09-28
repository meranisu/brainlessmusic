package com.brainlessmusic.app.ui.playback

import androidx.lifecycle.ViewModel
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackUiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** A thin per-screen handle on the app-wide [PlaybackController]; the player itself outlives every screen. */
@HiltViewModel
class PlaybackViewModel @Inject constructor(
    private val controller: PlaybackController,
) : ViewModel() {

    val state: StateFlow<PlaybackUiState> = controller.state

    fun togglePlayPause() = controller.togglePlayPause()
    fun seekTo(positionMs: Long) = controller.seekTo(positionMs)
    fun next() = controller.skipToNext()
    fun previous() = controller.skipToPrevious()
    fun skipTo(index: Int) = controller.skipToIndex(index)
}
