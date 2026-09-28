package com.brainlessmusic.app.ui.login

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
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

/**
 * The web app's title screen, translated: a beat-driven tile mosaic for a ground, a solid band carrying the
 * ringed mark and the two-tone wordmark, and corner readouts that say true things (version, whether the
 * server answered, which host). Every color is a [MaterialTheme] role, so it follows the wallpaper (Material
 * You) and the app's light/dark setting instead of the web's fixed navy and orange.
 */
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
                        tonalElevation = 2.dp,
                        shadowElevation = 6.dp,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            OutlinedTextField(
                                value = state.username,
                                onValueChange = viewModel::onUsernameChange,
                                label = { Text("Username") },
                                singleLine = true,
                                shape = RoundedCornerShape(16.dp),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
                                modifier = Modifier.fillMaxWidth(),
                            )

                            OutlinedTextField(
                                value = state.password,
                                onValueChange = viewModel::onPasswordChange,
                                label = { Text("Password") },
                                singleLine = true,
                                shape = RoundedCornerShape(16.dp),
                                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                                keyboardActions = KeyboardActions(onDone = {
                                    focus.clearFocus()
                                    if (canLogin(state)) viewModel.login(onLoggedIn)
                                }),
                                trailingIcon = {
                                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                        Icon(
                                            imageVector = if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
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
                                onClick = { viewModel.login(onLoggedIn) },
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
                                    Text(
                                        "LOG IN",
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = FontWeight.SemiBold,
                                        letterSpacing = 2.sp,
                                    )
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

/**
 * The band across the middle. Solid and high-contrast (the inverse surface), like the web's white band with
 * dark type, with the wordmark's accent taken from the inverse-primary role made for exactly this ground.
 */
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
        // Tapping re-checks — the same affordance as before, now wearing the web's costume.
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
