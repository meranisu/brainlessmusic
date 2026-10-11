package com.brainlessmusic.app.ui.settings

import com.brainlessmusic.app.ui.downloads.DownloadSettings
import com.brainlessmusic.app.ui.downloads.downloadSummary
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.BuildConfig
import com.brainlessmusic.app.data.local.BetweenSongs
import com.brainlessmusic.app.data.local.ColorTheme
import com.brainlessmusic.app.data.local.FADE_LENGTHS
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.local.ThemeMode
import com.brainlessmusic.app.ui.navigation.AppBottomBar
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.playback.SeekBar
import com.brainlessmusic.app.ui.theme.accentInk
import com.brainlessmusic.app.ui.theme.previewColorScheme
import com.brainlessmusic.app.ui.theme.supportsMaterialYou
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Settings is the borderless exception to DESIGN.md's outlines (A92): flat fills, no stroke, no shadow.
private val CardShape = RoundedCornerShape(20.dp)
private val TileShape = RoundedCornerShape(14.dp)
private val RowShape = RoundedCornerShape(12.dp)
private const val CursorFlashMs = 120L

/** The pages under Settings, each its own screen off the list. */
enum class SettingsPage(val route: String, val title: String) {
    APPEARANCE("appearance", "Appearance"),
    PLAYBACK("playback", "Playback"),
    DOWNLOADS("downloads", "Downloads"),
    ACCOUNT("account", "Account"),
}

