package com.brainlessmusic.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.data.local.ColorTheme
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.local.ThemeMode
import com.brainlessmusic.app.ui.navigation.AppBottomBar
import com.brainlessmusic.app.ui.playback.SeekBar
import com.brainlessmusic.app.ui.theme.palette
import com.brainlessmusic.app.ui.theme.supportsMaterialYou

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavHostController,
    onLoggedOut: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val autoPlay by viewModel.autoPlayOnResume.collectAsStateWithLifecycle()
    val themeMode by viewModel.themeMode.collectAsStateWithLifecycle()
    val colorTheme by viewModel.colorTheme.collectAsStateWithLifecycle()
    val seekStyle by viewModel.seekStyle.collectAsStateWithLifecycle()
    var confirmingGuestLogout by remember { mutableStateOf(false) }

    if (confirmingGuestLogout) {
        AlertDialog(
            onDismissRequest = { confirmingGuestLogout = false },
            title = { Text("Leave as guest?") },
            text = {
                Text("This phone forgets this guest, including where you left off. Getting back in may need a new guest code.")
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingGuestLogout = false
                    viewModel.logout(onLoggedOut)
                }) { Text("Leave") }
            },
            dismissButton = {
                TextButton(onClick = { confirmingGuestLogout = false }) { Text("Stay") }
            },
        )
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Settings") }) },
        bottomBar = { AppBottomBar(navController) },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).verticalScroll(rememberScrollState())) {
            ListItem(
                headlineContent = { Text("Colours") },
                supportingContent = {
                    Column(
                        modifier = Modifier.padding(top = 8.dp).selectableGroup(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("The website's six, or your wallpaper's. Saved on this phone.")
                        ColorTheme.entries.filter { it != ColorTheme.MATERIAL_YOU || supportsMaterialYou }.forEach { theme ->
                            ColorThemeOption(theme, selected = theme == colorTheme, onClick = { viewModel.setColorTheme(theme) })
                        }
                    }
                },
            )
            ListItem(
                headlineContent = { Text("Light or dark") },
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
                // The whole row toggles, for a 48 dp target.
                trailingContent = { Switch(checked = autoPlay, onCheckedChange = null) },
                modifier = Modifier
                    .toggleable(value = autoPlay, role = Role.Switch, onValueChange = viewModel::setAutoPlayOnResume),
            )
            OutlinedButton(
                onClick = { if (viewModel.isGuest) confirmingGuestLogout = true else viewModel.logout(onLoggedOut) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp).heightIn(min = 48.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
                Text("Log out", modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}

/** One colour theme, as on the web's Options page: a swatch of its ground and accent, and a border that swaps on pick. */
@Composable
private fun ColorThemeOption(theme: ColorTheme, selected: Boolean, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val (ground, edge, accent) = swatchColors(theme)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) scheme.primary else scheme.outlineVariant,
                shape = RoundedCornerShape(8.dp),
            )
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(ground)
                .border(1.dp, edge, RoundedCornerShape(6.dp)),
        ) {
            Box(Modifier.size(14.dp).clip(CircleShape).background(accent))
        }
        Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
            Text(theme.label, style = MaterialTheme.typography.bodyLarge, color = scheme.onSurface)
            Text(theme.detail, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        }
        RadioButton(selected = selected, onClick = null)
    }
}

/** Ground, edge and accent for a swatch. Material You shows this phone's wallpaper colours, the rest their dark ground. */
@Composable
private fun swatchColors(theme: ColorTheme): Triple<Color, Color, Color> {
    if (theme == ColorTheme.MATERIAL_YOU && supportsMaterialYou) {
        val dynamic = dynamicDarkColorScheme(LocalContext.current)
        return Triple(dynamic.surface, dynamic.outline, dynamic.primary)
    }
    val palette = theme.palette()
    return Triple(palette.blue950, palette.blue700, palette.accent)
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
