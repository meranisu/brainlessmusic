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
    /** Follow the phone's own light/dark setting — the default. */
    SYSTEM("System"),
    LIGHT("Light"),
    DARK("Dark"),
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

    val seekStyle: Flow<SeekStyle> = dataStore.data.map { prefs ->
        SeekStyle.entries.firstOrNull { it.name == prefs[SEEK_STYLE_KEY] } ?: SeekStyle.SQUIGGLE
    }

    suspend fun setSeekStyle(style: SeekStyle) {
        dataStore.edit { it[SEEK_STYLE_KEY] = style.name }
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        dataStore.edit { it[THEME_MODE_KEY] = mode.name }
    }

    private companion object {
        val THEME_MODE_KEY = stringPreferencesKey("theme_mode")
        val SEEK_STYLE_KEY = stringPreferencesKey("seek_style")
    }
}
