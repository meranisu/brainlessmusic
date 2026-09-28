package com.brainlessmusic.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.PlaybackSettings
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settings: PlaybackSettings,
) : ViewModel() {

    val autoPlayOnResume: StateFlow<Boolean> = settings.autoPlayOnResume
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun setAutoPlayOnResume(enabled: Boolean) {
        viewModelScope.launch { settings.setAutoPlayOnResume(enabled) }
    }
}