/** The Settings tab: one row per page, then the build. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavHostController,
    onOpenPage: (SettingsPage) -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val themeMode by viewModel.themeMode.collectAsStateWithLifecycle()
    val colorTheme by viewModel.colorTheme.collectAsStateWithLifecycle()
    val username by viewModel.username.collectAsStateWithLifecycle()
    val transitions by viewModel.transitions.collectAsStateWithLifecycle()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Settings") }) },
        bottomBar = { AppBottomBar(navController) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            // An options menu, not a card: the rows sit straight on the ground (A92).
            Column {
                PageRow(
                    title = SettingsPage.APPEARANCE.title,
                    value = "${themeMode.label} · ${colorTheme.label}",
                    onClick = { onOpenPage(SettingsPage.APPEARANCE) },
                )
                Divider()
                PageRow(
                    title = SettingsPage.PLAYBACK.title,
                    value = transitions.betweenSongs.label,
                    onClick = { onOpenPage(SettingsPage.PLAYBACK) },
                )
                Divider()
                PageRow(
                    title = SettingsPage.DOWNLOADS.title,
                    value = downloadSummary(),
                    onClick = { onOpenPage(SettingsPage.DOWNLOADS) },
                )
                Divider()
                PageRow(
                    title = SettingsPage.ACCOUNT.title,
                    value = if (viewModel.isGuest) "Guest" else username ?: "Logged in",
                    onClick = { onOpenPage(SettingsPage.ACCOUNT) },
                )
            }

            // Which build this is, for when something needs reporting.
            Text(
                "brainlessmusic ${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            )
        }
    }
}

/** One page under Settings: a back arrow, its settings on one filled card, and the mini player. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsPageScreen(
    page: SettingsPage,
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    onLoggedOut: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val autoPlay by viewModel.autoPlayOnResume.collectAsStateWithLifecycle()
    val keepPlaying by viewModel.keepPlayingWhenSwipedAway.collectAsStateWithLifecycle()
    val keepShuffle by viewModel.keepShuffle.collectAsStateWithLifecycle()
    val dataSaver by viewModel.dataSaver.collectAsStateWithLifecycle()
    val transitions by viewModel.transitions.collectAsStateWithLifecycle()
    val lessOftenReset by viewModel.lessOftenReset.collectAsStateWithLifecycle()
    val themeMode by viewModel.themeMode.collectAsStateWithLifecycle()
    val colorTheme by viewModel.colorTheme.collectAsStateWithLifecycle()
    val seekStyle by viewModel.seekStyle.collectAsStateWithLifecycle()
    val username by viewModel.username.collectAsStateWithLifecycle()
    val displayName by viewModel.displayName.collectAsStateWithLifecycle()
    val renameResult by viewModel.renameResult.collectAsStateWithLifecycle()
    val isRenaming by viewModel.isRenaming.collectAsStateWithLifecycle()
    var confirmingGuestLogout by remember { mutableStateOf(false) }
    val darkTheme = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }

    if (confirmingGuestLogout) {
        AlertDialog(
            onDismissRequest = { confirmingGuestLogout = false },
            title = { Text("Leave as guest?") },
            text = {
                Text(
                    "This phone forgets this guest. If you came in with a guest code, you can use it to get back in; " +
                        "without one, this guest is gone.",
                )
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
        topBar = {
            TopAppBar(
                title = { Text(page.title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            Card(darkTheme) {
                when (page) {
                    SettingsPage.APPEARANCE -> {
                        Block(title = "Light or dark") {
                            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                                ThemeMode.entries.forEachIndexed { index, mode ->
                                    SegmentedButton(
                                        selected = mode == themeMode,
                                        onClick = { viewModel.setThemeMode(mode) },
                                        shape = SegmentedButtonDefaults.itemShape(index, ThemeMode.entries.size),
                                    ) { Text(mode.label) }
                                }
                            }
                        }
                        Divider()
                        Block(title = "Colours", detail = "Saved on this phone.") {
                            val themes = ColorTheme.entries.filter { it != ColorTheme.MATERIAL_YOU || supportsMaterialYou }
                            Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                themes.chunked(2).forEach { pair ->
                                    // Same height per row, so a two-line name doesn't leave its neighbour short.
                                    Row(
                                        modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        pair.forEach { theme ->
                                            ColorThemeTile(
                                                theme = theme,
                                                darkTheme = darkTheme,
                                                selected = theme == colorTheme,
                                                onClick = { viewModel.setColorTheme(theme) },
                                                modifier = Modifier.weight(1f).fillMaxHeight(),
                                            )
                                        }
                                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                        Divider()
                        Block(title = "Progress bar", detail = "How the seek bar looks on the Now Playing screen.") {
                            Column(Modifier.selectableGroup()) {
                                SeekStyle.entries.forEach { style ->
                                    SeekStyleOption(style, selected = style == seekStyle, onClick = { viewModel.setSeekStyle(style) })
                                }
                            }
                        }
                    }
                    SettingsPage.DOWNLOADS -> DownloadSettings(
                        block = { title, detail, content -> Block(title, detail, content) },
                        divider = { Divider() },
                    )
                    SettingsPage.PLAYBACK -> {
                        SwitchRow(
                            title = "Auto-play on resume",
                            detail = if (autoPlay) {
                                "Opening the app carries on playing where you left off."
                            } else {
                                "Opening the app queues where you left off, paused. Tap play to continue."
                            },
                            checked = autoPlay,
                            onCheckedChange = viewModel::setAutoPlayOnResume,
                        )
                        Divider()
                        SwitchRow(
                            title = "Keep playing when swiped away",
                            detail = if (keepPlaying) {
                                "Closing the app from recent apps leaves the music on. Pause from the notification to stop."
                            } else {
                                "Closing the app from recent apps stops the music."
                            },
                            checked = keepPlaying,
                            onCheckedChange = viewModel::setKeepPlayingWhenSwipedAway,
                        )
                        Divider()
                        SwitchRow(
                            title = "Keep shuffle",
                            detail = if (keepShuffle) {
                                "Tapping a song keeps shuffle on if it was on."
                            } else {
                                "Tapping a song plays in order. The shuffle buttons still turn shuffle on."
                            },
                            checked = keepShuffle,
                            onCheckedChange = viewModel::setKeepShuffle,
                        )
                        Divider()
                        SwitchRow(
                            title = "Data saver",
                            detail = if (dataSaver) {
                                "Songs stream as 64 kbps copies, a fraction of the original size. The song playing now finishes as it started."
                            } else {
                                "Songs stream as the original files. Turn this on for mobile data."
                            },
                            checked = dataSaver,
                            onCheckedChange = viewModel::setDataSaver,
                        )
                        Divider()
                        // One choice of three, so they rule each other out (A71).
                        Block(title = "Between songs", detail = "Saved on this phone.") {
                            Column(Modifier.selectableGroup()) {
                                BetweenSongs.entries.forEach { option ->
                                    BetweenSongsOption(
                                        option,
                                        selected = option == transitions.betweenSongs,
                                        onClick = { viewModel.setBetweenSongs(option) },
                                    )
                                }
                            }
                            if (transitions.betweenSongs != BetweenSongs.GAPLESS) {
                                Text(
                                    "Fade length",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                                    FADE_LENGTHS.forEachIndexed { index, seconds ->
                                        SegmentedButton(
                                            selected = seconds == transitions.fadeSeconds,
                                            onClick = { viewModel.setFadeSeconds(seconds) },
                                            shape = SegmentedButtonDefaults.itemShape(index, FADE_LENGTHS.size),
                                        ) { Text("$seconds s") }
                                    }
                                }
                            }
                        }
                        if (transitions.betweenSongs != BetweenSongs.GAPLESS) {
                            Divider()
                            SwitchRow(
                                title = "Keep albums gapless",
                                detail = "No fade between tracks of one album played in order, so live albums and mixes stay seamless.",
                                checked = transitions.keepAlbumsGapless,
                                onCheckedChange = viewModel::setKeepAlbumsGapless,
                            )
                        }
                        Divider()
                        SwitchRow(
                            title = "Fade on pause and skip",
                            detail = "A quick fade instead of a hard stop.",
                            checked = transitions.fadeOnPause,
                            onCheckedChange = viewModel::setFadeOnPause,
                        )
                        // Guests can't mark songs, so there is nothing to reset.
                        if (!viewModel.isGuest) {
                            Divider()
                            Block(
                                title = "Songs you hear less",
                                detail = when (lessOftenReset) {
                                    true -> "Done. Every song is back in shuffle as normal."
                                    false -> "Couldn't reach the server. Try again."
                                    null -> "Swipe a song right in the queue to hear it less. This puts them all back to normal."
                                },
                            ) {
                                FilledTonalButton(
                                    onClick = viewModel::resetLessOften,
                                    enabled = lessOftenReset != true,
                                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                                ) { Text("Reset") }
                            }
                        }
                    }
                    SettingsPage.ACCOUNT -> {
                        Block(
                            title = displayName ?: username ?: if (viewModel.isGuest) "Guest" else "Logged in",
                            detail = if (viewModel.isGuest) {
                                "Listening as a guest. If you came in with a guest code, type it on another device to listen there as the same guest."
                            } else {
                                "Logged in on this phone as ${username ?: "this account"}."
                            },
                        ) {
                            FilledTonalButton(
                                onClick = { if (viewModel.isGuest) confirmingGuestLogout = true else viewModel.logout(onLoggedOut) },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                            ) {
                                Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
                                Text("Log out", modifier = Modifier.padding(start = 8.dp))
                            }
                        }
                        Divider()
                        // Keyed on the saved name, so the field resets to it after a save or a sign-in elsewhere.
                        key(displayName) {
                            var nameField by remember { mutableStateOf(displayName ?: "") }
                            Block(title = "Your name", detail = "Shown when you sign in, and to the admin. Clear it and save to go back to the default.") {
                                OutlinedTextField(
                                    value = nameField,
                                    onValueChange = { nameField = it.take(32) },
                                    singleLine = true,
                                    label = { Text("Name") },
                                    supportingText = renameResult?.let { { Text(it) } },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                FilledTonalButton(
                                    onClick = { viewModel.rename(nameField) },
                                    enabled = !isRenaming && nameField.trim() != (displayName ?: ""),
                                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                                ) { Text(if (isRenaming) "Saving…" else "Save name") }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * A row on the Settings list that opens a page, laid out like an arcade options screen: the page name large on the
 * left, what's set now on the right. Pressed or focused, the row fills with the accent, like the select screen's cursor.
 * A quick tap in a scrolling column never shows as pressed (the press is delayed, then released at once), so a tap
 * holds the fill for [CursorFlashMs] before the page opens (Q95).
 */
