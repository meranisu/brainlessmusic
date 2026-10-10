package com.brainlessmusic.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.BetweenSongs
import com.brainlessmusic.app.data.local.ColorTheme
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.local.ThemeMode
import com.brainlessmusic.app.data.local.TransitionPrefs
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
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

    /** `null` until the reset is tried, then whether it worked. */
    private val _lessOftenReset = kotlinx.coroutines.flow.MutableStateFlow<Boolean?>(null)
    val lessOftenReset: StateFlow<Boolean?> = _lessOftenReset

    /** Every song swiped to "less often" goes back into shuffle as normal (A60). */
    fun resetLessOften() {
        viewModelScope.launch { _lessOftenReset.value = libraryRepository.clearLessOften().isSuccess }
    }

    val autoPlayOnResume: StateFlow<Boolean> = settings.autoPlayOnResume
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    val keepPlayingWhenSwipedAway: StateFlow<Boolean> = settings.keepPlayingWhenSwipedAway
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    fun setKeepPlayingWhenSwipedAway(enabled: Boolean) {
        viewModelScope.launch { settings.setKeepPlayingWhenSwipedAway(enabled) }
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

    val themeMode: StateFlow<ThemeMode> = appearance.themeMode
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ThemeMode.SYSTEM)

    val colorTheme: StateFlow<ColorTheme> = appearance.colorTheme
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ColorTheme.DEEP_BLUE)

    val seekStyle: StateFlow<SeekStyle> = appearance.seekStyle
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SeekStyle.SQUIGGLE)

    fun setSeekStyle(style: SeekStyle) {
        viewModelScope.launch { appearance.setSeekStyle(style) }
    }

    fun setColorTheme(theme: ColorTheme) {
        viewModelScope.launch { appearance.setColorTheme(theme) }
    }

    fun setThemeMode(mode: ThemeMode) {
        viewModelScope.launch { appearance.setThemeMode(mode) }
    }

    fun setAutoPlayOnResume(enabled: Boolean) {
        viewModelScope.launch { settings.setAutoPlayOnResume(enabled) }
    }

    /** Who this phone is logged in as, for the Account card. */
    val username: StateFlow<String?> = flow { emit(authRepository.savedUsername()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** A guest's identity lives only in this phone's stored token, so logging out is forgetting it for good. */
    val isGuest: Boolean get() = authRepository.isGuest

    fun logout(onLoggedOut: () -> Unit) {
        viewModelScope.launch {
            playbackController.stop()
            authRepository.logout()
            profileRepository.clear()
            onLoggedOut()
        }
    }
}
