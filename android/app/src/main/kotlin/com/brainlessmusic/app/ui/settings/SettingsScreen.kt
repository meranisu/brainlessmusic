package com.brainlessmusic.app.ui.settings

import com.brainlessmusic.app.ui.splash.Goodbye
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import com.brainlessmusic.app.ui.common.segmentShape
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.BuildConfig
import com.brainlessmusic.app.data.local.BetweenSongs
import com.brainlessmusic.app.data.local.ColorTheme
import com.brainlessmusic.app.data.local.FADE_LENGTHS
import com.brainlessmusic.app.data.local.PlayerButtons
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.local.ThemeMode
import com.brainlessmusic.app.ui.downloads.DownloadSettings
import com.brainlessmusic.app.ui.downloads.downloadSummary
import com.brainlessmusic.app.ui.navigation.TabBarSpace
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.playback.SeekBar
import com.brainlessmusic.app.ui.theme.isDark
import com.brainlessmusic.app.ui.theme.previewColorScheme
import com.brainlessmusic.app.ui.theme.supportsMaterialYou
import com.brainlessmusic.app.ui.update.UpdateViewModel
import com.brainlessmusic.app.update.UpdateState
import androidx.compose.foundation.Image
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.R
import com.brainlessmusic.app.ui.theme.BrandFontFamily
import com.brainlessmusic.app.ui.theme.accentInk
import com.brainlessmusic.app.ui.theme.cardShape
import com.brainlessmusic.app.ui.theme.tileShape
import com.brainlessmusic.app.ui.theme.AppIcons

// Cards here match the Library header: flat, a 1 dp outline, no shadow (DESIGN.md, Android).

/** The pages under Settings, each its own screen off the list. */
enum class SettingsPage(val route: String, val title: String) {
    APPEARANCE("appearance", "Appearance"),
    PLAYBACK("playback", "Playback"),
    DOWNLOADS("downloads", "Downloads"),
    ACCOUNT("account", "Account"),
    WHATS_NEW("whats-new", "What's new"),
    LICENSES("licenses", "Licenses"),
}

/** The Settings tab: one row per page, then the build. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavHostController,
    onOpenPage: (SettingsPage) -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
    updateViewModel: UpdateViewModel = hiltViewModel(),
) {
    val themeMode by viewModel.themeMode.collectAsStateWithLifecycle()
    val colorTheme by viewModel.colorTheme.collectAsStateWithLifecycle()
    val username by viewModel.username.collectAsStateWithLifecycle()
    val update by updateViewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Settings") }) },
        bottomBar = { TabBarSpace() },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Card {
                PageRow(
                    icon = AppIcons.palette,
                    title = SettingsPage.APPEARANCE.title,
                    summary = "${themeMode.label} · ${colorTheme.label}",
                    onClick = { onOpenPage(SettingsPage.APPEARANCE) },
                )
                Divider()
                PageRow(
                    icon = AppIcons.playCircle,
                    title = SettingsPage.PLAYBACK.title,
                    summary = "Resuming, swiping the app away",
                    onClick = { onOpenPage(SettingsPage.PLAYBACK) },
                )
                Divider()
                PageRow(
                    icon = AppIcons.downloads,
                    title = SettingsPage.DOWNLOADS.title,
                    summary = downloadSummary(),
                    onClick = { onOpenPage(SettingsPage.DOWNLOADS) },
                )
                Divider()
                PageRow(
                    icon = AppIcons.account,
                    title = SettingsPage.ACCOUNT.title,
                    summary = if (viewModel.isGuest) "Guest" else username ?: "Logged in",
                    onClick = { onOpenPage(SettingsPage.ACCOUNT) },
                )
            }

            Card {
                // Release builds only: a debug build is a separate app and never takes a release.
                if (updateViewModel.enabled) {
                    PageRow(
                        icon = AppIcons.update,
                        title = "Check for updates",
                        summary = when (val s = update) {
                            UpdateState.Checking -> "Checking…"
                            is UpdateState.UpToDate -> "You're on the latest (v${s.version})"
                            is UpdateState.Available -> "v${s.offer.version} is out"
                            is UpdateState.Downloading -> "Downloading v${s.offer.version}…"
                            is UpdateState.Ready -> "v${s.offer.version} is ready to install"
                            is UpdateState.Failed -> s.message
                            UpdateState.Idle -> "New versions come from GitHub"
                        },
                        onClick = updateViewModel::checkNow,
                    )
                    Divider()
                }
                PageRow(
                    icon = AppIcons.history,
                    title = SettingsPage.WHATS_NEW.title,
                    summary = "What changed in each version",
                    onClick = { onOpenPage(SettingsPage.WHATS_NEW) },
                )
            }

            Card {
                PageRow(
                    icon = AppIcons.info,
                    title = SettingsPage.LICENSES.title,
                    summary = "The app's license, and the fonts, icons and libraries it uses",
                    onClick = { onOpenPage(SettingsPage.LICENSES) },
                )
            }

            AppSignature(onVersionClick = { onOpenPage(SettingsPage.WHATS_NEW) })
        }
    }
}

/**
 * The foot of Settings: the mark and the wordmark in Fredoka, like the login screen's, then which build this is, for
 * when something needs reporting. The mark moved here from the Library title (owner, 2026-10-11).
 */
@Composable
private fun AppSignature(onVersionClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Image(painterResource(R.drawable.ic_logo), contentDescription = null, modifier = Modifier.size(28.dp))
            Text(
                text = buildAnnotatedString {
                    append("brainless")
                    pushStyle(SpanStyle(color = MaterialTheme.accentInk))
                    append("music")
                    pop()
                },
                color = MaterialTheme.colorScheme.onSurface,
                fontFamily = BrandFontFamily,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.4).sp,
                maxLines = 1,
            )
        }
        Text(
            "Version ${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            // Tapping the version opens What's new, like the version on the web's title screen.
            modifier = Modifier
                .padding(top = 2.dp)
                .clickable(onClickLabel = "See what's new", onClick = onVersionClick)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        )
    }
}

