package com.brainlessmusic.app.ui.settings

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val autoPlay by viewModel.autoPlayOnResume.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        ListItem(
            headlineContent = { Text("Auto-play on resume") },
            supportingContent = {
                Text(
                    if (autoPlay) {
                        "Opening the app carries on playing where you left off."
                    } else {
                        "Opening the app queues where you left off, paused. Tap play to continue."
                    },
                )
            },
            // The whole row toggles, not just the switch — a 48 dp target instead of a thumb-sized one.
            trailingContent = { Switch(checked = autoPlay, onCheckedChange = null) },
            modifier = Modifier
                .padding(padding)
                .toggleable(value = autoPlay, role = Role.Switch, onValueChange = viewModel::setAutoPlayOnResume),
        )
    }
}
