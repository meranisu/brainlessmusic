package com.brainlessmusic.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
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

    /** Remembered across launches so the next queue starts the way the last one was left. */
    val shuffle: Flow<Boolean> = dataStore.data.map { it[SHUFFLE_KEY] ?: false }

    suspend fun setShuffle(enabled: Boolean) {
        dataStore.edit { it[SHUFFLE_KEY] = enabled }
    }

    /** A `Player.REPEAT_MODE_*` value. */
    val repeatMode: Flow<Int> = dataStore.data.map { it[REPEAT_KEY] ?: 0 }

    suspend fun setRepeatMode(mode: Int) {
        dataStore.edit { it[REPEAT_KEY] = mode }
    }

    private companion object {
        val SHUFFLE_KEY = booleanPreferencesKey("shuffle")
        val REPEAT_KEY = intPreferencesKey("repeat_mode")
        val AUTO_PLAY_ON_RESUME_KEY = booleanPreferencesKey("auto_play_on_resume")
        val KEEP_PLAYING_WHEN_SWIPED_KEY = booleanPreferencesKey("keep_playing_when_swiped_away")
    }
}
