package com.brainlessmusic.app.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.GuestEntryResult
import com.brainlessmusic.app.data.repository.toMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class ConnectionCheck { IDLE, CHECKING, SUCCESS, FAILED }

/** The card under the title band: two buttons first, then the form for whichever was pressed (A41). */
enum class EntryMode { CHOOSE, LOGIN, GUEST }

data class LoginUiState(
    val serverHost: String = "",
    val username: String = "",
    val password: String = "",
    val connectionCheck: ConnectionCheck = ConnectionCheck.IDLE,
    val connectionError: String? = null,
    val isLoggingIn: Boolean = false,
    val loginError: String? = null,
    val mode: EntryMode = EntryMode.CHOOSE,
    /** Learnt from a 401 on a code-less try, like the web: the server does not advertise that it wants one. */
    val guestNeedsCode: Boolean = false,
    val guestCode: String = "",
    val isEnteringGuest: Boolean = false,
    val guestError: String? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    serverConfig: ServerConfig,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState(serverHost = serverConfig.host))
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        // The light is the first thing the screen says, so check without being asked.
        checkServer()
        viewModelScope.launch {
            val savedUsername = authRepository.savedUsername()
            _uiState.update { it.copy(username = it.username.ifEmpty { savedUsername ?: "" }) }
        }
    }

    fun onUsernameChange(value: String) {
        _uiState.update { it.copy(username = value, loginError = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, loginError = null) }
    }

    fun chooseLogin() {
        _uiState.update { it.copy(mode = EntryMode.LOGIN, loginError = null) }
    }

    /**
     * Guest goes straight in when the server's guest door is open; only a 401 opens the code form. So on an open
     * server one press is the whole flow, and the code field never shows.
     */
    fun chooseGuest(onEntered: (username: String) -> Unit) {
        _uiState.update { it.copy(mode = EntryMode.GUEST, guestError = null) }
        enterAsGuest(onEntered)
    }

    fun backToChoice() {
        _uiState.update {
            it.copy(mode = EntryMode.CHOOSE, password = "", loginError = null, guestError = null, guestCode = "")
        }
    }

    fun onGuestCodeChange(value: String) {
        _uiState.update { it.copy(guestCode = value, guestError = null) }
    }

    fun enterAsGuest(onEntered: (username: String) -> Unit) {
        val state = _uiState.value
        if (state.isEnteringGuest) return
        val code = state.guestCode.takeIf { state.guestNeedsCode && it.isNotBlank() }
        viewModelScope.launch {
            _uiState.update { it.copy(isEnteringGuest = true, guestError = null) }
            when (val result = authRepository.enterAsGuest(code)) {
                is GuestEntryResult.Entered -> {
                    _uiState.update { it.copy(isEnteringGuest = false, guestCode = "") }
                    onEntered(result.username)
                }
                GuestEntryResult.CodeRejected -> _uiState.update {
                    it.copy(
                        isEnteringGuest = false,
                        guestNeedsCode = true,
                        guestError = if (code != null) "That code is not right, or it was already used." else null,
                    )
                }
                is GuestEntryResult.Failed -> {
                    _uiState.update { it.copy(isEnteringGuest = false, guestError = result.message) }
                    checkServer()
                }
            }
        }
    }

    fun checkServer() {
        if (_uiState.value.connectionCheck == ConnectionCheck.CHECKING) return
        viewModelScope.launch {
            _uiState.update { it.copy(connectionCheck = ConnectionCheck.CHECKING, connectionError = null) }
            authRepository.testConnection().fold(
                onSuccess = {
                    _uiState.update { it.copy(connectionCheck = ConnectionCheck.SUCCESS) }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            connectionCheck = ConnectionCheck.FAILED,
                            connectionError = (error as? ConnectionException)?.error?.toMessage()
                                ?: "Something went wrong.",
                        )
                    }
                },
            )
        }
    }

    fun login(onLoggedIn: (username: String) -> Unit) {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isLoggingIn = true, loginError = null) }
            authRepository.login(state.username, state.password).fold(
                onSuccess = {
                    _uiState.update { it.copy(isLoggingIn = false, password = "") }
                    onLoggedIn(state.username)
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isLoggingIn = false,
                            loginError = (error as? ConnectionException)?.error?.toMessage()
                                ?: "Something went wrong.",
                        )
                    }
                    // A failed login may really be an unreachable server; let the light say which.
                    checkServer()
                },
            )
        }
    }
}
