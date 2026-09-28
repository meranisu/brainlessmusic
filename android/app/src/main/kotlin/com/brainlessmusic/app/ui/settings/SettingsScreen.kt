package com.brainlessmusic.app.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.RadioButton
import androidx.compose.ui.Alignment
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.Role
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.local.ThemeMode
import com.brainlessmusic.app.ui.playback.SeekBar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val autoPlay by viewModel.autoPlayOnResume.collectAsStateWithLifecycle()
    val themeMode by viewModel.themeMode.collectAsStateWithLifecycle()
    val seekStyle by viewModel.seekStyle.collectAsStateWithLifecycle()

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
        Column(modifier = Modifier.padding(padding).verticalScroll(rememberScrollState())) {
            ListItem(
                headlineContent = { Text("Theme") },
                supportingContent = {
                    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        ThemeMode.entries.forEachIndexed { index, mode ->
                            SegmentedButton(
                                selected = mode == themeMode,
                                onClick = { viewModel.setThemeMode(mode) },
                                shape = SegmentedButtonDefaults.itemShape(index, ThemeMode.entries.size),
                            ) { Text(mode.label) }
                        }
                    }
                },
            )
            ListItem(
                headlineContent = { Text("Progress bar") },
                supportingContent = {
                    Column {
                        Text("How the seek bar looks on the Now Playing screen.")
                        SeekStyle.entries.forEach { style ->
                            SeekStyleOption(style, selected = style == seekStyle, onClick = { viewModel.setSeekStyle(style) })
                        }
                    }
                },
            )
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
                    .toggleable(value = autoPlay, role = Role.Switch, onValueChange = viewModel::setAutoPlayOnResume),
            )
        }
    }
}

/** One choice in the progress-bar picker, with the bar itself drawn at 40% so the look is visible before picking it. */
@Composable
private fun SeekStyleOption(style: SeekStyle, selected: Boolean, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(vertical = 4.dp),
    ) {
        RadioButton(selected = selected, onClick = null)
        Column(modifier = Modifier.padding(start = 12.dp)) {
            Text(style.label, style = MaterialTheme.typography.bodyMedium)
            SeekBar(
                style = style,
                fraction = 0.4f,
                playing = selected,
                onFraction = {},
                onFinished = {},
                interactive = false,
            )
        }
    }
}
