package com.brainlessmusic.app.ui.splash

import kotlinx.coroutines.flow.first
import com.brainlessmusic.app.data.local.AppearanceSettings
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
    private val appearance: AppearanceSettings,
) : ViewModel() {

    private val _resolvedRoute = MutableStateFlow<String?>(null)
    val resolvedRoute: StateFlow<String?> = _resolvedRoute.asStateFlow()

    private val _welcome = MutableStateFlow(false)

    /** Whether the arcade welcome is due: after a sign-in, or when the app opens on a saved session. */
    val welcome: StateFlow<Boolean> = _welcome.asStateFlow()

    /** The name the welcome greets. */
    val displayName = authRepository.displayName

    fun welcome() {
        _welcome.value = true
    }

    fun welcomed() {
        _welcome.value = false
    }

    /**
     * Just signed in: on to the first-run setup if this account hasn't been through it on this phone (A139, A142),
     * otherwise the welcome and Home. [go] gets the route.
     */
    fun signedIn(go: (String) -> Unit) {
        viewModelScope.launch {
            val user = authRepository.savedUsername()
            if (user == null || appearance.isSetUp(user)) {
                _welcome.value = true
                go(Routes.HOME)
            } else {
                go(Routes.SETUP)
            }
        }
    }

    /** The setup is through: it won't show again for this account here, and the welcome plays in the skin just picked. */
    fun setupFinished() {
        viewModelScope.launch { authRepository.savedUsername()?.let { appearance.markSetUp(it) } }
        _welcome.value = true
    }

    /** The server refused the session while the app was open; see [AuthRepository.needsSignIn]. */
    val needsSignIn: StateFlow<Boolean> = authRepository.needsSignIn

    init {
        viewModelScope.launch {
            _resolvedRoute.value = when (val restored = authRepository.restoreSession()) {
                // No signal: straight to what can play without it, if anything is downloaded.
                is SessionRestoreResult.Restored -> {
                    // Signed in already, so set up already: accounts signed in before the setup existed never see it (A141).
                    authRepository.savedUsername()?.let { appearance.markSetUp(it) }
                    _welcome.value = true
                    if (restored.offline && downloadDao.groupCount() > 0) Routes.DOWNLOADS else Routes.HOME
                }
                SessionRestoreResult.NoStoredSession,
                SessionRestoreResult.StoredSessionInvalid,
                -> Routes.LOGIN
            }
        }
    }
}
