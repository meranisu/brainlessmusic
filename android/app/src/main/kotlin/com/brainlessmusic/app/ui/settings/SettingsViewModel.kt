package com.brainlessmusic.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.local.ThemeMode
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
) : ViewModel() {

    val autoPlayOnResume: StateFlow<Boolean> = settings.autoPlayOnResume
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    val themeMode: StateFlow<ThemeMode> = appearance.themeMode
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ThemeMode.SYSTEM)

    val seekStyle: StateFlow<SeekStyle> = appearance.seekStyle
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SeekStyle.SQUIGGLE)

    fun setSeekStyle(style: SeekStyle) {
        viewModelScope.launch { appearance.setSeekStyle(style) }
    }

    fun setThemeMode(mode: ThemeMode) {
        viewModelScope.launch { appearance.setThemeMode(mode) }
    }

    fun setAutoPlayOnResume(enabled: Boolean) {
        viewModelScope.launch { settings.setAutoPlayOnResume(enabled) }
    }
}
