package com.brainlessmusic.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

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

@Composable
fun BrainlessMusicTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
