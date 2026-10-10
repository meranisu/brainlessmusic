package com.brainlessmusic.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

enum class ThemeMode(val label: String) {
    /** Follow the phone's light/dark setting (the default). */
    SYSTEM("System"),
    LIGHT("Light"),
    DARK("Dark"),
}

/**
 * The web's six colour themes (`frontend/src/lib/theme.ts`), plus Android's wallpaper colours. Colour only: layout and
 * type stay the same (Q19).
 */
enum class ColorTheme(val label: String, val detail: String) {
    DEEP_BLUE("Deep blue", "The original"),
    CRIMSON("Crimson", "After IIDX RED"),
    VOID("Void", "Near-black, accent only"),
    NORD("Nord", "Flat, after the palette"),
    MAGENTA("Magenta", "After osu!"),
    PASTEL("Pastel", "Material, soft and round"),

    /** Android 12+ only; older phones fall back to Deep blue and do not offer it. */
    MATERIAL_YOU("Material You", "From your wallpaper"),
}

/** How the Now Playing progress bar is drawn. */
enum class SeekStyle(val label: String) {
    SQUIGGLE("Squiggle"),
    CLASSIC("Classic slider"),
    LINE("Thin line"),
    PILL("Pill"),
    DOTS("Dots"),
}

/** How the app looks. Same DataStore as [SessionStore]; survives logout for the same reason [PlaybackSettings] does. */
@Singleton
class AppearanceSettings @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    val themeMode: Flow<ThemeMode> = dataStore.data.map { prefs ->
        // An unknown stored value (a renamed mode in a later version) falls back to the default.
        ThemeMode.entries.firstOrNull { it.name == prefs[THEME_MODE_KEY] } ?: ThemeMode.SYSTEM
    }

    /** Per phone, not per account, like the web's `localStorage` choice (Q20). */
    val colorTheme: Flow<ColorTheme> = dataStore.data.map { prefs ->
        ColorTheme.entries.firstOrNull { it.name == prefs[COLOR_THEME_KEY] } ?: ColorTheme.DEEP_BLUE
    }

    val seekStyle: Flow<SeekStyle> = dataStore.data.map { prefs ->
        SeekStyle.entries.firstOrNull { it.name == prefs[SEEK_STYLE_KEY] } ?: SeekStyle.SQUIGGLE
    }

    suspend fun setSeekStyle(style: SeekStyle) {
        dataStore.edit { it[SEEK_STYLE_KEY] = style.name }
    }

    suspend fun setColorTheme(theme: ColorTheme) {
        dataStore.edit { it[COLOR_THEME_KEY] = theme.name }
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        dataStore.edit { it[THEME_MODE_KEY] = mode.name }
    }

    private companion object {
        val THEME_MODE_KEY = stringPreferencesKey("theme_mode")
        val SEEK_STYLE_KEY = stringPreferencesKey("seek_style")
        val COLOR_THEME_KEY = stringPreferencesKey("color_theme")
    }
}
