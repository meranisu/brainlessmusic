package com.brainlessmusic.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.ColorTheme
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.local.ThemeMode
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.playback.PlaybackController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settings: PlaybackSettings,
    private val appearance: AppearanceSettings,
    private val authRepository: AuthRepository,
    private val playbackController: PlaybackController,
) : ViewModel() {

    val autoPlayOnResume: StateFlow<Boolean> = settings.autoPlayOnResume
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

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

    /** A guest's identity lives only in this phone's stored token, so logging out is forgetting it for good. */
    val isGuest: Boolean get() = authRepository.isGuest

    fun logout(onLoggedOut: () -> Unit) {
        viewModelScope.launch {
            playbackController.stop()
            authRepository.logout()
            onLoggedOut()
        }
    }
}