@Composable
private fun PageRow(title: String, value: String, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val focused by interaction.collectIsFocusedAsState()
    var flashing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val lit = pressed || focused || flashing
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .background(if (lit) scheme.primary else Color.Transparent, RowShape)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, enabled = !flashing) {
                flashing = true
                scope.launch {
                    delay(CursorFlashMs)
                    onClick()
                    flashing = false
                }
            }
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(
            title,
            style = MaterialTheme.typography.headlineSmall,
            color = if (lit) scheme.onPrimary else scheme.onSurface,
        )
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = if (lit) scheme.onPrimary else MaterialTheme.accentInk,
            textAlign = TextAlign.End,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(start = 16.dp),
        )
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = if (lit) scheme.onPrimary else scheme.onSurfaceVariant,
        )
    }
}

/**
 * Settings on one filled card. The fill alone sets it off from the ground; no outline (A92).
 *
 * In the dark, `surfaceContainer` sits 1.07-1.43:1 off the ground, too faint without an outline (Q95), so the card
 * takes the next step up. Everything inside that would share that fill (tonal buttons, switch tracks, colour tiles,
 * dividers) is moved to the ground instead, reading as cut into the card. Light keeps `surfaceContainer`: it is
 * already white, the brightest the palette has.
 */
@Composable
private fun Card(darkTheme: Boolean, content: @Composable ColumnScope.() -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val fill = if (darkTheme) scheme.surfaceContainerHighest else scheme.surfaceContainer
    val inside = if (darkTheme) {
        scheme.copy(
            surfaceContainerHighest = scheme.background,
            secondaryContainer = scheme.background,
            outlineVariant = scheme.background,
        )
    } else {
        scheme
    }
    Surface(
        shape = CardShape,
        color = fill,
        modifier = Modifier.fillMaxWidth(),
    ) {
        MaterialTheme(colorScheme = inside, typography = MaterialTheme.typography) {
            Column(content = content)
        }
    }
}

