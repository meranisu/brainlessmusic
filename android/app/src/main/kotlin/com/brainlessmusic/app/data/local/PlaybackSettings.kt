package com.brainlessmusic.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.brainlessmusic.app.playback.ShuffleMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/** Playback preferences. Kept through logout: [SessionStore.clearCredentials] removes only its own keys. */
@Singleton
class PlaybackSettings @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    /** Whether reopening the app plays the saved queue. Off by default: A9 restores paused. */
    val autoPlayOnResume: Flow<Boolean> = dataStore.data.map { it[AUTO_PLAY_ON_RESUME_KEY] ?: false }

    suspend fun setAutoPlayOnResume(enabled: Boolean) {
        dataStore.edit { it[AUTO_PLAY_ON_RESUME_KEY] = enabled }
    }

    /** Whether music carries on after the app is swiped away from recents. On by default, like other music apps (A58). */
    val keepPlayingWhenSwipedAway: Flow<Boolean> = dataStore.data.map { it[KEEP_PLAYING_WHEN_SWIPED_KEY] ?: true }

    suspend fun setKeepPlayingWhenSwipedAway(enabled: Boolean) {
        dataStore.edit { it[KEEP_PLAYING_WHEN_SWIPED_KEY] = enabled }
    }

    /** Remembered across launches so the next queue starts the way the last one was left. Before A77 it was on/off. */
    val shuffleMode: Flow<ShuffleMode> = dataStore.data.map { prefs ->
        prefs[SHUFFLE_MODE_KEY]?.let { name -> ShuffleMode.entries.firstOrNull { it.name == name } }
            ?: if (prefs[SHUFFLE_KEY] == true) ShuffleMode.SHUFFLE else ShuffleMode.OFF
    }

    suspend fun setShuffleMode(mode: ShuffleMode) {
        dataStore.edit { it[SHUFFLE_MODE_KEY] = mode.name }
    }

    /** A `Player.REPEAT_MODE_*` value. */
    val repeatMode: Flow<Int> = dataStore.data.map { it[REPEAT_KEY] ?: 0 }

    suspend fun setRepeatMode(mode: Int) {
        dataStore.edit { it[REPEAT_KEY] = mode }
    }

    /** Gapless, crossfade or fade out then in, the pause fade and the album rule (A71, A72). */
    val transitions: Flow<TransitionPrefs> = dataStore.data.map { prefs ->
        val defaults = TransitionPrefs()
        TransitionPrefs(
            betweenSongs = prefs[BETWEEN_SONGS_KEY]?.let { name -> BetweenSongs.entries.firstOrNull { it.name == name } }
                ?: defaults.betweenSongs,
            fadeSeconds = prefs[FADE_SECONDS_KEY]?.takeIf { it in FADE_LENGTHS } ?: defaults.fadeSeconds,
            fadeOnPause = prefs[FADE_ON_PAUSE_KEY] ?: defaults.fadeOnPause,
            keepAlbumsGapless = prefs[KEEP_ALBUMS_GAPLESS_KEY] ?: defaults.keepAlbumsGapless,
        )
    }

    suspend fun setBetweenSongs(value: BetweenSongs) {
        dataStore.edit { it[BETWEEN_SONGS_KEY] = value.name }
    }

    suspend fun setFadeSeconds(seconds: Int) {
        dataStore.edit { it[FADE_SECONDS_KEY] = seconds }
    }

    suspend fun setFadeOnPause(enabled: Boolean) {
        dataStore.edit { it[FADE_ON_PAUSE_KEY] = enabled }
    }

    suspend fun setKeepAlbumsGapless(enabled: Boolean) {
        dataStore.edit { it[KEEP_ALBUMS_GAPLESS_KEY] = enabled }
    }

    private companion object {
        val SHUFFLE_KEY = booleanPreferencesKey("shuffle")
        val SHUFFLE_MODE_KEY = stringPreferencesKey("shuffle_mode")
        val REPEAT_KEY = intPreferencesKey("repeat_mode")
        val AUTO_PLAY_ON_RESUME_KEY = booleanPreferencesKey("auto_play_on_resume")
        val KEEP_PLAYING_WHEN_SWIPED_KEY = booleanPreferencesKey("keep_playing_when_swiped_away")
        val BETWEEN_SONGS_KEY = stringPreferencesKey("between_songs")
        val FADE_SECONDS_KEY = intPreferencesKey("fade_seconds")
        val FADE_ON_PAUSE_KEY = booleanPreferencesKey("fade_on_pause")
        val KEEP_ALBUMS_GAPLESS_KEY = booleanPreferencesKey("keep_albums_gapless")
    }
}
