package com.brainlessmusic.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Phase 0's done-when, made visible: proof the app is connected and logged
 * in. Real content (browsing, playback) is Phase 1+ of
 * `.docs/process/android-phased-plan.md`, not this screen.
 */
@Composable
fun HomeScreen(
    onLoggedOut: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val username by viewModel.username.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Connected as ${username ?: "…"}",
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = "Library browsing and playback aren't built yet — this confirms Phase 0's connection works.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 12.dp, bottom = 24.dp),
        )
        OutlinedButton(onClick = { viewModel.logout(onLoggedOut) }) {
            Text("Log out")
        }
    }
}
