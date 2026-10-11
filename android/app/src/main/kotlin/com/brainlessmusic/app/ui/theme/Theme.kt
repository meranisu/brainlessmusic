package com.brainlessmusic.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import com.brainlessmusic.app.data.local.ColorTheme
import com.brainlessmusic.app.data.local.ThemeMode

// Dark-first, like the web app. Every surface role is set, so Material derives no shades of its own, and the tint is
// off: elevation is a border, never a lighter fill (DESIGN.md, "Flat and solid").
private fun Palette.darkScheme(): ColorScheme = darkColorScheme(
    primary = accent,
    onPrimary = blue950,
    primaryContainer = accent,
    onPrimaryContainer = blue950,
    inversePrimary = accentOnBand,
    secondary = blue400,
    onSecondary = blue950,
    secondaryContainer = blue800,
    onSecondaryContainer = white,
    tertiary = blue300,
    onTertiary = blue950,
    background = blue950,
    onBackground = white,
    surface = blue950,
    onSurface = white,
    surfaceVariant = blue900,
    onSurfaceVariant = blue300,
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = ground,
    surfaceContainerLow = blue950,
    surfaceContainer = blue900,
    surfaceContainerHigh = blue900,
    surfaceContainerHighest = blue800,
    inverseSurface = blue100,
    inverseOnSurface = blue950,
    outline = blue700,
    outlineVariant = blue800,
    error = dangerDark,
    onError = blue950,
)

// For the system light setting: the same scale read from the pale end, with the accent darkened to clear 4.5:1.
private fun Palette.lightScheme(): ColorScheme = lightColorScheme(
    primary = accentOnLight,
    onPrimary = white,
    primaryContainer = accent,
    onPrimaryContainer = blue950,
    inversePrimary = accent,
    secondary = blue800,
    onSecondary = white,
    secondaryContainer = blue100,
    onSecondaryContainer = blue950,
    tertiary = blue700,
    onTertiary = white,
    background = blue100,
    onBackground = blue950,
    surface = blue100,
    onSurface = blue950,
    surfaceVariant = white,
    onSurfaceVariant = blue900,
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = white,
    surfaceContainerLow = white,
    surfaceContainer = white,
    surfaceContainerHigh = white,
    surfaceContainerHighest = blue100,
    inverseSurface = blue950,
    inverseOnSurface = blue100,
    outline = blue700,
    outlineVariant = blue300,
    error = dangerLight,
    onError = white,
)

/** The scheme [theme] would use in [darkTheme], for previews such as the Settings swatches. Same rules as the app's. */
/** Whether this setting paints the app dark right now. The one rule, so Settings' previews match the app. */
@Composable
@ReadOnlyComposable
fun ThemeMode.isDark(): Boolean = when (this) {
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
    ThemeMode.LIGHT -> false
    ThemeMode.DARK -> true
}

@Composable
fun previewColorScheme(theme: ColorTheme, darkTheme: Boolean): ColorScheme {
    val context = LocalContext.current
    val dynamicColor = theme == ColorTheme.MATERIAL_YOU && supportsMaterialYou
    return when {
        dynamicColor && darkTheme -> dynamicDarkColorScheme(context)
        dynamicColor -> dynamicLightColorScheme(context)
        darkTheme -> theme.palette().darkScheme()
        else -> theme.palette().lightScheme()
    }
}

private val LocalAccentInk = staticCompositionLocalOf { Color.Unspecified }

/** Accent for text on a card (`surfaceContainer`). `primary` is for fills, icons and text on the ground. */
val MaterialTheme.accentInk: Color
    @Composable @ReadOnlyComposable get() = LocalAccentInk.current

/** Whether this phone can take colours from the wallpaper (Material You, Android 12+). */
val supportsMaterialYou: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

/** Whether the app is dark, by its own setting rather than the phone's. */
val LocalDarkTheme = staticCompositionLocalOf { false }

/**
 * Call first inside a `ModalBottomSheet`. Its window takes status bar icons from the phone's dark setting, so with the
 * app dark and the phone light, a fully open sheet turned the icons black. This sets them from the app's instead.
 */
@Composable
fun SheetStatusBarFollowsApp() {
    val window = (LocalView.current.parent as? DialogWindowProvider)?.window ?: return
    val dark = LocalDarkTheme.current
    SideEffect { WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = !dark }
}

/** The brand palette by default (A36). [ColorTheme.MATERIAL_YOU] takes the wallpaper's scheme on Android 12+. */
@Composable
fun BrainlessMusicTheme(
    colorTheme: ColorTheme = ColorTheme.DEEP_BLUE,
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val dynamicColor = colorTheme == ColorTheme.MATERIAL_YOU && supportsMaterialYou

    val colorScheme = when {
        dynamicColor && darkTheme -> dynamicDarkColorScheme(context)
        dynamicColor -> dynamicLightColorScheme(context)
        darkTheme -> colorTheme.palette().darkScheme()
        else -> colorTheme.palette().lightScheme()
    }

    val accentInk = when {
        dynamicColor -> colorScheme.primary
        darkTheme -> colorTheme.palette().accentInk
        else -> colorTheme.palette().accentOnLight
    }

    CompositionLocalProvider(LocalAccentInk provides accentInk, LocalDarkTheme provides darkTheme) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content,
        )
    }
}
