package com.brainlessmusic.app.ui.signup

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.remote.dto.AcceptInviteRequest
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.InviteCheck
import com.brainlessmusic.app.invites.InviteLinks
import com.brainlessmusic.app.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

const val MIN_PASSWORD_LENGTH = 8
private val PASSCODE = Regex("^\\d{4,8}$")

/** Where sign-up stands: the code first (unless a link brought it), then the form, or why the code doesn't work. */
sealed interface SignUpStep {
    data object EnterCode : SignUpStep
    data object Checking : SignUpStep
    /** [forGuest]: an upgrade invite, which turns that guest into the account. */
    data class Form(val forGuest: String?, val expiresAt: String) : SignUpStep
    data class Closed(val status: String) : SignUpStep
}

data class SignUpUiState(
    val step: SignUpStep = SignUpStep.EnterCode,
    /** From a link: no "try another code", since the link is the only code there is. */
    val fromLink: Boolean = false,
    val code: String = "",
    val username: String = "",
    val email: String = "",
    val password: String = "",
    val passcode: String = "",
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class SignUpViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val appearance: AppearanceSettings,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val linkCode: String? = savedStateHandle.get<String>(Routes.ARG_INVITE_CODE)?.takeIf { it.isNotBlank() }

    private val _uiState = MutableStateFlow(SignUpUiState(fromLink = linkCode != null, code = linkCode ?: ""))
    val uiState: StateFlow<SignUpUiState> = _uiState.asStateFlow()

    /** The code actually checked, typed or from the link. */
    private var checkedCode: String? = null

    init {
        if (linkCode != null) check(linkCode)
    }

    fun onCodeChange(value: String) = _uiState.update { it.copy(code = value.take(12), error = null) }
    fun onUsernameChange(value: String) = _uiState.update { it.copy(username = value, error = null) }
    fun onEmailChange(value: String) = _uiState.update { it.copy(email = value, error = null) }
    fun onPasswordChange(value: String) = _uiState.update { it.copy(password = value, error = null) }
    fun onPasscodeChange(value: String) =
        _uiState.update { it.copy(passcode = value.filter(Char::isDigit).take(8), error = null) }

    fun canContinue(state: SignUpUiState) = InviteLinks.normalize(state.code) != null

    fun submitCode() {
        val code = InviteLinks.normalize(_uiState.value.code) ?: return
        check(code)
    }

    /** Back to typing a code, after one that doesn't work. */
    fun tryAnotherCode() = _uiState.update { it.copy(step = SignUpStep.EnterCode, code = "", error = null) }

    private fun check(code: String) {
        _uiState.update { it.copy(step = SignUpStep.Checking, error = null) }
        viewModelScope.launch {
            when (val result = authRepository.peekInvite(code)) {
                is InviteCheck.Open -> {
                    checkedCode = code
                    _uiState.update { it.copy(step = SignUpStep.Form(result.peek.forGuest, result.peek.expiresAt)) }
                }
                is InviteCheck.Closed -> _uiState.update { it.copy(step = SignUpStep.Closed(result.status)) }
                // A failed check (no signal) goes back a step with the reason, so it can be tried again.
                is InviteCheck.Failed -> _uiState.update {
                    it.copy(step = if (it.fromLink) SignUpStep.Closed("failed") else SignUpStep.EnterCode, error = result.message)
                }
            }
        }
    }

    fun canSubmit(state: SignUpUiState) =
        !state.isSubmitting && state.username.isNotBlank() && state.email.isNotBlank() && state.password.isNotEmpty()

    fun submit(onSignedUp: () -> Unit) {
        val state = _uiState.value
        val code = checkedCode ?: return
        val step = state.step
        if (!canSubmit(state)) return
        if (state.password.length < MIN_PASSWORD_LENGTH) {
            _uiState.update { it.copy(error = "Your password needs at least $MIN_PASSWORD_LENGTH characters.") }
            return
        }
        if (state.passcode.isNotEmpty() && !PASSCODE.matches(state.passcode)) {
            _uiState.update { it.copy(error = "A passcode is 4 to 8 digits. Leave it empty to skip it.") }
            return
        }
        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            // A guest upgrading on a phone it already set up keeps that: same person, new username.
            val before = authRepository.savedUsername()
            val wasSetUp = before != null && appearance.isSetUp(before)
            val body = AcceptInviteRequest(
                username = state.username.trim(),
                email = state.email.trim(),
                password = state.password,
                passcode = state.passcode.ifEmpty { null },
            )
            authRepository.acceptInvite(code, body).fold(
                onSuccess = {
                    if (wasSetUp && step is SignUpStep.Form && step.forGuest != null) {
                        authRepository.savedUsername()?.let { appearance.markSetUp(it) }
                    }
                    _uiState.update { it.copy(isSubmitting = false, password = "", passcode = "") }
                    onSignedUp()
                },
                onFailure = { error -> _uiState.update { it.copy(isSubmitting = false, error = error.message) } },
            )
        }
    }
}
