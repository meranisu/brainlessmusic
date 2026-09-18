package com.brainlessmusic.app.data.repository

import com.brainlessmusic.app.data.local.SessionStore
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.dto.LoginRequest
import kotlinx.coroutines.flow.first
import retrofit2.HttpException
import java.io.IOException
import java.net.ConnectException
import java.net.MalformedURLException
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import javax.inject.Inject
import javax.inject.Singleton
import javax.net.ssl.SSLException

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
) {

    /** Prefill values for the server-config screen — never the password, which is never stored. */
    suspend fun savedServerUrl(): String? = sessionStore.serverUrl.first()
    suspend fun savedUsername(): String? = sessionStore.username.first()

    suspend fun testConnection(serverUrl: String): Result<Unit> {
        val validated = validateUrl(serverUrl) ?: return Result.failure(ConnectionException(ConnectionError.InvalidUrl))
        return runCatching {
            apiServiceFactory.get(validated).health()
            Unit
        }.recoverCatching { throw ConnectionException(mapError(it)) }
    }

    suspend fun login(serverUrl: String, username: String, password: String): Result<Unit> {
        val validated = validateUrl(serverUrl) ?: return Result.failure(ConnectionException(ConnectionError.InvalidUrl))
        return runCatching {
            val response = apiServiceFactory.get(validated).login(LoginRequest(username, password))
            tokenProvider.current = response.token
            sessionStore.saveSession(validated, username, response.token)
            Unit
        }.recoverCatching {
            tokenProvider.current = null
            throw ConnectionException(mapError(it))
        }
    }

    /**
     * Called once on cold start. A stored token is validated against
     * `/auth/me` rather than trusted blindly — it may have been revoked, or
     * the JWT secret may have rotated server-side (see
     * `backend/src/utils/secretPolicy.ts`), and a token that merely *decodes*
     * is not the same as one the server still honors.
     */
    suspend fun restoreSession(): SessionRestoreResult {
        val serverUrl = sessionStore.serverUrl.first() ?: return SessionRestoreResult.NoStoredSession
        val token = sessionStore.readToken() ?: return SessionRestoreResult.NoStoredSession

        tokenProvider.current = token
        return runCatching { apiServiceFactory.get(serverUrl).me() }
            .fold(
                onSuccess = { SessionRestoreResult.Restored(it.username) },
                onFailure = {
                    tokenProvider.current = null
                    sessionStore.clearCredentials()
                    SessionRestoreResult.StoredSessionInvalid
                },
            )
    }

    suspend fun logout() {
        tokenProvider.current = null
        sessionStore.clearCredentials()
    }

    private fun validateUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        return try {
            val url = URL(trimmed)
            if ((url.protocol == "http" || url.protocol == "https") && !url.host.isNullOrBlank()) trimmed else null
        } catch (_: MalformedURLException) {
            null
        }
    }

    private fun mapError(t: Throwable): ConnectionError = when (t) {
        is HttpException -> if (t.code() == 401) ConnectionError.Unauthorized else ConnectionError.Unknown("HTTP ${t.code()}")
        // SSLException is an IOException subtype — must be checked before the generic IOException branch below.
        is SSLException -> ConnectionError.TlsError
        is UnknownHostException, is ConnectException, is SocketTimeoutException -> ConnectionError.Unreachable
        is IOException -> ConnectionError.Unreachable
        else -> ConnectionError.Unknown(t.message)
    }
}

/** Carries a classified [ConnectionError] through a [Result.failure] without losing the classification to a generic exception. */
class ConnectionException(val error: ConnectionError) : Exception(error.toMessage())
