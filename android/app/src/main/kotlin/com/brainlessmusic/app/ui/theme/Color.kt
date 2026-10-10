package com.brainlessmusic.app.ui.theme

import androidx.compose.ui.graphics.Color
import com.brainlessmusic.app.data.local.ColorTheme

/**
 * One web theme's tokens (`frontend/src/index.css`), converted from OKLCH and clipped to sRGB as the browser renders
 * them. Names are the web's positional scale: `blue950` is the deepest ground in every theme, whatever its hue.
 */
data class Palette(
    val ground: Color,
    val blue950: Color,
    val blue900: Color,
    val blue800: Color,
    val blue700: Color,
    val blue400: Color,
    val blue300: Color,
    val blue100: Color,
    val white: Color,
    /** `orange-600`, the accent. */
    val accent: Color,
    /** `red-300`: danger text on the dark grounds. */
    val dangerDark: Color,
    /** `red-700`: danger text on the light grounds. */
    val dangerLight: Color,
    // Android only, darkened from the accent at its own hue until it clears its ground.
    /** The light scheme's accent: 4.5:1 on `blue100`. */
    val accentOnLight: Color,
    /** The accent on the pale wordmark band: 3:1, large text only. */
    val accentOnBand: Color,
    /** Accent as text on a `blue900` card (the web's `--color-accent-ink`); the accent itself wherever that clears 4.5:1. */
    val accentInk: Color = accent,
)

val DeepBluePalette = Palette(
    ground = Color(0xFF080E28), blue950 = Color(0xFF162456), blue900 = Color(0xFF1C398E), blue800 = Color(0xFF193CB8),
    blue700 = Color(0xFF1447E6), blue400 = Color(0xFF61B2FF), blue300 = Color(0xFF8EC5FF), blue100 = Color(0xFFDBEAFE),
    white = Color(0xFFFFFFFF), accent = Color(0xFFFF5400), dangerDark = Color(0xFFFFA2A2), dangerLight = Color(0xFFC10007),
    accentOnLight = Color(0xFFB74100), accentOnBand = Color(0xFFE85501),
    accentInk = Color(0xFFFF8E63), // orange-600 is 3.2:1 on blue900; this is 4.59
)

val CrimsonPalette = Palette(
    ground = Color(0xFF16060A), blue950 = Color(0xFF28070A), blue900 = Color(0xFF410D13), blue800 = Color(0xFF5B161C),
    blue700 = Color(0xFF81252A), blue400 = Color(0xFFD58777), blue300 = Color(0xFFE5B099), blue100 = Color(0xFFFCE9D8),
    white = Color(0xFFFDF7F4), accent = Color(0xFFE9A100), dangerDark = Color(0xFFFF9DD8), dangerLight = Color(0xFFA80083),
    accentOnLight = Color(0xFF8E6205), accentOnBand = Color(0xFFB47D01),
)

// Void keeps the default accent and danger; the web theme overrides only the ground scale.
val VoidPalette = Palette(
    ground = Color(0xFF05060A), blue950 = Color(0xFF090B10), blue900 = Color(0xFF15181F), blue800 = Color(0xFF22262F),
    blue700 = Color(0xFF373D49), blue400 = Color(0xFF8B92A2), blue300 = Color(0xFFB1B7C5), blue100 = Color(0xFFE8EBF2),
    white = Color(0xFFF7F8FB), accent = Color(0xFFFF5400), dangerDark = Color(0xFFFFA2A2), dangerLight = Color(0xFFC10007),
    accentOnLight = Color(0xFFB94304), accentOnBand = Color(0xFFEB5600),
)

val NordPalette = Palette(
    ground = Color(0xFF171B22), blue950 = Color(0xFF09131A), blue900 = Color(0xFF131E26), blue800 = Color(0xFF1D2B34),
    blue700 = Color(0xFF2C3D47), blue400 = Color(0xFF7D9FAA), blue300 = Color(0xFFA9C3CB), blue100 = Color(0xFFE6ECEF),
    white = Color(0xFFF4F9FB), accent = Color(0xFFD5895E), dangerDark = Color(0xFFEDA9A8), dangerLight = Color(0xFF7D353F),
    accentOnLight = Color(0xFF9F582C), accentOnBand = Color(0xFFBE7449),
)

val MagentaPalette = Palette(
    ground = Color(0xFF0D0710), blue950 = Color(0xFF0E060D), blue900 = Color(0xFF1C0E19), blue800 = Color(0xFF2D1B27),
    blue700 = Color(0xFF452C3D), blue400 = Color(0xFFA78396), blue300 = Color(0xFFCCAEBC), blue100 = Color(0xFFF2E8EC),
    white = Color(0xFFFDF6F9), accent = Color(0xFFFF3EA0), dangerDark = Color(0xFFFFA19C), dangerLight = Color(0xFFB00000),
    accentOnLight = Color(0xFFCA0578), accentOnBand = Color(0xFFF43096),
)

val PastelPalette = Palette(
    ground = Color(0xFF191621), blue950 = Color(0xFF181320), blue900 = Color(0xFF262131), blue800 = Color(0xFF383145),
    blue700 = Color(0xFF504860), blue400 = Color(0xFFA59CBA), blue300 = Color(0xFFC4BCD5), blue100 = Color(0xFFEFEDF4),
    white = Color(0xFFF9F8FC), accent = Color(0xFFDC785F), dangerDark = Color(0xFFFFAEA8), dangerLight = Color(0xFFA11730),
    accentOnLight = Color(0xFFAE4F38), accentOnBand = Color(0xFFCE6C54),
)

fun ColorTheme.palette(): Palette = when (this) {
    ColorTheme.DEEP_BLUE -> DeepBluePalette
    ColorTheme.CRIMSON -> CrimsonPalette
    ColorTheme.VOID -> VoidPalette
    ColorTheme.NORD -> NordPalette
    ColorTheme.MAGENTA -> MagentaPalette
    ColorTheme.PASTEL -> PastelPalette
    // Its real colours come from the wallpaper (`BrainlessMusicTheme`); this is the fallback below Android 12.
    ColorTheme.MATERIAL_YOU -> DeepBluePalette
}
