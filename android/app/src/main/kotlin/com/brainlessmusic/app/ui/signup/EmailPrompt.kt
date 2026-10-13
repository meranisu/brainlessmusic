package com.brainlessmusic.app.ui.signup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.ui.common.Notices
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EmailPromptState(
    val visible: Boolean = false,
    val email: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
)

/**
 * Asks an account made before emails for one (A189-A190), once per app start: "Later" holds until the next one. Guests
 * are never asked. Checked on reaching the app proper, so a sign-in as someone else is checked again.
 */
@HiltViewModel
class EmailPromptViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(EmailPromptState())
    val state: StateFlow<EmailPromptState> = _state.asStateFlow()

    private var checkedFor: String? = null

    /** Called whenever the app proper is reached; asks the server once per signed-in username. */
    fun check() {
        viewModelScope.launch {
            val who = authRepository.savedUsername() ?: return@launch
            if (who == checkedFor || laterThisRun) return@launch
            checkedFor = who
            if (authRepository.needsEmail()) _state.update { it.copy(visible = true) }
        }
    }

    fun onEmailChange(value: String) = _state.update { it.copy(email = value, error = null) }

    fun later() {
        laterThisRun = true
        _state.update { EmailPromptState() }
    }

    fun save() {
        val email = _state.value.email
        if (email.isBlank() || _state.value.isSaving) return
        _state.update { it.copy(isSaving = true, error = null) }
        viewModelScope.launch {
            authRepository.setEmail(email).fold(
                onSuccess = {
                    _state.update { EmailPromptState() }
                    Notices.show("Email saved")
                },
                onFailure = { error -> _state.update { it.copy(isSaving = false, error = error.message) } },
            )
        }
    }

    private companion object {
        /** Process-wide, so "Later" survives the screen's view model being recreated, but not an app restart. */
        var laterThisRun = false
    }
}

/** Shown over the app while [active] (a signed-in screen, not login, sign-up or setup). */
@Composable
fun EmailPrompt(active: Boolean, viewModel: EmailPromptViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(active) { if (active) viewModel.check() }
    if (!active || !state.visible) return

    AlertDialog(
        onDismissRequest = viewModel::later,
        title = { Text("Add your email") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Your account doesn't have one yet. You'll be able to log in with it, and later reset a forgotten " +
                        "password. Nothing is sent to it for now.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = state.email,
                    onValueChange = viewModel::onEmailChange,
                    label = { Text("Email") },
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    isError = state.error != null,
                    supportingText = state.error?.let { { Text(it) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { viewModel.save() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(onClick = viewModel::save, enabled = state.email.isNotBlank() && !state.isSaving) {
                Text(if (state.isSaving) "Saving…" else "Save")
            }
        },
        dismissButton = { TextButton(onClick = viewModel::later) { Text("Later") } },
    )
}