/** One setting inside a card: its name, an optional line about it, then the control. */
@Composable
private fun Block(title: String, detail: String? = null, content: @Composable () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (detail != null) {
                Text(detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        content()
    }
}

/** The whole row toggles, for a 48 dp target. */
@Composable
private fun SwitchRow(title: String, detail: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .toggleable(value = checked, role = Role.Switch, onValueChange = onCheckedChange)
            .padding(16.dp),
    ) {
        Column(Modifier.weight(1f).padding(end = 16.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(
                detail,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Composable
private fun Divider() {
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

/**
 * One colour theme: a swatch of its ground and accent as they'd look in the current light or dark setting, the name,
 * and what it's after. Picked fills with the accent and shows a check, so it isn't told by colour alone.
 */
@Composable
private fun ColorThemeTile(
    theme: ColorTheme,
    darkTheme: Boolean,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val preview = previewColorScheme(theme, darkTheme)
    val ink = if (selected) scheme.onPrimary else scheme.onSurface
    val inkVariant = if (selected) scheme.onPrimary else scheme.onSurfaceVariant
    Surface(
        shape = TileShape,
        color = if (selected) scheme.primary else scheme.surfaceContainerHighest,
        modifier = modifier.selectable(selected = selected, role = Role.RadioButton, onClick = onClick),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.heightIn(min = 64.dp).padding(horizontal = 10.dp, vertical = 10.dp),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(32.dp)
                    .background(preview.background, CircleShape)
                    .border(1.dp, preview.outline, CircleShape),
            ) {
                Box(Modifier.size(12.dp).background(preview.primary, CircleShape))
            }
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                Text(theme.label, style = MaterialTheme.typography.bodyMedium, color = ink)
                Text(theme.detail, style = MaterialTheme.typography.bodySmall, color = inkVariant)
            }
            if (selected) {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = scheme.onPrimary,
                    modifier = Modifier.padding(start = 4.dp).size(20.dp),
                )
            }
        }
    }
}

/** One "Between songs" choice: a radio, the name, and what it sounds like. */
@Composable
private fun BetweenSongsOption(option: BetweenSongs, selected: Boolean, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(vertical = 4.dp),
    ) {
        RadioButton(selected = selected, onClick = null)
        Column(modifier = Modifier.padding(start = 12.dp)) {
            Text(option.label, style = MaterialTheme.typography.bodyMedium)
            Text(
                option.detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
            .heightIn(min = 56.dp)
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
