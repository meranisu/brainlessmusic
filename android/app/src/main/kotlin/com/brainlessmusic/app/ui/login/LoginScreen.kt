package com.brainlessmusic.app.ui.login

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
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
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.BuildConfig
import com.brainlessmusic.app.ui.common.BrandMark
import com.brainlessmusic.app.ui.theme.BrandFontFamily
import com.brainlessmusic.app.ui.theme.AppIcons

/** The web title screen in Material colors: beat mosaic, a solid band with the wordmark, and true corner readouts. */
@Composable
fun LoginScreen(
    onLoggedIn: (username: String) -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var passwordVisible by remember { mutableStateOf(false) }
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entered = true }
    val focus = LocalFocusManager.current
    // System back steps out of a form to the two buttons, rather than leaving the app. Once a request is approved the
    // phone is signed in, so back carries on into the app instead.
    BackHandler(enabled = state.mode != EntryMode.CHOOSE || state.handedCode != null) {
        if (state.handedCode != null) viewModel.continueWithHandedCode(onLoggedIn) else viewModel.backToChoice()
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BeatMosaic()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Center,
        ) {
            StatusReadout(
                check = state.connectionCheck,
                onRetry = viewModel::checkServer,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            )

            Spacer(Modifier.height(12.dp))

            AnimatedVisibility(
                visible = entered,
                enter = fadeIn() + slideInVertically { it / 6 },
            ) {
                Column {
                    TitleBand()

                    Spacer(Modifier.height(20.dp))

                    Surface(
                        shape = RoundedCornerShape(28.dp),
                        color = MaterialTheme.colorScheme.surfaceContainer,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            when (state.mode) {
                                EntryMode.CHOOSE -> ChooseEntry(
                                    onLogin = viewModel::chooseLogin,
                                    onGuest = viewModel::chooseGuest,
                                )
                                EntryMode.LOGIN -> LoginForm(
                                    state = state,
                                    passwordVisible = passwordVisible,
                                    onTogglePassword = { passwordVisible = !passwordVisible },
                                    onBack = viewModel::backToChoice,
                                    onUsernameChange = viewModel::onUsernameChange,
                                    onPasswordChange = viewModel::onPasswordChange,
                                    onSubmit = {
                                        focus.clearFocus()
                                        if (canLogin(state)) viewModel.login(onLoggedIn)
                                    },
                                )
                                EntryMode.GUEST -> {
                                    // Locals: `state` is a delegated property, so its fields don't smart-cast.
                                    val handedCode = state.handedCode
                                    val requestState = state.requestState
                                    when {
                                    handedCode != null -> HandedCode(
                                        name = state.handedName,
                                        code = handedCode,
                                        onContinue = { viewModel.continueWithHandedCode(onLoggedIn) },
                                    )
                                    requestState != null -> RequestStatus(
                                        state = requestState,
                                        unreachable = state.requestUnreachable,
                                        onStop = viewModel::stopWaiting,
                                        onDismiss = viewModel::dismissRequest,
                                    )
                                    else -> GuestForm(
                                        state = state,
                                        onBack = viewModel::backToChoice,
                                        onNameChange = viewModel::onGuestNameChange,
                                        onCodeChange = viewModel::onGuestCodeChange,
                                        onShowCode = viewModel::showCodeField,
                                        onRequest = {
                                            focus.clearFocus()
                                            viewModel.requestCode()
                                        },
                                        onSubmit = {
                                            focus.clearFocus()
                                            if (canEnterGuest(state)) viewModel.enterAsGuest(onLoggedIn)
                                        },
                                    )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            state.connectionError?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp),
                )
            }

            Footer(host = state.serverHost, modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp))
        }
    }
}

private fun canLogin(state: LoginUiState) =
    !state.isLoggingIn && state.username.isNotBlank() && state.password.isNotBlank()

private fun canEnterGuest(state: LoginUiState) =
    !state.isEnteringGuest && (!state.guestNeedsCode || state.guestCode.isNotBlank())

