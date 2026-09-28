package com.brainlessmusic.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
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

    private companion object {
        val AUTO_PLAY_ON_RESUME_KEY = booleanPreferencesKey("auto_play_on_resume")
    }
}
