package com.brainlessmusic.app.ui.setup

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.text.format.Formatter
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.local.ColorTheme
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.data.local.ThemeMode
import com.brainlessmusic.app.ui.common.segmentShape
import com.brainlessmusic.app.ui.settings.ColorThemeTile
import com.brainlessmusic.app.ui.settings.SettingsViewModel
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.cardShape
import com.brainlessmusic.app.ui.theme.isDark
import com.brainlessmusic.app.ui.theme.supportsMaterialYou

private const val STEPS = 5

/** The colours each game skin was made with (A116, A127, A131, and Magenta for Hit circle). */
private fun Skin.pairedColors(): ColorTheme? = when (this) {
    Skin.STANDARD -> null
    Skin.HIT_CIRCLE -> ColorTheme.MAGENTA
    Skin.LANE -> ColorTheme.LAVENDER
    Skin.GEAR -> ColorTheme.VOLTAGE
    Skin.RING -> ColorTheme.CANDY
}

/**
 * The first-run setup (A139): after the first sign-in on a phone, once. What the app is, then the look (light or
 * dark, skin, colours; the app restyles as you pick), then three playback switches, then done, which plays the
 * welcome in the chosen skin. Each choice is saved the moment it's made, through the same settings as Settings, so
 * skipping keeps whatever was picked so far.
 */
@Composable
fun SetupScreen(onDone: () -> Unit, viewModel: SettingsViewModel = hiltViewModel()) {
    var step by rememberSaveable { mutableIntStateOf(0) }
    BackHandler(enabled = step > 0) { step-- }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.safeDrawingPadding()) {
            StepDots(step, Modifier.padding(start = 24.dp, top = 20.dp))
            AnimatedContent(
                targetState = step,
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "setupStep",
                modifier = Modifier.weight(1f),
            ) { shown ->
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 24.dp, vertical = 16.dp),
                ) {
                    when (shown) {
                        0 -> AboutStep()
                        1 -> LookStep(viewModel)
                        2 -> PlaybackStep(viewModel)
                        3 -> PermissionsStep()
                        else -> DoneStep()
                    }
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                if (step < STEPS - 1) {
                    TextButton(onClick = onDone) { Text("Skip setup") }
                }
                Spacer(Modifier.weight(1f))
                Button(onClick = { if (step < STEPS - 1) step++ else onDone() }) {
                    Text(if (step < STEPS - 1) "Next" else "Start listening")
                }
            }
        }
    }
}

@Composable
private fun StepDots(step: Int, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(STEPS) { i ->
            Box(
                Modifier
                    .size(width = if (i == step) 20.dp else 8.dp, height = 8.dp)
                    .background(if (i <= step) scheme.primary else scheme.outlineVariant, CircleShape),
            )
        }
        Text(
            "${step + 1} of $STEPS",
            style = MaterialTheme.typography.labelMedium,
            color = scheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

@Composable
private fun StepTitle(title: String, detail: String) {
    Text(title, style = MaterialTheme.typography.headlineSmall)
    Text(
        detail,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 6.dp, bottom = 20.dp),
    )
}

@Composable
private fun AboutStep() {
    StepTitle("Your music, from your server", "A player for the library on your own server, for you and a few friends.")
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Feature(AppIcons.library, "Your library", "Every song on the server, by song, album and artist.")
        Feature(AppIcons.downloads, "Downloads", "Keep songs on the phone for when there's no signal.")
        Feature(AppIcons.groups, "Listen together", "Open a room and friends hear the same song at the same time. Anyone in it can skip.")
        Feature(AppIcons.palette, "Skins", "Dress the whole app as a rhythm game, or keep it plain. Next step.")
    }
}

