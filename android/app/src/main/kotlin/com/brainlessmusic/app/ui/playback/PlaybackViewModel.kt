package com.brainlessmusic.app.ui.playback

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackUiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** A thin per-screen handle on the app-wide [PlaybackController]; the player itself outlives every screen. */
@HiltViewModel
class PlaybackViewModel @Inject constructor(
    private val controller: PlaybackController,
    appearance: AppearanceSettings,
) : ViewModel() {

    val state: StateFlow<PlaybackUiState> = controller.state

    val seekStyle: StateFlow<SeekStyle> = appearance.seekStyle
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SeekStyle.SQUIGGLE)

    fun togglePlayPause() = controller.togglePlayPause()
    fun seekTo(positionMs: Long) = controller.seekTo(positionMs)
    fun next() = controller.skipToNext()
    fun previous() = controller.skipToPrevious()
    fun skipTo(index: Int) = controller.skipToIndex(index)
    fun toggleShuffle() = controller.toggleShuffle()
    fun cycleRepeat() = controller.cycleRepeat()
}
