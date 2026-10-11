package com.brainlessmusic.app.ui.playback

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.RemovedEntry
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** A thin per-screen handle on the app-wide [PlaybackController]; the player itself outlives every screen. */
@HiltViewModel
class PlaybackViewModel @Inject constructor(
    private val controller: PlaybackController,
    appearance: AppearanceSettings,
    private val playbackSettings: PlaybackSettings,
    private val libraryRepository: LibraryRepository,
    authRepository: AuthRepository,
) : ViewModel() {

    /** Guests are listen-only (A37), so they get remove but not "play less often". */
    val canPlayLessOften: Boolean = !authRepository.isGuest

    val state: StateFlow<PlaybackUiState> = controller.state

    val seekStyle: StateFlow<SeekStyle> = appearance.seekStyle
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SeekStyle.SQUIGGLE)

    /** The same setting as Settings → Playback → Data saver. */
    val dataSaver: StateFlow<Boolean> = playbackSettings.dataSaver
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun setDataSaver(enabled: Boolean) {
        viewModelScope.launch { playbackSettings.setDataSaver(enabled) }
    }

    fun togglePlayPause() = controller.togglePlayPause()
    fun seekTo(positionMs: Long) = controller.seekTo(positionMs)
    fun next() = controller.skipToNext()
    fun previous() = controller.skipToPrevious()
    fun previousTrack() = controller.skipToPreviousTrack()
    fun skipTo(index: Int) = controller.skipToIndex(index)
    fun cycleShuffle() = controller.cycleShuffle()
    fun cycleRepeat() = controller.cycleRepeat()

    fun removeFromQueue(index: Int): RemovedEntry? = controller.removeAt(index)
    fun moveInQueue(from: Int, to: Int) = controller.move(from, to)

    /** Undo for [removeFromQueue] and [playLessOften]; the latter also takes the mark back off. */
    fun undoRemove(entry: RemovedEntry, lessOften: Boolean) {
        controller.restore(entry)
        if (lessOften) viewModelScope.launch { libraryRepository.setLessOften(entry.item.trackId, false) }
    }

    /** Out of this queue, and into fewer shuffle passes from now on (A60). A failed call is not retried. */
    fun playLessOften(index: Int): RemovedEntry? {
        val entry = controller.removeAt(index) ?: return null
        viewModelScope.launch { libraryRepository.setLessOften(entry.item.trackId, true) }
        return entry
    }
}
