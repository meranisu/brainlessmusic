package com.brainlessmusic.app.ui.signup

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.ui.theme.AppIcons
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Sign up with an invite code (A187-A192): from "Sign up" on the login screen, where the code is typed, or from an
 * invite link, which fills it in. A name, email, password and an optional passcode, then the phone is signed in. An
 * upgrade invite turns the guest it was made for into the account.
 */
@Composable
fun SignUpScreen(
    onBack: () -> Unit,
    onSignedUp: () -> Unit,
    viewModel: SignUpViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val focus = LocalFocusManager.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .systemBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState()),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp)) {
            IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") }
            Text("Sign up", style = MaterialTheme.typography.titleLarge)
        }

        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainer,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                when (val step = state.step) {
                    SignUpStep.EnterCode -> CodeStep(
                        state = state,
                        canContinue = viewModel.canContinue(state),
                        onCodeChange = viewModel::onCodeChange,
                        onContinue = {
                            focus.clearFocus()
                            viewModel.submitCode()
                        },
                    )
                    SignUpStep.Checking -> Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                        Text("Checking your code…", style = MaterialTheme.typography.bodyMedium)
                    }
                    is SignUpStep.Closed -> ClosedStep(
                        status = step.status,
                        error = state.error,
                        fromLink = state.fromLink,
                        onTryAnother = viewModel::tryAnotherCode,
                        onBack = onBack,
                    )
                    is SignUpStep.Form -> FormStep(
                        step = step,
                        state = state,
                        canSubmit = viewModel.canSubmit(state),
                        onUsernameChange = viewModel::onUsernameChange,
                        onEmailChange = viewModel::onEmailChange,
                        onPasswordChange = viewModel::onPasswordChange,
                        onPasscodeChange = viewModel::onPasscodeChange,
                        onSubmit = {
                            focus.clearFocus()
                            viewModel.submit(onSignedUp)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun CodeStep(state: SignUpUiState, canContinue: Boolean, onCodeChange: (String) -> Unit, onContinue: () -> Unit) {
    Text(
        "Accounts here are by invite. Enter the 8-character code you were sent.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    OutlinedTextField(
        value = state.code,
        onValueChange = onCodeChange,
        label = { Text("Invite code") },
        placeholder = { Text("ABCD2345") },
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        textStyle = MaterialTheme.typography.titleMedium.copy(fontFamily = FontFamily.Monospace, letterSpacing = 3.sp),
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.Characters,
            autoCorrectEnabled = false,
            keyboardType = KeyboardType.Ascii,
            imeAction = ImeAction.Go,
        ),
        keyboardActions = KeyboardActions(onGo = { if (canContinue) onContinue() }),
        modifier = Modifier.fillMaxWidth(),
    )
    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    Button(onClick = onContinue, enabled = canContinue, modifier = Modifier.fillMaxWidth().height(56.dp)) {
        ButtonLabel("CONTINUE")
    }
}

@Composable
private fun ClosedStep(status: String, error: String?, fromLink: Boolean, onTryAnother: () -> Unit, onBack: () -> Unit) {
    val what = if (fromLink) "link" else "code"
    Text(
        if (status == "failed") "Couldn't check this $what" else "This $what doesn't work",
        style = MaterialTheme.typography.titleMedium,
    )
    Text(
        when (status) {
            "failed" -> error ?: "Something went wrong. Try again."
            "used" -> "It has already been used. If that was you, log in with your name or email."
            "expired", "revoked" -> "It has expired or was cancelled. Ask for a new one."
            else -> "Check it against the one you were sent, or ask for a new one."
        },
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    if (!fromLink) {
        Button(onClick = onTryAnother, modifier = Modifier.fillMaxWidth().height(56.dp)) { ButtonLabel("TRY ANOTHER CODE") }
    }
    OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth().height(56.dp)) { ButtonLabel("BACK") }
}

@Composable
private fun FormStep(
    step: SignUpStep.Form,
    state: SignUpUiState,
    canSubmit: Boolean,
    onUsernameChange: (String) -> Unit,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onPasscodeChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    var passwordVisible by remember { mutableStateOf(false) }

    Text(
        if (step.forGuest != null) "Make ${step.forGuest} a full account" else "You've been invited",
        style = MaterialTheme.typography.titleMedium,
    )
    Text(
        (if (step.forGuest != null) {
            "Where you left off comes with you, and favorites and playlists open up."
        } else {
            "Set up how you log in."
        }) + expiryNote(step.expiresAt),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    OutlinedTextField(
        value = state.username,
        onValueChange = onUsernameChange,
        label = { Text("Name") },
        supportingText = { Text("Letters, numbers, dot, dash or underscore.") },
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.None,
            autoCorrectEnabled = false,
            keyboardType = KeyboardType.Ascii,
            imeAction = ImeAction.Next,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = state.email,
        onValueChange = onEmailChange,
        label = { Text("Email") },
        supportingText = { Text("You can log in with it too. Nothing is sent to it.") },
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = state.password,
        onValueChange = onPasswordChange,
        label = { Text("Password") },
        supportingText = { Text("At least $MIN_PASSWORD_LENGTH characters.") },
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
        trailingIcon = {
            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                Icon(
                    imageVector = if (passwordVisible) AppIcons.visibilityOff else AppIcons.visibility,
                    contentDescription = if (passwordVisible) "Hide password" else "Show password",
                )
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = state.passcode,
        onValueChange = onPasscodeChange,
        label = { Text("Passcode (optional)") },
        supportingText = { Text("4 to 8 digits, a quicker way in on the website.") },
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { if (canSubmit) onSubmit() }),
        modifier = Modifier.fillMaxWidth(),
    )

    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

    Button(onClick = onSubmit, enabled = canSubmit, modifier = Modifier.fillMaxWidth().height(56.dp)) {
        if (state.isSubmitting) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        } else {
            ButtonLabel("CREATE ACCOUNT")
        }
    }
}

@Composable
private fun ButtonLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp)
}

/** " This invite works until 20 Oct." from the server's `2026-10-20 11:48:10`; nothing if it won't parse. */
private fun expiryNote(expiresAt: String): String =
    runCatching {
        val date = LocalDate.parse(expiresAt.take(10))
        " This invite works until ${date.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))}."
    }.getOrDefault("")
