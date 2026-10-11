package com.brainlessmusic.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
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
 * type stay the same (Q19). [webId] is the profile's id for it (A55, `users.theme`).
 */
enum class ColorTheme(val label: String, val detail: String, val webId: String?) {
    DEEP_BLUE("Deep blue", "The original", "blue"),
    CRIMSON("Crimson", "After IIDX RED", "red"),
    VOID("Void", "Near-black, accent only", "void"),
    NORD("Nord", "Flat, after the palette", "nord"),
    MAGENTA("Magenta", "After osu!", "pink"),
    PASTEL("Pastel", "Material, soft and round", "pastel"),

    /** Android 12+ only; older phones fall back to Deep blue and do not offer it. Kept on the phone, not the profile (A78). */
    MATERIAL_YOU("Material You", "From your wallpaper", null),
    ;

    companion object {
        /** Null for an id this build doesn't know, such as a theme added to the web later. */
        fun fromWebId(id: String?): ColorTheme? = entries.firstOrNull { it.webId != null && it.webId == id }
    }
}

/** How the Now Playing progress bar is drawn. */
enum class SeekStyle(val label: String) {
    SQUIGGLE("Squiggle"),
    CLASSIC("Classic slider"),
    LINE("Thin line"),
    PILL("Pill"),
    DOTS("Dots"),

    /** The song's own loudness as bars, from `GET /tracks/:id/waveform`; a stand-in shape until it arrives or offline. */
    WAVEFORM("Waveform"),
}

/**
 * How the Now Playing screen is laid out (A114). Standard and Pills keep the stock layout; the rest are after rhythm games,
 * draw in the current colour theme (A116) and show your record for the song (A115). Stored under the old
 * `controls_style` key, so a Pills pick from v0.3.31 carries over.
 */
enum class PlayerSkin(val label: String, val detail: String, val showsRecord: Boolean = false) {
    STANDARD("Standard", "Shuffle and repeat beside a filled play button"),
    PILLS("Pills", "Like, shuffle, repeat and add to playlist as a row of rounded buttons, with an outlined play button"),
    HIT_CIRCLE("Hit circle", "After osu!: a round cover, hit circle buttons and a slider. Pairs with Magenta", showsRecord = true),
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

    /**
     * The phone's copy of the profile's theme (A78): it paints the first frame before `/auth/me` answers. Material You
     * lives only here.
     */
    val colorTheme: Flow<ColorTheme> = dataStore.data.map { prefs ->
        ColorTheme.entries.firstOrNull { it.name == prefs[COLOR_THEME_KEY] } ?: ColorTheme.DEEP_BLUE
    }

    val seekStyle: Flow<SeekStyle> = dataStore.data.map { prefs ->
        SeekStyle.entries.firstOrNull { it.name == prefs[SEEK_STYLE_KEY] } ?: SeekStyle.SQUIGGLE
    }

    suspend fun setSeekStyle(style: SeekStyle) {
        dataStore.edit { it[SEEK_STYLE_KEY] = style.name }
    }

    val playerSkin: Flow<PlayerSkin> = dataStore.data.map { prefs ->
        PlayerSkin.entries.firstOrNull { it.name == prefs[CONTROLS_STYLE_KEY] } ?: PlayerSkin.STANDARD
    }

    suspend fun setPlayerSkin(style: PlayerSkin) {
        dataStore.edit { it[CONTROLS_STYLE_KEY] = style.name }
    }

    /** What was picked on this phone, or null if nothing ever was (the profile then gets nothing from it). */
    suspend fun storedColorTheme(): ColorTheme? =
        dataStore.data.first()[COLOR_THEME_KEY]?.let { name -> ColorTheme.entries.firstOrNull { it.name == name } }

    suspend fun setColorTheme(theme: ColorTheme) {
        dataStore.edit { it[COLOR_THEME_KEY] = theme.name }
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        dataStore.edit { it[THEME_MODE_KEY] = mode.name }
    }

    private companion object {
        val THEME_MODE_KEY = stringPreferencesKey("theme_mode")
        val SEEK_STYLE_KEY = stringPreferencesKey("seek_style")
        val CONTROLS_STYLE_KEY = stringPreferencesKey("controls_style")
        val COLOR_THEME_KEY = stringPreferencesKey("color_theme")
    }
}