/** The first thing on the card: two ways in, account first because this app is mostly for accounts. */
@Composable
private fun ChooseEntry(onLogin: () -> Unit, onGuest: () -> Unit) {
    Button(onClick = onLogin, modifier = Modifier.fillMaxWidth().height(56.dp)) {
        Text("LOG IN", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp)
    }
    OutlinedButton(onClick = onGuest, modifier = Modifier.fillMaxWidth().height(56.dp)) {
        Text("GUEST", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp)
    }
    Text(
        "Guests can listen and search. Playlists, favorites and play counts need an account.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun BackRow(label: String, onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) {
            Icon(AppIcons.back, contentDescription = "Back")
        }
        Text(label, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun LoginForm(
    state: LoginUiState,
    passwordVisible: Boolean,
    onTogglePassword: () -> Unit,
    onBack: () -> Unit,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    BackRow("Log in", onBack)

    OutlinedTextField(
        value = state.username,
        onValueChange = onUsernameChange,
        label = { Text("Username") },
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
        modifier = Modifier.fillMaxWidth(),
    )

    OutlinedTextField(
        value = state.password,
        onValueChange = onPasswordChange,
        label = { Text("Password") },
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onSubmit() }),
        trailingIcon = {
            IconButton(onClick = onTogglePassword) {
                Icon(
                    imageVector = if (passwordVisible) AppIcons.visibilityOff else AppIcons.visibility,
                    contentDescription = if (passwordVisible) "Hide password" else "Show password",
                )
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )

    state.loginError?.let {
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }

    Button(
        onClick = onSubmit,
        enabled = canLogin(state),
        modifier = Modifier.fillMaxWidth().height(56.dp),
    ) {
        if (state.isLoggingIn) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        } else {
            Text("LOG IN", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp)
        }
    }
}

/** A name, then a code or a request (A67-A69). Case and dash in the code are ignored. */
@Composable
private fun GuestForm(
    state: LoginUiState,
    onBack: () -> Unit,
    onNameChange: (String) -> Unit,
    onCodeChange: (String) -> Unit,
    onShowCode: () -> Unit,
    onRequest: () -> Unit,
    onSubmit: () -> Unit,
) {
    BackRow("Guest", onBack)

    Text(
        "A guest code lets you back in as the same guest on any device.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    OutlinedTextField(
        value = state.guestName,
        onValueChange = onNameChange,
        label = { Text("Name (optional)") },
        supportingText = { Text("Leave it blank and you're Guest plus a number.") },
        singleLine = true,
        shape = RoundedCornerShape(16.dp),
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.Words,
            imeAction = if (state.guestNeedsCode) ImeAction.Next else ImeAction.Done,
        ),
        keyboardActions = KeyboardActions(onDone = { onSubmit() }),
        modifier = Modifier.fillMaxWidth(),
    )

    if (state.guestNeedsCode) {
        OutlinedTextField(
            value = state.guestCode,
            onValueChange = onCodeChange,
            label = { Text("Guest code") },
            singleLine = true,
            shape = RoundedCornerShape(16.dp),
            textStyle = MaterialTheme.typography.titleMedium.copy(fontFamily = FontFamily.Monospace, letterSpacing = 2.sp),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Ascii,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
            modifier = Modifier.fillMaxWidth(),
        )
    }

    state.guestError?.let {
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }

    Button(
        onClick = onSubmit,
        enabled = canEnterGuest(state),
        modifier = Modifier.fillMaxWidth().height(56.dp),
    ) {
        if (state.isEnteringGuest) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        } else {
            Text("ENTER", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp)
        }
    }

    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!state.guestNeedsCode) {
            TextButton(onClick = onShowCode, modifier = Modifier.weight(1f).height(48.dp)) { Text("I have a code") }
        }
        TextButton(
            onClick = onRequest,
            enabled = !state.isRequesting,
            modifier = Modifier.weight(1f).height(48.dp),
        ) { Text(if (state.isRequesting) "Asking…" else "Request a code") }
    }
}

/** Waiting for the admin, or the answer that ended the wait. */
@Composable
private fun RequestStatus(state: RequestState, unreachable: Boolean, onStop: () -> Unit, onDismiss: () -> Unit) {
    Text(
        if (state == RequestState.WAITING) "Waiting for the admin" else "Request closed",
        style = MaterialTheme.typography.titleMedium,
    )
    Text(
        when (state) {
            RequestState.WAITING -> if (unreachable) {
                "Lost touch with the server. Still trying."
            } else {
                "Your request is in. Keep the app open and you go straight in once the admin approves it."
            }
            RequestState.DENIED -> "The admin turned this request down."
            RequestState.EXPIRED -> "Nobody answered this request within a day."
            RequestState.GONE -> "This request is no longer open."
        },
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
    if (state == RequestState.WAITING) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
        OutlinedButton(onClick = onStop, modifier = Modifier.fillMaxWidth().height(56.dp)) {
            Text("Stop waiting")
        }
    } else {
        Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth().height(56.dp)) {
            Text("BACK", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp)
        }
    }
}

