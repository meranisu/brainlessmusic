package com.brainlessmusic.app.ui.splash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.SessionRestoreResult
import com.brainlessmusic.app.downloads.DownloadDao
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
    private val downloadDao: DownloadDao,
) : ViewModel() {

    private val _resolvedRoute = MutableStateFlow<String?>(null)
    val resolvedRoute: StateFlow<String?> = _resolvedRoute.asStateFlow()

    /** The server refused the session while the app was open; see [AuthRepository.needsSignIn]. */
    val needsSignIn: StateFlow<Boolean> = authRepository.needsSignIn

    init {
        viewModelScope.launch {
            _resolvedRoute.value = when (val restored = authRepository.restoreSession()) {
                // No signal: straight to what can play without it, if anything is downloaded.
                is SessionRestoreResult.Restored ->
                    if (restored.offline && downloadDao.groupCount() > 0) Routes.DOWNLOADS else Routes.ARTISTS
                SessionRestoreResult.NoStoredSession,
                SessionRestoreResult.StoredSessionInvalid,
                -> Routes.LOGIN
            }
        }
    }
}