/** One page under Settings: a back arrow, its settings on one outlined card, and the mini player. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsPageScreen(
    page: SettingsPage,
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    onOpenLessOften: () -> Unit,
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
    val skin by viewModel.skin.collectAsStateWithLifecycle()
    val playerButtons by viewModel.playerButtons.collectAsStateWithLifecycle()
    val username by viewModel.username.collectAsStateWithLifecycle()
    val displayName by viewModel.displayName.collectAsStateWithLifecycle()
    val renameResult by viewModel.renameResult.collectAsStateWithLifecycle()
    val isRenaming by viewModel.isRenaming.collectAsStateWithLifecycle()
    var confirmingGuestLogout by remember { mutableStateOf(false) }
    val darkTheme = themeMode.isDark()

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
                    Goodbye.play("Guest")
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
                        Icon(AppIcons.back, contentDescription = "Back")
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
            Card {
                when (page) {
                    SettingsPage.APPEARANCE -> {
                        Block(title = "Light or dark") {
                            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                                ThemeMode.entries.forEachIndexed { index, mode ->
                                    SegmentedButton(
                                        selected = mode == themeMode,
                                        onClick = { viewModel.setThemeMode(mode) },
                                        shape = segmentShape(index, ThemeMode.entries.size),
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
                        Block(title = "Skin", detail = "How the whole app is shaped and set, the player included. Colours come from above.") {
                            Column(Modifier.selectableGroup()) {
                                Skin.entries.forEach { option ->
                                    ChoiceOption(option.label, option.detail, selected = option == skin, onClick = { viewModel.setSkin(option) })
                                }
                            }
                        }
                        // A game skin brings its own player; these two only shape Standard's.
                        if (skin == Skin.STANDARD) {
                            Divider()
                            Block(title = "Player buttons", detail = "How the buttons look on the Now Playing screen.") {
                                Column(Modifier.selectableGroup()) {
                                    PlayerButtons.entries.forEach { option ->
                                        ChoiceOption(option.label, option.detail, selected = option == playerButtons, onClick = { viewModel.setPlayerButtons(option) })
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
                                            shape = segmentShape(index, FADE_LENGTHS.size),
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
                        Divider()
                        SwitchRow(
                            title = "Volume levelling",
                            detail = "Every song plays at about the same loudness.",
                            checked = transitions.levelVolume,
                            onCheckedChange = viewModel::setLevelVolume,
                        )
                        // Guests can't mark songs, so there is nothing to reset.
                        if (!viewModel.isGuest) {
                            Divider()
                            Block(
                                title = "Disliked songs",
                                detail = when (lessOftenReset) {
                                    true -> "Done. Nothing is disliked now; every song is back in shuffle as normal."
                                    false -> "Couldn't reach the server. Try again."
                                    null -> "Shuffle picks a disliked song about one pass in four. Reset undislikes them all."
                                },
                            ) {
                                // The list is also in the Library's Playlists tab (A153).
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FilledTonalButton(
                                        onClick = onOpenLessOften,
                                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                                    ) { Text("See songs") }
                                    OutlinedButton(
                                        onClick = viewModel::resetLessOften,
                                        enabled = lessOftenReset != true,
                                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                                    ) { Text("Reset") }
                                }
                            }
                        }
                    }
                    SettingsPage.LICENSES -> LicensesContent()
                    SettingsPage.WHATS_NEW -> WhatsNewContent()
                    SettingsPage.ACCOUNT -> {
                        Block(
                            title = displayName ?: username ?: if (viewModel.isGuest) "Guest" else "Logged in",
                            detail = if (viewModel.isGuest) {
                                "Listening as a guest. If you came in with a guest code, type it on another device to listen there as the same guest."
                            } else {
                                "Logged in on this phone as ${username ?: "this account"}."
                            },
                        ) {
                            OutlinedButton(
                                onClick = {
                                    if (viewModel.isGuest) {
                                        confirmingGuestLogout = true
                                    } else {
                                        // Read now: sign-out clears the name.
                                        Goodbye.play(displayName ?: username ?: "")
                                        viewModel.logout(onLoggedOut)
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                            ) {
                                Icon(AppIcons.logout, contentDescription = null)
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
                                OutlinedButton(
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

/** A row on the Settings list that opens a page: icon, name, what's set now, and a chevron. */
@Composable
private fun PageRow(icon: ImageVector, title: String, summary: String, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .padding(16.dp),
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f).padding(horizontal = 16.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(summary, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(
            AppIcons.arrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Settings on one outlined card. */
@Composable
private fun Card(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(content = content)
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
 * and what it's after. Picked shows a thicker accent border and a check, so it isn't told by colour alone.
 */
@Composable
internal fun ColorThemeTile(
    theme: ColorTheme,
    darkTheme: Boolean,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val preview = previewColorScheme(theme, darkTheme)
    Surface(
        shape = tileShape(14.dp),
        color = scheme.surfaceContainer,
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) scheme.primary else scheme.outlineVariant),
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
                Text(theme.label, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurface)
                Text(theme.detail, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            }
            if (selected) {
                Icon(
                    AppIcons.checkCircle,
                    contentDescription = null,
                    tint = scheme.primary,
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

@Composable
private fun ChoiceOption(label: String, detail: String, selected: Boolean, onClick: () -> Unit) {
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
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