@Composable
private fun Feature(icon: ImageVector, title: String, detail: String) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 2.dp).size(24.dp))
        Column(Modifier.padding(start = 16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun LookStep(viewModel: SettingsViewModel) {
    val themeMode by viewModel.themeMode.collectAsStateWithLifecycle()
    val skin by viewModel.skin.collectAsStateWithLifecycle()
    val colorTheme by viewModel.colorTheme.collectAsStateWithLifecycle()

    StepTitle("How it looks", "The app changes as you pick. All of it is in Settings → Appearance later.")

    Label("Light or dark")
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        ThemeMode.entries.forEachIndexed { index, mode ->
            SegmentedButton(
                selected = mode == themeMode,
                onClick = { viewModel.setThemeMode(mode) },
                shape = segmentShape(index, ThemeMode.entries.size),
            ) { Text(mode.label) }
        }
    }

    Label("Skin", Modifier.padding(top = 24.dp))
    Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Skin.entries.forEach { option ->
            Surface(
                shape = MaterialTheme.cardShape,
                color = MaterialTheme.colorScheme.surfaceContainer,
                border = BorderStroke(
                    if (option == skin) 2.dp else 1.dp,
                    if (option == skin) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                ),
                modifier = Modifier.fillMaxWidth().selectable(
                    selected = option == skin,
                    role = Role.RadioButton,
                    onClick = {
                        viewModel.setSkin(option)
                        // A game skin brings its own colours along; they can still be changed just below.
                        option.pairedColors()?.let(viewModel::setColorTheme)
                    },
                ),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(12.dp)) {
                    RadioButton(selected = option == skin, onClick = null)
                    Column(Modifier.padding(start = 12.dp)) {
                        Text(option.label, style = MaterialTheme.typography.titleSmall)
                        Text(option.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }

    Label("Colours", Modifier.padding(top = 24.dp))
    val themes = ColorTheme.entries.filter { it != ColorTheme.MATERIAL_YOU || supportsMaterialYou }
    Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        themes.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { theme ->
                    ColorThemeTile(
                        theme = theme,
                        darkTheme = themeMode.isDark(),
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

@Composable
private fun Label(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleMedium, modifier = modifier.padding(bottom = 10.dp))
}

@Composable
private fun PlaybackStep(viewModel: SettingsViewModel) {
    val transitions by viewModel.transitions.collectAsStateWithLifecycle()
    val autoPlay by viewModel.autoPlayOnResume.collectAsStateWithLifecycle()
    val dataSaver by viewModel.dataSaver.collectAsStateWithLifecycle()

    StepTitle("How it plays", "Three you might want now. Fades, gapless albums and the rest are in Settings → Playback.")
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SetupSwitch("Volume levelling", "Every song plays at about the same loudness.", transitions.levelVolume, viewModel::setLevelVolume)
        SetupSwitch(
            "Auto-play on resume",
            "Opening the app carries on playing where you left off. Off, it waits paused for you to tap play.",
            autoPlay,
            viewModel::setAutoPlayOnResume,
        )
        SetupSwitch("Data saver", "Songs stream as 64 kbps copies instead of the original files: far less data, a little less sound. Worth it on mobile data.", dataSaver, viewModel::setDataSaver)
    }
}

@Composable
private fun SetupSwitch(title: String, detail: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().toggleable(value = checked, role = Role.Switch, onValueChange = onChange),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(16.dp)) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.width(12.dp))
            Switch(checked = checked, onCheckedChange = null)
        }
    }
}

/**
 * What the app may use (owner, 2026-10-12). Notifications are the one runtime permission it asks for; storage needs
 * none, since downloads live in the app's own files, so that row says so and shows the room left; installing updates
 * is a per-app setting the update sheet needs. States are read again on return from Android's settings.
 */
@Composable
private fun PermissionsStep() {
    val context = LocalContext.current
    fun notificationsAllowed() = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    fun installsAllowed() = context.packageManager.canRequestPackageInstalls()

    var notifications by remember { mutableStateOf(notificationsAllowed()) }
    var installs by remember { mutableStateOf(installsAllowed()) }
    // Once refused, Android may not show its prompt again, so a second tap goes to the app's notification settings.
    var refused by rememberSaveable { mutableStateOf(false) }
    LifecycleResumeEffect(Unit) {
        notifications = notificationsAllowed()
        installs = installsAllowed()
        onPauseOrDispose { }
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        notifications = granted
        if (!granted) refused = true
    }
    val free = remember { Formatter.formatShortFileSize(context, context.filesDir.usableSpace) }

    StepTitle("What it can use", "Both are optional, and both can be changed later in Android's settings for the app.")
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PermissionRow(
            AppIcons.playCircle,
            "Notifications",
            "Play, pause and skip from the notification shade and the lock screen, and see downloads as they run.",
            allowed = notifications,
        ) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !refused) {
                ask.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                context.startActivity(
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
                )
            }
        }
        PermissionRow(
            AppIcons.downloads,
            "Storage",
            "Nothing to allow: downloads are kept in the app's own space, which other apps can't see. $free free on this phone.",
            allowed = null,
        )
        PermissionRow(
            AppIcons.update,
            "Install updates",
            "Lets the update sheet install a new version itself. Android opens a page with one switch to turn on.",
            allowed = installs,
        ) {
            context.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")),
            )
        }
    }
}

/** One thing the app may use: [allowed] null means there is nothing to ask for. */
@Composable
private fun PermissionRow(icon: ImageVector, title: String, detail: String, allowed: Boolean?, onAllow: () -> Unit = {}) {
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(16.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
            Column(Modifier.padding(horizontal = 16.dp).weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            when (allowed) {
                null -> Unit
                true -> Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(AppIcons.check, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                    Text("Allowed", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = 4.dp))
                }
                false -> OutlinedButton(onClick = onAllow) { Text("Allow") }
            }
        }
    }
}

@Composable
private fun DoneStep() {
    StepTitle("All set", "Everything here can be changed in Settings whenever you like.")
    Text(
        "Tap Start listening and the app opens on Home.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
