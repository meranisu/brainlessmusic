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

/**
 * User-facing playback preferences. Lives in the same DataStore as
 * [SessionStore], but [SessionStore.clearCredentials] removes only its own
 * keys, so these survive a logout — a preference is about the person's taste,
 * not about the account.
 */
@Singleton
class PlaybackSettings @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    /**
     * Whether reopening the app carries on playing the saved queue. Off by
     * default: A9 in `.docs/QUESTIONS.md` restores paused, and music starting
     * by itself on launch is the surprising direction.
     */
    val autoPlayOnResume: Flow<Boolean> = dataStore.data.map { it[AUTO_PLAY_ON_RESUME_KEY] ?: false }

    suspend fun setAutoPlayOnResume(enabled: Boolean) {
        dataStore.edit { it[AUTO_PLAY_ON_RESUME_KEY] = enabled }
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
    }
}