/** After approval: this phone is signed in, and the code is shown once for the guest's other devices. */
@Composable
private fun HandedCode(name: String, code: String, onContinue: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }

    Text(if (name.isNotEmpty()) "You're in, $name" else "You're in", style = MaterialTheme.typography.titleMedium)
    Text(
        "This is your guest code. Type it in the browser or on another phone to listen as the same guest there. " +
            "The admin can look it up if you lose it.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    SelectionContainer {
        Text(
            prettyCode(code),
            style = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Monospace, letterSpacing = 3.sp),
            fontWeight = FontWeight.SemiBold,
        )
    }
    if (copied) {
        Text(
            "Copied.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
    Button(onClick = onContinue, modifier = Modifier.fillMaxWidth().height(56.dp)) {
        Text("START LISTENING", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp)
    }
    OutlinedButton(
        onClick = {
            clipboard.setText(AnnotatedString(prettyCode(code)))
            copied = true
        },
        modifier = Modifier.fillMaxWidth().height(48.dp),
    ) { Text("Copy code") }
}

/** `ABCD-EFGH`, the way the admin's card prints it. */
private fun prettyCode(code: String): String =
    if (code.length == 8) "${code.take(4)}-${code.drop(4)}" else code

/** The middle band on the inverse surface, like the web's white band, with the accent from inverse-primary. */
@Composable
private fun TitleBand() {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(scheme.inverseSurface)
            .padding(horizontal = 24.dp, vertical = 26.dp),
    ) {
        Text(
            "SELF-HOSTED · PERSONAL AUDIO",
            color = scheme.inverseOnSurface.copy(alpha = 0.65f),
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 2.4.sp,
        )
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            BrandMark(ringColor = scheme.inverseOnSurface, dotColor = scheme.inversePrimary, size = 30.dp)
            Spacer(Modifier.size(8.dp))
            // Sized so "brainlessmusic" plus the mark fits a 360 dp phone with the band's margins.
            Text(
                text = buildAnnotatedString {
                    append("brainless")
                    pushStyle(SpanStyle(color = scheme.inversePrimary))
                    append("music")
                    pop()
                },
                color = scheme.inverseOnSurface,
                fontFamily = BrandFontFamily,
                fontSize = 33.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.8).sp,
                maxLines = 1,
            )
        }
    }
}

/** Top corners of the web's HUD: the version on the left, whether the server answered on the right. */
@Composable
private fun StatusReadout(check: ConnectionCheck, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val (label, color) = when (check) {
        ConnectionCheck.SUCCESS -> "OK" to Color(0xFF2E9E4F)
        ConnectionCheck.FAILED -> "UNREACHABLE" to scheme.error
        ConnectionCheck.CHECKING, ConnectionCheck.IDLE -> "CHECKING" to scheme.outline
    }
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("VER ${BuildConfig.VERSION_NAME}", style = hud(), color = scheme.onSurfaceVariant)
        // Tapping re-checks the server.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clickable(enabled = check != ConnectionCheck.CHECKING, onClick = onRetry)
                .padding(vertical = 8.dp),
        ) {
            Text("SERVER ", style = hud(), color = scheme.onSurfaceVariant)
            Box(Modifier.size(8.dp).background(color, CircleShape))
            Spacer(Modifier.size(6.dp))
            Text(label, style = hud(), color = color)
            if (check == ConnectionCheck.FAILED) Text("  · TAP TO RETRY", style = hud(), color = scheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Footer(host: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(host.uppercase(), style = hud(), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("SELF-HOSTED", style = hud(), color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun hud() = MaterialTheme.typography.labelSmall.copy(
    fontFamily = FontFamily.Monospace,
    fontSize = 10.sp,
    letterSpacing = 1.8.sp,
)
