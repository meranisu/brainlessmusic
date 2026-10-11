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

    /** After Arcaea, Lane's match (A116): phone-only until the web has it, so no web id. */
    LAVENDER("Lavender", "After Arcaea", null),

    /** After SOUND VOLTEX, Gear's match (A127): phone-only, like Lavender. */
    VOLTAGE("Voltage", "After SOUND VOLTEX", null),

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
 * The whole app's design language (A117-A119): type, shapes, covers, tap feedback, mini player, bottom bar and the Now
 * Playing layout. Colours stay with [ColorTheme] (A116). Standard is the app as it was, and the default.
 */
enum class Skin(val label: String, val detail: String) {
    STANDARD("Standard", "The original look"),
    HIT_CIRCLE("Hit circle", "After osu!: round covers and buttons, a ring on every tap, a slider player. Pairs with Magenta"),
    LANE("Lane", "After Arcaea: slanted panels, thin type, a lane you seek along. Pairs with Lavender"),
    GEAR("Gear", "After SOUND VOLTEX: a console of keys and knobs, wide type, a lane up to the critical line. Pairs with Voltage"),
    ;

    /** Game skins show your record for the song in the player (A115). */
    val showsRecord: Boolean get() = this != STANDARD
}

/** The Standard skin's player buttons. Stored under `controls_style`, as since v0.3.31. */
enum class PlayerButtons(val label: String, val detail: String) {
    STANDARD("Standard", "Shuffle and repeat beside a filled play button"),
    PILLS("Pills", "Like, shuffle, repeat and add to playlist as a row of rounded buttons, with an outlined play button"),
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

    /** v0.3.32 kept Hit circle in `controls_style`; a phone that picked it there wears it app-wide now. */
    val skin: Flow<Skin> = dataStore.data.map { prefs ->
        Skin.entries.firstOrNull { it.name == prefs[SKIN_KEY] }
            ?: if (prefs[CONTROLS_STYLE_KEY] == "HIT_CIRCLE") Skin.HIT_CIRCLE else Skin.STANDARD
    }

    suspend fun setSkin(skin: Skin) {
        dataStore.edit { it[SKIN_KEY] = skin.name }
    }

    val playerButtons: Flow<PlayerButtons> = dataStore.data.map { prefs ->
        if (prefs[CONTROLS_STYLE_KEY] == PlayerButtons.PILLS.name) PlayerButtons.PILLS else PlayerButtons.STANDARD
    }

    suspend fun setPlayerButtons(buttons: PlayerButtons) {
        dataStore.edit { it[CONTROLS_STYLE_KEY] = buttons.name }
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
        val SKIN_KEY = stringPreferencesKey("skin")
        val COLOR_THEME_KEY = stringPreferencesKey("color_theme")
    }
}
