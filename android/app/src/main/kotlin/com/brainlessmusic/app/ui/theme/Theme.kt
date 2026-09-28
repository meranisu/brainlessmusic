package com.brainlessmusic.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// Dark-first, matching the web app's own dark-by-default design — a light
// scheme exists for the system setting but isn't the app's primary identity.
private val DarkColors = darkColorScheme(
    primary = Orange500,
    onPrimary = Navy900,
    secondary = Orange400,
    background = Navy900,
    onBackground = Slate200,
    surface = Navy800,
    onSurface = Slate200,
    surfaceVariant = Navy700,
    onSurfaceVariant = Slate200,
    error = Red400,
)

private val LightColors = lightColorScheme(
    primary = Orange500,
    onPrimary = Navy900,
    secondary = Orange400,
    background = Slate200,
    onBackground = Navy900,
    surface = Color(0xFFFFFFFF),
    onSurface = Navy900,
)

/**
 * Material You: on Android 12+ (API 31), the color scheme is derived from
 * the device wallpaper via [dynamicDarkColorScheme]/[dynamicLightColorScheme]
 * rather than this app's own navy/orange palette — the whole point of
 * dynamic color is that it isn't a fixed brand identity. Devices below API
 * 31 have no wallpaper-extraction API at all, so they keep the static
 * [DarkColors]/[LightColors] scheme unconditionally; `dynamicColor` exists
 * as an opt-out for anyone who wants the brand palette even on 12+.
 */
@Composable
fun BrainlessMusicTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val supportsDynamicColor = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val context = LocalContext.current

    val colorScheme = when {
        dynamicColor && supportsDynamicColor && darkTheme -> dynamicDarkColorScheme(context)
        dynamicColor && supportsDynamicColor && !darkTheme -> dynamicLightColorScheme(context)
        darkTheme -> DarkColors
        else -> LightColors
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
