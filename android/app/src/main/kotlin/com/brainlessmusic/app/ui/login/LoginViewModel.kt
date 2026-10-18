package com.brainlessmusic.app.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.GuestEntryResult
import com.brainlessmusic.app.data.repository.GuestRequestPoll
import com.brainlessmusic.app.data.repository.GuestRequestResult
import com.brainlessmusic.app.ui.profile.loadMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class ConnectionCheck { IDLE, CHECKING, SUCCESS, FAILED }

/** The card under the title band: two buttons first, then the form for whichever was pressed (A41). */
enum class EntryMode { CHOOSE, LOGIN, GUEST }

/** Where a "Request a code" stands (A67). `GONE`: unknown, already collected, or lost. */
enum class RequestState { WAITING, DENIED, EXPIRED, GONE }

private const val REQUEST_POLL_MS = 3_000L

data class LoginUiState(
    val serverHost: String = "",
    val username: String = "",
    val password: String = "",
    val connectionCheck: ConnectionCheck = ConnectionCheck.IDLE,
    val connectionError: String? = null,
    val isLoggingIn: Boolean = false,
    val loginError: String? = null,
    val mode: EntryMode = EntryMode.CHOOSE,
    /** Shown by "I have a code", or learnt from a 401 on a code-less try: the server does not advertise that it wants one. */
    val guestNeedsCode: Boolean = false,
    val guestCode: String = "",
    val guestName: String = "",
    val isEnteringGuest: Boolean = false,
    val guestError: String? = null,
    val isRequesting: Boolean = false,
    val requestState: RequestState? = null,
    /** The last poll failed; still waiting. */
    val requestUnreachable: Boolean = false,
    /** Set once a request is approved and this phone is signed in: the code for the guest's other devices. */
    val handedCode: String? = null,
    val handedName: String = "",
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    serverConfig: ServerConfig,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState(serverHost = serverConfig.host))
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    private var pollJob: Job? = null

    init {
        // The light is the first thing the screen says, so check without being asked.
        checkServer()
        viewModelScope.launch {
            val savedUsername = authRepository.savedUsername()
            _uiState.update { it.copy(username = it.username.ifEmpty { savedUsername ?: "" }) }
            // A request still waiting from before the app was closed picks up where it was.
            if (authRepository.hasPendingGuestRequest()) {
                _uiState.update { it.copy(mode = EntryMode.GUEST, requestState = RequestState.WAITING) }
                startPolling()
            }
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

    /** Opens the guest form: a name, then a code or a request (A67-A69). */
    fun chooseGuest() {
        _uiState.update { it.copy(mode = EntryMode.GUEST, guestError = null) }
    }

    /** Back from a waiting request withdraws it, like "Stop waiting". */
    fun backToChoice() {
        if (_uiState.value.requestState == RequestState.WAITING) stopWaiting()
        _uiState.update {
            it.copy(
                mode = EntryMode.CHOOSE,
                password = "",
                loginError = null,
                guestError = null,
                guestCode = "",
                guestNeedsCode = false,
                requestState = null,
            )
        }
    }

    fun onGuestNameChange(value: String) {
        _uiState.update { it.copy(guestName = value.take(32), guestError = null) }
    }

    fun showCodeField() {
        _uiState.update { it.copy(guestNeedsCode = true, guestError = null) }
    }

    fun requestCode() {
        val state = _uiState.value
        if (state.isRequesting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRequesting = true, guestError = null) }
            when (val result = authRepository.requestGuestCode(state.guestName)) {
                GuestRequestResult.Waiting -> {
                    _uiState.update {
                        it.copy(isRequesting = false, requestState = RequestState.WAITING, requestUnreachable = false)
                    }
                    startPolling()
                }
                is GuestRequestResult.Failed -> _uiState.update { it.copy(isRequesting = false, guestError = result.message) }
            }
        }
    }

    /** Polls every few seconds while waiting. Runs in the view model, so it carries on with the screen in the background. */
    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (true) {
                when (val poll = authRepository.pollGuestRequest()) {
                    GuestRequestPoll.Pending -> _uiState.update { it.copy(requestUnreachable = false) }
                    GuestRequestPoll.Unreachable -> _uiState.update { it.copy(requestUnreachable = true) }
                    GuestRequestPoll.Denied -> return@launch finishRequest(RequestState.DENIED)
                    GuestRequestPoll.Expired -> return@launch finishRequest(RequestState.EXPIRED)
                    GuestRequestPoll.Gone -> return@launch finishRequest(RequestState.GONE)
                    is GuestRequestPoll.Approved -> {
                        _uiState.update { it.copy(requestState = null, handedCode = poll.code, handedName = poll.name) }
                        return@launch
                    }
                    is GuestRequestPoll.ApprovedSignInFailed -> {
                        _uiState.update {
                            it.copy(
                                requestState = null,
                                guestNeedsCode = true,
                                guestCode = poll.code,
                                guestError = "Approved, but signing in failed. Tap Enter to use your new code.",
                            )
                        }
                        return@launch
                    }
                }
                delay(REQUEST_POLL_MS)
            }
        }
    }

    private fun finishRequest(state: RequestState) {
        _uiState.update { it.copy(requestState = state, requestUnreachable = false) }
    }

    fun stopWaiting() {
        pollJob?.cancel()
        pollJob = null
        viewModelScope.launch { authRepository.cancelGuestRequest() }
        _uiState.update { it.copy(requestState = null, requestUnreachable = false) }
    }

    /** Back from a denied, expired or lost request to the form. */
    fun dismissRequest() {
        _uiState.update { it.copy(requestState = null) }
    }

    fun continueWithHandedCode(onEntered: (name: String) -> Unit) {
        val name = _uiState.value.handedName
        _uiState.update { it.copy(handedCode = null) }
        onEntered(name)
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
            when (val result = authRepository.enterAsGuest(code, state.guestName)) {
                is GuestEntryResult.Entered -> {
                    _uiState.update { it.copy(isEnteringGuest = false, guestCode = "") }
                    onEntered(result.name)
                }
                GuestEntryResult.CodeRejected -> _uiState.update {
                    it.copy(
                        isEnteringGuest = false,
                        guestNeedsCode = true,
                        guestError = if (code != null) {
                            "That code is not right, or it has stopped working."
                        } else {
                            "This server asks for a code. Type yours, or request one."
                        },
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
                            connectionError = error.loadMessage(),
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
                            loginError = error.loadMessage(),
                        )
                    }
                    // A failed login may really be an unreachable server; let the light say which.
                    checkServer()
                },
            )
        }
    }
}
