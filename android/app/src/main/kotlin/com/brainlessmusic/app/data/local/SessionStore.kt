package com.brainlessmusic.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/** Server URL and username in plain text, the JWT encrypted by [CryptoManager]. The password is never stored. */
@Singleton
class SessionStore @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    private val cryptoManager: CryptoManager,
) {
    val serverUrl: Flow<String?> = dataStore.data.map { it[SERVER_URL_KEY] }
    val username: Flow<String?> = dataStore.data.map { it[USERNAME_KEY] }
    /** What the server calls this user (A68), for Settings. Null until the first sign-in after A68. */
    val displayName: Flow<String?> = dataStore.data.map { it[DISPLAY_NAME_KEY] }

    suspend fun saveDisplayName(name: String) {
        dataStore.edit { it[DISPLAY_NAME_KEY] = name }
    }

    /** A "Request a code" waiting for the admin (A67), kept so a restarted app keeps waiting instead of asking again. */
    suspend fun readPendingGuestRequest(): Pair<Int, String>? {
        val prefs = dataStore.data.first()
        val id = prefs[PENDING_REQUEST_ID_KEY]?.toIntOrNull() ?: return null
        val secret = prefs[PENDING_REQUEST_SECRET_KEY] ?: return null
        return id to secret
    }

    suspend fun savePendingGuestRequest(id: Int, secret: String) {
        dataStore.edit {
            it[PENDING_REQUEST_ID_KEY] = id.toString()
            it[PENDING_REQUEST_SECRET_KEY] = secret
        }
    }

    suspend fun clearPendingGuestRequest() {
        dataStore.edit {
            it.remove(PENDING_REQUEST_ID_KEY)
            it.remove(PENDING_REQUEST_SECRET_KEY)
        }
    }

    suspend fun saveServerUrl(url: String) {
        dataStore.edit { it[SERVER_URL_KEY] = url }
    }

    /** The stored token, decrypted, or `null` if there is none. */
    suspend fun readToken(): String? {
        val prefs = dataStore.data.first()
        val cipherText = prefs[TOKEN_CIPHER_KEY] ?: return null
        val iv = prefs[TOKEN_IV_KEY] ?: return null
        return runCatching { cryptoManager.decrypt(EncryptedPayload(cipherText, iv)) }.getOrNull()
    }

    /** Whether the stored session is a guest's, as `/auth/me` last said; null for a session saved before it was kept. */
    suspend fun readIsGuest(): Boolean? = dataStore.data.first()[IS_GUEST_KEY]

    suspend fun saveIsGuest(isGuest: Boolean) {
        dataStore.edit { it[IS_GUEST_KEY] = isGuest }
    }

    suspend fun saveSession(serverUrl: String, username: String, token: String, isGuest: Boolean) {
        val encrypted = cryptoManager.encrypt(token)
        dataStore.edit { prefs ->
            prefs[SERVER_URL_KEY] = serverUrl
            prefs[USERNAME_KEY] = username
            prefs[IS_GUEST_KEY] = isGuest
            prefs[TOKEN_CIPHER_KEY] = encrypted.cipherText
            prefs[TOKEN_IV_KEY] = encrypted.iv
        }
    }

    /** Drops the token and username, keeps the server URL. */
    suspend fun clearCredentials() {
        dataStore.edit { prefs ->
            prefs.remove(USERNAME_KEY)
            prefs.remove(DISPLAY_NAME_KEY)
            prefs.remove(IS_GUEST_KEY)
            prefs.remove(TOKEN_CIPHER_KEY)
            prefs.remove(TOKEN_IV_KEY)
            // Searches belong to the account that made them.
            prefs.remove(RecentSearches.KEY)
        }
    }

    private companion object {
        val SERVER_URL_KEY = stringPreferencesKey("server_url")
        val USERNAME_KEY = stringPreferencesKey("username")
        val DISPLAY_NAME_KEY = stringPreferencesKey("display_name")
        val IS_GUEST_KEY = booleanPreferencesKey("is_guest")
        val PENDING_REQUEST_ID_KEY = stringPreferencesKey("pending_guest_request_id")
        val PENDING_REQUEST_SECRET_KEY = stringPreferencesKey("pending_guest_request_secret")
        val TOKEN_CIPHER_KEY = stringPreferencesKey("token_cipher")
        val TOKEN_IV_KEY = stringPreferencesKey("token_iv")
    }
}
