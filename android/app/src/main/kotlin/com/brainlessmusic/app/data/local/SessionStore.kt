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

/**
 * Persists what's needed to reconnect without asking again: the server URL,
 * the username (both plain — neither is a secret), and the JWT ([CryptoManager]
 * -encrypted before it lands here, decrypted only in memory). The password
 * itself is never stored anywhere, matching the phased plan.
 */
@Singleton
class SessionStore @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    private val cryptoManager: CryptoManager,
) {
    val serverUrl: Flow<String?> = dataStore.data.map { it[SERVER_URL_KEY] }
    val username: Flow<String?> = dataStore.data.map { it[USERNAME_KEY] }

    suspend fun saveServerUrl(url: String) {
        dataStore.edit { it[SERVER_URL_KEY] = url }
    }

    /** Reads the currently stored token, decrypting it — `null` if none is stored. */
    suspend fun readToken(): String? {
        val prefs = dataStore.data.first()
        val cipherText = prefs[TOKEN_CIPHER_KEY] ?: return null
        val iv = prefs[TOKEN_IV_KEY] ?: return null
        return runCatching { cryptoManager.decrypt(EncryptedPayload(cipherText, iv)) }.getOrNull()
    }

    suspend fun saveSession(serverUrl: String, username: String, token: String) {
        val encrypted = cryptoManager.encrypt(token)
        dataStore.edit { prefs ->
            prefs[SERVER_URL_KEY] = serverUrl
            prefs[USERNAME_KEY] = username
            prefs[TOKEN_CIPHER_KEY] = encrypted.cipherText
            prefs[TOKEN_IV_KEY] = encrypted.iv
        }
    }

    /** Drops the token (and username) but keeps the server URL — no reason to re-type it after a logout. */
    suspend fun clearCredentials() {
        dataStore.edit { prefs ->
            prefs.remove(USERNAME_KEY)
            prefs.remove(TOKEN_CIPHER_KEY)
            prefs.remove(TOKEN_IV_KEY)
        }
    }

    private companion object {
        val SERVER_URL_KEY = stringPreferencesKey("server_url")
        val USERNAME_KEY = stringPreferencesKey("username")
        val TOKEN_CIPHER_KEY = stringPreferencesKey("token_cipher")
        val TOKEN_IV_KEY = stringPreferencesKey("token_iv")
    }
}
