package com.brainlessmusic.app.data.repository

import com.brainlessmusic.app.data.local.SessionStore
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.MediaUrlProvider
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.dto.GuestRequest
import com.brainlessmusic.app.data.remote.dto.LoginRequest
import retrofit2.HttpException
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

sealed interface SessionRestoreResult {
    data class Restored(val username: String) : SessionRestoreResult
    data object NoStoredSession : SessionRestoreResult
    data object StoredSessionInvalid : SessionRestoreResult
}

@Singleton
class AuthRepository @Inject constructor(
    private val apiServiceFactory: ApiServiceFactory,
    private val sessionStore: SessionStore,
    private val tokenProvider: TokenProvider,
    private val mediaUrlProvider: MediaUrlProvider,
    private val serverConfig: ServerConfig,
) {

    /** Prefill for the login screen. */
    suspend fun savedUsername(): String? = sessionStore.username.first()

    /** `GET /health` against the bound server; drives the green/red light on the login screen. */
    suspend fun testConnection(): Result<Unit> =
        runCatching {
            apiServiceFactory.get(serverConfig.url).health()
            Unit
        }.recoverCatching { throw ConnectionException(classifyError(it)) }

    suspend fun login(username: String, password: String): Result<Unit> {
        val validated = serverConfig.url
        return runCatching {
            val response = apiServiceFactory.get(validated).login(LoginRequest(username, password))
            tokenProvider.current = response.token
            tokenProvider.isGuest = false
            mediaUrlProvider.current = ApiServiceFactory.normalize(validated)
            sessionStore.saveSession(validated, username, response.token)
            Unit
        }.recoverCatching {
            tokenProvider.current = null
            throw ConnectionException(classifyError(it))
        }
    }

    /**
     * The Guest button (A41): mints a guest, then reads its name from `/auth/me`. The server answers 401 both for a
     * missing code and a wrong one; the caller tells them apart by whether it sent one.
     */
    suspend fun enterAsGuest(code: String?): GuestEntryResult {
        val serverUrl = serverConfig.url
        return try {
            val api = apiServiceFactory.get(serverUrl)
            val response = api.guest(GuestRequest(code?.trim()?.takeIf { it.isNotEmpty() }))
            tokenProvider.current = response.token
            val me = api.me()
            tokenProvider.isGuest = me.isGuest
            mediaUrlProvider.current = ApiServiceFactory.normalize(serverUrl)
            sessionStore.saveSession(serverUrl, me.username, response.token)
            GuestEntryResult.Entered(me.username)
        } catch (e: Exception) {
            tokenProvider.current = null
            tokenProvider.isGuest = false
            when ((e as? HttpException)?.code()) {
                401 -> GuestEntryResult.CodeRejected
                429 -> GuestEntryResult.Failed("Too many tries from here. Wait a little.")
                503 -> GuestEntryResult.Failed("This server is full right now.")
                else -> GuestEntryResult.Failed(classifyError(e).toMessage())
            }
        }
    }

    /** Cold start: checks a stored token against `/auth/me`, since it may be revoked or signed with a rotated secret. */
    suspend fun restoreSession(): SessionRestoreResult {
        // Always the bound server: a session saved by a build pointing elsewhere (an old
        // quick tunnel, say) just fails /auth/me below and sends the listener to log in.
        val serverUrl = serverConfig.url
        val token = sessionStore.readToken() ?: return SessionRestoreResult.NoStoredSession

        tokenProvider.current = token
        mediaUrlProvider.current = ApiServiceFactory.normalize(serverUrl)
        return runCatching { apiServiceFactory.get(serverUrl).me() }
            .fold(
                onSuccess = {
                    tokenProvider.isGuest = it.isGuest
                    SessionRestoreResult.Restored(it.username)
                },
                onFailure = {
                    tokenProvider.current = null
                    mediaUrlProvider.current = null
                    sessionStore.clearCredentials()
                    SessionRestoreResult.StoredSessionInvalid
                },
            )
    }

    /** True when the signed-in session is a guest's, whose identity lives only in this device's stored token. */
    val isGuest: Boolean get() = tokenProvider.isGuest

    suspend fun logout() {
        tokenProvider.current = null
        tokenProvider.isGuest = false
        mediaUrlProvider.current = null
        sessionStore.clearCredentials()
    }
}

sealed interface GuestEntryResult {
    data class Entered(val username: String) : GuestEntryResult
    /** 401: a code is needed and none was sent, or the one sent is wrong, used or expired. */
    data object CodeRejected : GuestEntryResult
    data class Failed(val message: String) : GuestEntryResult
}

/** Carries a classified [ConnectionError] through a [Result.failure] without losing the classification to a generic exception. */
class ConnectionException(val error: ConnectionError) : Exception(error.toMessage())
