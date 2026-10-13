package com.brainlessmusic.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The search tab's recent searches, newest first, on this phone only. They belong to whoever is signed in, so logging
 * out clears them with the session ([SessionStore.clearCredentials]).
 */
@Singleton
class RecentSearches @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    val queries: Flow<List<String>> = dataStore.data.map { decode(it[KEY]) }

    /** Moves [query] to the front, once, keeping [MAX]. */
    suspend fun remember(query: String) {
        val q = query.trim().replace('\n', ' ')
        if (q.isEmpty()) return
        dataStore.edit { prefs ->
            val kept = decode(prefs[KEY]).filterNot { it.equals(q, ignoreCase = true) }
            prefs[KEY] = encode((listOf(q) + kept).take(MAX))
        }
    }

    suspend fun forget(query: String) {
        dataStore.edit { prefs -> prefs[KEY] = encode(decode(prefs[KEY]).filterNot { it == query }) }
    }

    suspend fun clear() {
        dataStore.edit { it.remove(KEY) }
    }

    companion object {
        val KEY = stringPreferencesKey("recent_searches")
        const val MAX = 10

        // One query per line; a query never holds a line break.
        private fun encode(list: List<String>) = list.joinToString("\n")
        private fun decode(raw: String?) = raw?.split('\n')?.filter { it.isNotBlank() }.orEmpty()
    }
}
