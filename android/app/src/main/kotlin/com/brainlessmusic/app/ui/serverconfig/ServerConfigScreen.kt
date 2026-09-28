package com.brainlessmusic.app.ui.serverconfig

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * The server's light: green once `/health` answers, red with the reason when it doesn't, grey while
 * checking. Tapping it (or Retry) checks again. Green is a fixed status color rather than a theme
 * role — Material You has no "success" role, and a dynamic scheme could turn it any hue.
 */
@Composable
private fun ServerStatus(host: String, check: ConnectionCheck, error: String?, onRetry: () -> Unit) {
    val color = when (check) {
        ConnectionCheck.SUCCESS -> Color(0xFF2E9E4F)
        ConnectionCheck.FAILED -> MaterialTheme.colorScheme.error
        ConnectionCheck.IDLE, ConnectionCheck.CHECKING -> MaterialTheme.colorScheme.outline
    }
    val label = when (check) {
        ConnectionCheck.SUCCESS -> "Server online"
        ConnectionCheck.FAILED -> "Server unreachable"
        ConnectionCheck.CHECKING -> "Checking server…"
        ConnectionCheck.IDLE -> "Server"
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = check != ConnectionCheck.CHECKING, onClick = onRetry)
                .padding(vertical = 8.dp),
        ) {
            Box(modifier = Modifier.size(12.dp).background(color, CircleShape))
            Column(modifier = Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.bodyMedium)
                Text(host, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (check == ConnectionCheck.CHECKING) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else if (check == ConnectionCheck.FAILED) {
                TextButton(onClick = onRetry) { Text("Retry") }
            }
        }
        if (check == ConnectionCheck.FAILED && error != null) {
            Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun ServerConfigScreen(
    onLoggedIn: (username: String) -> Unit,
    viewModel: ServerConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var passwordVisible by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(text = "Sign in", style = MaterialTheme.typography.headlineSmall)

        ServerStatus(
            host = state.serverHost,
            check = state.connectionCheck,
            error = state.connectionError,
            onRetry = viewModel::checkServer,
        )

        OutlinedTextField(
            value = state.username,
            onValueChange = viewModel::onUsernameChange,
            label = { Text("Username") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = state.password,
            onValueChange = viewModel::onPasswordChange,
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
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
            Text(text = it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        Button(
            onClick = { viewModel.login(onLoggedIn) },
            enabled = !state.isLoggingIn &&
                state.username.isNotBlank() &&
                state.password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.isLoggingIn) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Text("Log in")
            }
        }
    }
}
