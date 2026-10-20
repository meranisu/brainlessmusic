package com.brainlessmusic.app.ui.settings

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.BetweenSongs
import com.brainlessmusic.app.data.local.ColorTheme
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.local.PlayerButtons
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.local.ThemeMode
import com.brainlessmusic.app.data.local.TransitionPrefs
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.playback.HeadsetAction
import com.brainlessmusic.app.playback.HeadsetButtonPrefs
import com.brainlessmusic.app.playback.HeadsetSlot
import com.brainlessmusic.app.playback.PlaybackController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settings: PlaybackSettings,
    private val appearance: AppearanceSettings,
    private val authRepository: AuthRepository,
    private val playbackController: PlaybackController,
    private val libraryRepository: LibraryRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    /** The equalizer screen for the music, or null when the phone has none. */
    fun equalizerIntent(): Intent? = playbackController.equalizerIntent()

    /** `null` until the reset is tried, then whether it worked. */
    private val _lessOftenReset = kotlinx.coroutines.flow.MutableStateFlow<Boolean?>(null)
    val lessOftenReset: StateFlow<Boolean?> = _lessOftenReset

    /** Every disliked song goes back into shuffle as normal (A60, A153). */
    fun resetLessOften() {
        viewModelScope.launch { _lessOftenReset.value = profileRepository.clearDisliked().isSuccess }
    }

    val autoPlayOnResume: StateFlow<Boolean> = settings.autoPlayOnResume
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    val keepPlayingWhenSwipedAway: StateFlow<Boolean> = settings.keepPlayingWhenSwipedAway
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    fun setKeepPlayingWhenSwipedAway(enabled: Boolean) {
        viewModelScope.launch { settings.setKeepPlayingWhenSwipedAway(enabled) }
    }

    val headsetButtons: StateFlow<HeadsetButtonPrefs> = settings.headsetButtons
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HeadsetButtonPrefs())

    fun setHeadsetAction(slot: HeadsetSlot, action: HeadsetAction) {
        viewModelScope.launch { settings.setHeadsetAction(slot, action) }
    }

    val dataSaver: StateFlow<Boolean> = settings.dataSaver
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun setDataSaver(enabled: Boolean) {
        viewModelScope.launch { settings.setDataSaver(enabled) }
    }

    /** Between songs, fade length, the album rule and the pause fade (A71, A72). */
    val transitions: StateFlow<TransitionPrefs> = settings.transitions
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TransitionPrefs())

    fun setBetweenSongs(value: BetweenSongs) {
        viewModelScope.launch { settings.setBetweenSongs(value) }
    }

    fun setFadeSeconds(seconds: Int) {
        viewModelScope.launch { settings.setFadeSeconds(seconds) }
    }

    fun setFadeOnPause(enabled: Boolean) {
        viewModelScope.launch { settings.setFadeOnPause(enabled) }
    }

    fun setKeepAlbumsGapless(enabled: Boolean) {
        viewModelScope.launch { settings.setKeepAlbumsGapless(enabled) }
    }

    fun setLevelVolume(enabled: Boolean) {
        viewModelScope.launch { settings.setLevelVolume(enabled) }
    }

    val themeMode: StateFlow<ThemeMode> = appearance.themeMode
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ThemeMode.SYSTEM)

    val colorTheme: StateFlow<ColorTheme> = appearance.colorTheme
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ColorTheme.DEEP_BLUE)

    val seekStyle: StateFlow<SeekStyle> = appearance.seekStyle
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SeekStyle.SQUIGGLE)

    fun setSeekStyle(style: SeekStyle) {
        viewModelScope.launch { appearance.setSeekStyle(style) }
    }

    val skin: StateFlow<Skin> = appearance.skin
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Skin.STANDARD)

    fun setSkin(skin: Skin) {
        viewModelScope.launch { appearance.setSkin(skin) }
    }

    val playerButtons: StateFlow<PlayerButtons> = appearance.playerButtons
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PlayerButtons.STANDARD)

    fun setPlayerButtons(buttons: PlayerButtons) {
        viewModelScope.launch { appearance.setPlayerButtons(buttons) }
    }

    /** Saved to the profile too, except Material You (A78). */
    fun setColorTheme(theme: ColorTheme) {
        viewModelScope.launch { authRepository.setColorTheme(theme) }
    }

    fun setThemeMode(mode: ThemeMode) {
        viewModelScope.launch { appearance.setThemeMode(mode) }
    }

    val keepShuffle: StateFlow<Boolean> = settings.keepShuffle
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun setKeepShuffle(enabled: Boolean) {
        viewModelScope.launch { settings.setKeepShuffle(enabled) }
    }

    val endlessQueue: StateFlow<Boolean> = settings.endlessQueue
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    fun setEndlessQueue(enabled: Boolean) {
        viewModelScope.launch { settings.setEndlessQueue(enabled) }
    }

    fun setAutoPlayOnResume(enabled: Boolean) {
        viewModelScope.launch { settings.setAutoPlayOnResume(enabled) }
    }

    /** Who this phone is logged in as, for the Account card. */
    val username: StateFlow<String?> = flow { emit(authRepository.savedUsername()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** What the server calls this user (A68), as last seen. */
    val displayName: StateFlow<String?> = authRepository.displayName
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** `null` while idle or saving; then the outcome of the last rename, for the line under the field. */
    private val _renameResult = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
    val renameResult: StateFlow<String?> = _renameResult

    private val _isRenaming = kotlinx.coroutines.flow.MutableStateFlow(false)
    val isRenaming: StateFlow<Boolean> = _isRenaming

    /** Blank resets it: a guest gets a new `Guest 1234`, an account its username. */
    fun rename(name: String) {
        if (_isRenaming.value) return
        viewModelScope.launch {
            _isRenaming.value = true
            _renameResult.value = authRepository.setDisplayName(name).fold(
                onSuccess = { "Saved." },
                onFailure = { "Couldn't reach the server. Try again." },
            )
            _isRenaming.value = false
        }
    }

    /** A guest's identity lives only in this phone's stored token, so logging out is forgetting it for good. */
    val isGuest: Boolean get() = authRepository.isGuest

    // A second tap while the first logout runs would stack a second Login screen.
    private var loggingOut = false

    /** Ends every session of this account, then signs this phone out (Q202). [onFailed] when the server can't be reached. */
    fun logoutEverywhere(onLoggedOut: () -> Unit, onFailed: () -> Unit) {
        if (loggingOut) return
        loggingOut = true
        viewModelScope.launch {
            // Before the token is revoked: stopping saves the resume position to the server.
            playbackController.stopAndFlush()
            if (!authRepository.revokeAllSessions()) {
                loggingOut = false
                onFailed()
                return@launch
            }
            authRepository.logout()
            profileRepository.clear()
            onLoggedOut()
        }
    }

    fun logout(onLoggedOut: () -> Unit) {
        if (loggingOut) return
        loggingOut = true
        viewModelScope.launch {
            playbackController.stopAndFlush()
            authRepository.logout()
            profileRepository.clear()
            onLoggedOut()
        }
    }
}
