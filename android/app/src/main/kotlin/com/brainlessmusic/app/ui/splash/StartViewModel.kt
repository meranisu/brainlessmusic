package com.brainlessmusic.app.ui.splash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.SessionRestoreResult
import com.brainlessmusic.app.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class StartViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _resolvedRoute = MutableStateFlow<String?>(null)
    val resolvedRoute: StateFlow<String?> = _resolvedRoute.asStateFlow()

    init {
        viewModelScope.launch {
            _resolvedRoute.value = when (authRepository.restoreSession()) {
                is SessionRestoreResult.Restored -> Routes.HOME
                SessionRestoreResult.NoStoredSession,
                SessionRestoreResult.StoredSessionInvalid,
                -> Routes.SERVER_CONFIG
            }
        }
    }
}
