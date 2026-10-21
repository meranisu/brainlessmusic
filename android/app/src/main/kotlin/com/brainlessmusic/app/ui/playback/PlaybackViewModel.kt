package com.brainlessmusic.app.ui.playback

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.local.PlayerButtons
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.RemovedEntry
import com.brainlessmusic.app.playback.SleepTimer
import com.brainlessmusic.app.playback.SleepTimerState
import com.brainlessmusic.app.rooms.RoomSession
import com.brainlessmusic.app.rooms.RoomUiState
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** A thin per-screen handle on the app-wide [PlaybackController]; the player itself outlives every screen. */
@HiltViewModel
class PlaybackViewModel @Inject constructor(
    private val controller: PlaybackController,
    appearance: AppearanceSettings,
    private val playbackSettings: PlaybackSettings,
    private val libraryRepository: LibraryRepository,
    private val profileRepository: com.brainlessmusic.app.data.repository.ProfileRepository,
    authRepository: AuthRepository,
    roomSession: RoomSession,
    private val sleepTimer: SleepTimer,
) : ViewModel() {

    /** Someone's picture, for whoever added a room song (A256). */
    fun avatarUrl(userId: Int, avatarId: String?): String? = profileRepository.avatarUrl(userId, avatarId)

    /** The "Listen together" room, if one is joined: the player names it and opens it. */
    val room: StateFlow<RoomUiState> = roomSession.state

    /** Guests are listen-only (A37), so they get remove but not dislike. */
    val canPlayLessOften: Boolean = !authRepository.isGuest

    val state: StateFlow<PlaybackUiState> = controller.state

    val sleep: StateFlow<SleepTimerState> = sleepTimer.state
    fun startSleep(minutes: Int) = sleepTimer.start(minutes)
    fun startSleepAtSongEnd() = sleepTimer.startEndOfSong()
    fun cancelSleep() = sleepTimer.cancel()

    val seekStyle: StateFlow<SeekStyle> = appearance.seekStyle
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SeekStyle.SQUIGGLE)

    val skin: StateFlow<Skin> = appearance.skin
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Skin.STANDARD)

    val playerButtons: StateFlow<PlayerButtons> = appearance.playerButtons
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PlayerButtons.STANDARD)

    /** Bar heights (0..1) for the Waveform seek bar, or null while offline or when the server has none. */
    suspend fun waveformBars(trackId: Int): List<Float>? =
        libraryRepository.waveform(trackId).getOrNull()?.takeIf { it.isNotEmpty() }?.let(::barsFromPeaks)

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
    // In a room these change the room's settings, for the host only; the controller sorts that out (A268).
    fun cycleShuffle() = controller.cycleShuffle()
    fun cycleRepeat() = controller.cycleRepeat()

    fun removeFromQueue(index: Int): RemovedEntry? = controller.removeAt(index)
    fun moveInQueue(from: Int, to: Int) = controller.move(from, to)

    /** Undo for [removeFromQueue] and [playLessOften]; the latter also takes the mark back off. */
    fun undoRemove(entry: RemovedEntry, lessOften: Boolean) {
        controller.restore(entry)
        if (lessOften) viewModelScope.launch { profileRepository.setDisliked(entry.item.trackId, false) }
    }

    /** Out of this queue, and into fewer shuffle passes from now on (A60). A failed call is not retried. */
    fun playLessOften(index: Int): RemovedEntry? {
        val entry = controller.removeAt(index) ?: return null
        viewModelScope.launch { profileRepository.setDisliked(entry.item.trackId, true) }
        return entry
    }
}

/**
 * Each track scaled to its own loudest peak, under a ceiling that rises with how loud it really is (A8), so a quiet
 * track still draws short. Same numbers as the web's `barsFromPeaks`; the bar count is chosen where it is drawn.
 */
internal fun barsFromPeaks(peaks: List<Int>): List<Float> {
    val raw = peaks.map { it.coerceIn(0, 255) / 255f }
    val loudest = raw.max()
    val ceiling = QUIET_TRACK_CEILING + (1 - QUIET_TRACK_CEILING) * loudest
    val scale = if (loudest > 0f) ceiling / loudest else 0f
    // Silence stays a visible stub rather than a gap.
    return raw.map { maxOf(0.06f, it * scale) }
}

private const val QUIET_TRACK_CEILING = 0.55f
