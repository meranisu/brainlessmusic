package com.brainlessmusic.app.ui.serverconfig

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.toMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class ConnectionCheck { IDLE, CHECKING, SUCCESS, FAILED }

data class ServerConfigUiState(
    val serverUrl: String = "",
    val username: String = "",
    val password: String = "",
    val connectionCheck: ConnectionCheck = ConnectionCheck.IDLE,
    val connectionError: String? = null,
    val isLoggingIn: Boolean = false,
    val loginError: String? = null,
)

@HiltViewModel
class ServerConfigViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServerConfigUiState())
    val uiState: StateFlow<ServerConfigUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val savedUrl = authRepository.savedServerUrl()
            val savedUsername = authRepository.savedUsername()
            _uiState.update {
                it.copy(
                    serverUrl = savedUrl ?: it.serverUrl,
                    username = savedUsername ?: it.username,
                )
            }
        }
    }

    fun onServerUrlChange(value: String) {
        _uiState.update { it.copy(serverUrl = value, connectionCheck = ConnectionCheck.IDLE, connectionError = null) }
    }

    fun onUsernameChange(value: String) {
        _uiState.update { it.copy(username = value, loginError = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, loginError = null) }
    }

    fun testConnection() {
        val url = _uiState.value.serverUrl
        viewModelScope.launch {
            _uiState.update { it.copy(connectionCheck = ConnectionCheck.CHECKING, connectionError = null) }
            authRepository.testConnection(url).fold(
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
            authRepository.login(state.serverUrl, state.username, state.password).fold(
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
                },
            )
        }
    }
}
