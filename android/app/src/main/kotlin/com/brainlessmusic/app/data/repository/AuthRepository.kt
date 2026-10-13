package com.brainlessmusic.app.data.repository

import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.ColorTheme
import com.brainlessmusic.app.data.local.SessionStore
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.MediaUrlProvider
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.dto.AcceptInviteRequest
import com.brainlessmusic.app.data.remote.dto.DisplayNameRequest
import com.brainlessmusic.app.data.remote.dto.EmailRequest
import com.brainlessmusic.app.data.remote.dto.InvitePeek
import com.brainlessmusic.app.data.remote.dto.GuestCodeRequestBody
import com.brainlessmusic.app.data.remote.dto.GuestRequest
import com.brainlessmusic.app.data.remote.dto.GuestRequestSecret
import com.brainlessmusic.app.data.remote.dto.LoginRequest
import com.brainlessmusic.app.data.remote.dto.MeResponse
import com.brainlessmusic.app.data.remote.dto.ThemeRequest
import com.brainlessmusic.app.data.remote.NetworkMonitor
import com.brainlessmusic.app.playback.PendingPlays
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import retrofit2.HttpException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

sealed interface SessionRestoreResult {
    /** [offline]: the server couldn't be reached, so the stored session is kept unchecked rather than thrown away. */
    data class Restored(val username: String, val offline: Boolean = false) : SessionRestoreResult
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
    private val appearance: AppearanceSettings,
    private val pendingPlays: PendingPlays,
    private val networkMonitor: NetworkMonitor,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _needsSignIn = MutableStateFlow(false)

    /**
     * True from the moment the server refuses this session (401, from any request) until the next sign-in. The nav
     * graph sends the listener to the login screen on it, instead of leaving every screen failing.
     */
    val needsSignIn: StateFlow<Boolean> = _needsSignIn.asStateFlow()

    init {
        scope.launch {
            tokenProvider.refused.collect { token ->
                // A 401 from a token already replaced (a sign-in since) says nothing about the current session.
                if (token == tokenProvider.current) endRefusedSession()
            }
        }
    }

    /** Theme saves go out one at a time, in the order picked, so the last tap is the one the profile keeps. */
    private val themeSaves = Mutex()

    /** Prefill for the login screen. */
    suspend fun savedUsername(): String? = sessionStore.username.first()

    /** What the server calls this user (A68), as last seen. */
    val displayName: Flow<String?> = sessionStore.displayName

    /** `GET /health` against the bound server; drives the green/red light on the login screen. */
    suspend fun testConnection(): Result<Unit> =
        runCatching {
            apiServiceFactory.get(serverConfig.url).health()
            Unit
        }.recoverCatching { throw ConnectionException(classifyError(it)) }

    suspend fun login(username: String, password: String): Result<Unit> {
        val validated = serverConfig.url
        return runCatching {
            val response = apiServiceFactory.get(validated).login(LoginRequest(username.trim(), password))
            tokenProvider.current = response.token
            tokenProvider.isGuest = false
            _needsSignIn.value = false
            mediaUrlProvider.current = ApiServiceFactory.normalize(validated)
            // [username] may be an email (A192); the login answer carries the real one, which the first-run setup and
            // Settings key on. A failure of the `me()` after doesn't undo the login.
            val me = runCatching { apiServiceFactory.get(validated).me() }.getOrNull()
            val realName = response.username ?: me?.username ?: username.trim()
            sessionStore.saveSession(validated, realName, response.token, isGuest = false)
            if (me != null) {
                sessionStore.saveDisplayName(nameOf(me))
                runCatching { syncTheme(me) }
            }
            Unit
        }.recoverCatching {
            tokenProvider.current = null
            throw ConnectionException(classifyError(it))
        }
    }

    /**
     * The Guest form (A41, A67-A69). A new guest is named [name] (blank: `Guest 1234`); a code already in use signs in
     * as its guest and the name is ignored. The server answers 401 both for a missing code and a wrong one; the
     * caller tells them apart by whether it sent one.
     */
    suspend fun enterAsGuest(code: String?, name: String): GuestEntryResult {
        val serverUrl = serverConfig.url
        return try {
            val api = apiServiceFactory.get(serverUrl)
            val response = api.guest(GuestRequest(code?.trim()?.takeIf { it.isNotEmpty() }, name.trim()))
            GuestEntryResult.Entered(adopt(serverUrl, response.token))
        } catch (e: Exception) {
            tokenProvider.current = null
            tokenProvider.isGuest = false
            when ((e as? HttpException)?.code()) {
                400 -> GuestEntryResult.Failed("Names can be up to 32 characters.")
                401 -> GuestEntryResult.CodeRejected
                429 -> GuestEntryResult.Failed("Too many tries from here. Wait a little.")
                503 -> GuestEntryResult.Failed("This server is full right now.")
                else -> GuestEntryResult.Failed(classifyError(e).toMessage())
            }
        }
    }

    /** What an invite code is good for, or why not (A191). */
    suspend fun peekInvite(code: String): InviteCheck =
        try {
            val peek = apiServiceFactory.get(serverConfig.url).peekInvite(code)
            if (peek.status == "open") InviteCheck.Open(peek) else InviteCheck.Closed(peek.status)
        } catch (e: Exception) {
            when ((e as? HttpException)?.code()) {
                404 -> InviteCheck.Closed("unknown")
                429 -> InviteCheck.Failed("Too many tries from here. Wait a little.")
                else -> InviteCheck.Failed(classifyError(e).toMessage())
            }
        }

    /**
     * Makes the account (A189-A192) and signs this phone in as it; an upgrade invite turns the signed-in guest into it.
     * Returns the display name, or the server's reason as a sentence.
     */
    suspend fun acceptInvite(code: String, body: AcceptInviteRequest): Result<String> {
        val serverUrl = serverConfig.url
        val response = try {
            apiServiceFactory.get(serverUrl).acceptInvite(code, body)
        } catch (e: Exception) {
            val message = when ((e as? HttpException)?.code()) {
                400, 409 -> serverError(e) ?: "Check what you typed and try again."
                410 -> "This invite has expired or was already used."
                429 -> "Too many tries from here. Wait a little."
                else -> classifyError(e).toMessage()
            }
            return Result.failure(IllegalStateException(message))
        }
        // The account exists and the invite is spent from here on, so a failed `/auth/me` must not throw the session
        // away: trying again would only get "already used".
        return try {
            Result.success(adopt(serverUrl, response.token))
        } catch (e: Exception) {
            tokenProvider.current = response.token
            tokenProvider.isGuest = false
            _needsSignIn.value = false
            mediaUrlProvider.current = ApiServiceFactory.normalize(serverUrl)
            sessionStore.saveSession(serverUrl, response.username, response.token, isGuest = false)
            sessionStore.saveDisplayName(response.username)
            Result.success(response.username)
        }
    }

    /** True when this is an account with no email yet (A190), so the app asks for one; null when the server can't say. */
    suspend fun needsEmail(): Boolean? =
        runCatching { apiServiceFactory.get(serverConfig.url).me() }
            .map { !it.isGuest && it.email == null }
            .getOrNull()

    /** Adds or changes the account's email; the failure carries a sentence to show. */
    suspend fun setEmail(email: String): Result<String> =
        try {
            Result.success(apiServiceFactory.get(serverConfig.url).setEmail(EmailRequest(email.trim())).email)
        } catch (e: Exception) {
            val message = when ((e as? HttpException)?.code()) {
                400, 409 -> serverError(e) ?: "Check the email and try again."
                else -> classifyError(e).toMessage()
            }
            Result.failure(IllegalStateException(message))
        }

    /** The `error` field of a JSON refusal, as a sentence. */
    private fun serverError(e: HttpException): String? =
        runCatching {
            val body = e.response()?.errorBody()?.string() ?: return null
            org.json.JSONObject(body).optString("error").takeIf { it.isNotEmpty() }
        }.getOrNull()?.replaceFirstChar { it.uppercase() }

    /** Stores [token] as this phone's session and returns the display name `/auth/me` gives it. */
    private suspend fun adopt(serverUrl: String, token: String): String {
        tokenProvider.current = token
        _needsSignIn.value = false
        val me = apiServiceFactory.get(serverUrl).me()
        tokenProvider.isGuest = me.isGuest
        mediaUrlProvider.current = ApiServiceFactory.normalize(serverUrl)
        sessionStore.saveSession(serverUrl, me.username, token, me.isGuest)
        sessionStore.saveDisplayName(nameOf(me))
        runCatching { syncTheme(me) }
        return nameOf(me)
    }

    suspend fun hasPendingGuestRequest(): Boolean = sessionStore.readPendingGuestRequest() != null

    /** "Request a code" (A67): queues a request for the admin and keeps its id and secret on this phone. */
    suspend fun requestGuestCode(name: String): GuestRequestResult =
        try {
            val created = apiServiceFactory.get(serverConfig.url).requestGuestCode(GuestCodeRequestBody(name.trim()))
            sessionStore.savePendingGuestRequest(created.id, created.secret)
            GuestRequestResult.Waiting
        } catch (e: Exception) {
            GuestRequestResult.Failed(
                when ((e as? HttpException)?.code()) {
                    400 -> "Names can be up to 32 characters."
                    429 -> "You have asked a few times already. Try again in an hour."
                    503 -> "Too many requests are waiting for the admin. Try again later."
                    else -> classifyError(e).toMessage()
                },
            )
        }

    /** One poll of the waiting request. An approval signs this phone in; every final answer forgets the request. */
    suspend fun pollGuestRequest(): GuestRequestPoll {
        val (id, secret) = sessionStore.readPendingGuestRequest() ?: return GuestRequestPoll.Gone
        val serverUrl = serverConfig.url
        val status = try {
            apiServiceFactory.get(serverUrl).collectGuestCodeRequest(id, GuestRequestSecret(secret))
        } catch (e: Exception) {
            if ((e as? HttpException)?.code() == 404) {
                sessionStore.clearPendingGuestRequest()
                return GuestRequestPoll.Gone
            }
            return GuestRequestPoll.Unreachable
        }

        if (status.status == "pending") return GuestRequestPoll.Pending
        sessionStore.clearPendingGuestRequest()
        return when (status.status) {
            "approved" -> {
                val token = status.token ?: return GuestRequestPoll.Gone
                val code = status.code ?: ""
                try {
                    GuestRequestPoll.Approved(code, adopt(serverUrl, token))
                } catch (e: Exception) {
                    // The token is spent, but the code still works through the Guest form.
                    tokenProvider.current = null
                    tokenProvider.isGuest = false
                    GuestRequestPoll.ApprovedSignInFailed(code)
                }
            }
            "denied" -> GuestRequestPoll.Denied
            "expired" -> GuestRequestPoll.Expired
            else -> GuestRequestPoll.Gone
        }
    }

    /** "Stop waiting": withdraws the request so the admin isn't asked about it. A failure is fine; it expires anyway. */
    suspend fun cancelGuestRequest() {
        val (id, secret) = sessionStore.readPendingGuestRequest() ?: return
        sessionStore.clearPendingGuestRequest()
        runCatching { apiServiceFactory.get(serverConfig.url).cancelGuestCodeRequest(id, GuestRequestSecret(secret)) }
    }

    /** Renames the signed-in user (A68) and returns the name the server settled on. */
    suspend fun setDisplayName(name: String): Result<String> =
        runCatching {
            val saved = apiServiceFactory.get(serverConfig.url).setDisplayName(DisplayNameRequest(name.trim())).displayName
            sessionStore.saveDisplayName(saved)
            saved
        }.recoverCatching {
            throw ConnectionException(classifyError(it))
        }

    /**
     * Saves a colour pick on the phone, and on the profile when the web has the same theme (A78). Material You stays on
     * the phone. A failed save keeps the phone's pick; the profile catches up on the next pick.
     */
    suspend fun setColorTheme(theme: ColorTheme) {
        appearance.setColorTheme(theme)
        val webId = theme.webId ?: return
        themeSaves.withLock {
            runCatching { apiServiceFactory.get(serverConfig.url).setTheme(ThemeRequest(webId)) }
        }
    }

    /**
     * Makes the phone follow the profile's theme (A78), run on every way in. A phone-only theme (Material You, Lavender)
     * wins, since the profile can't hold it. A profile with no theme yet takes the phone's pick, so a choice made before A78 isn't lost.
     */
    private suspend fun syncTheme(me: MeResponse) {
        val local = appearance.storedColorTheme()
        if (local != null && local.webId == null) return
        if (me.theme == null) {
            val webId = local?.webId ?: return
            themeSaves.withLock { apiServiceFactory.get(serverConfig.url).setTheme(ThemeRequest(webId)) }
            return
        }
        val profile = ColorTheme.fromWebId(me.theme) ?: return
        if (profile != local) appearance.setColorTheme(profile)
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
                    sessionStore.saveIsGuest(it.isGuest)
                    sessionStore.saveDisplayName(nameOf(it))
                    runCatching { syncTheme(it) }
                    // The flush at start-up ran before the token was set and sent nothing (C18).
                    pendingPlays.flush()
                    SessionRestoreResult.Restored(nameOf(it))
                },
                onFailure = {
                    // Only the server saying no ends the session. No signal, or smol being down, used to log the
                    // phone out, which loses a guest's identity for good and locks out downloaded music.
                    if (classifyError(it) == ConnectionError.Unauthorized) {
                        endRefusedSession()
                        SessionRestoreResult.StoredSessionInvalid
                    } else {
                        // Unknown (a session saved before this was kept) counts as guest: listen-only is the safe side.
                        tokenProvider.isGuest = sessionStore.readIsGuest() ?: true
                        val name = sessionStore.displayName.first() ?: sessionStore.username.first() ?: ""
                        recheckWhenOnline(serverUrl, token)
                        SessionRestoreResult.Restored(name, offline = true)
                    }
                },
            )
    }

    /**
     * After an offline start: once there is signal, asks `/auth/me` what the cold start couldn't. That fixes a guess
     * about being a guest (a session saved before the flag was kept counts as one), and a 401 ends the session as a
     * cold start would have. Anything else leaves it as it is; the next cold start asks again.
     */
    private fun recheckWhenOnline(serverUrl: String, token: String) {
        scope.launch {
            networkMonitor.online.first { it }
            if (tokenProvider.current != token) return@launch
            runCatching { apiServiceFactory.get(serverUrl).me() }.fold(
                onSuccess = {
                    // Logged out, or in as someone else, while /auth/me ran: this answer is about a session that's gone.
                    if (tokenProvider.current != token) return@fold
                    tokenProvider.isGuest = it.isGuest
                    sessionStore.saveIsGuest(it.isGuest)
                    sessionStore.saveDisplayName(nameOf(it))
                    pendingPlays.flush()
                },
                onFailure = {
                    if (classifyError(it) == ConnectionError.Unauthorized && tokenProvider.current == token) {
                        endRefusedSession()
                    }
                },
            )
        }
    }

    /** The server said no to this session (401): sign out locally, and drop its queued plays with it. */
    private suspend fun endRefusedSession() {
        _needsSignIn.value = true
        tokenProvider.current = null
        mediaUrlProvider.current = null
        pendingPlays.forget()
        sessionStore.clearCredentials()
    }

    /** True when the signed-in session is a guest's, whose identity lives only in this device's stored token. */
    val isGuest: Boolean get() = tokenProvider.isGuest

    suspend fun logout() {
        // Before the token goes: offline plays are sent as this account, or forgotten, never left for the next one.
        pendingPlays.sendThenClear()
        tokenProvider.current = null
        tokenProvider.isGuest = false
        mediaUrlProvider.current = null
        sessionStore.clearCredentials()
    }
}

private fun nameOf(me: MeResponse): String = me.displayName ?: me.username

sealed interface InviteCheck {
    data class Open(val peek: InvitePeek) : InviteCheck
    /** `used`, `expired`, `revoked`, or `unknown` for a code never issued. */
    data class Closed(val status: String) : InviteCheck
    data class Failed(val message: String) : InviteCheck
}

sealed interface GuestEntryResult {
    /** [name] is the display name: the one typed, `Guest 1234`, or the existing guest's when the code had one. */
    data class Entered(val name: String) : GuestEntryResult
    /** 401: a code is needed and none was sent, or the one sent is wrong, used or expired. */
    data object CodeRejected : GuestEntryResult
    data class Failed(val message: String) : GuestEntryResult
}

sealed interface GuestRequestResult {
    data object Waiting : GuestRequestResult
    data class Failed(val message: String) : GuestRequestResult
}

sealed interface GuestRequestPoll {
    data object Pending : GuestRequestPoll
    /** The poll itself failed; keep waiting. */
    data object Unreachable : GuestRequestPoll
    data object Denied : GuestRequestPoll
    /** Nobody answered within a day, or the approval was revoked before this phone collected it. */
    data object Expired : GuestRequestPoll
    /** Unknown, already collected, or nothing stored: the request is no longer open. */
    data object Gone : GuestRequestPoll
    /** Signed in. [code] is shown once, for the guest's other devices. */
    data class Approved(val code: String, val name: String) : GuestRequestPoll
    data class ApprovedSignInFailed(val code: String) : GuestRequestPoll
}

/** Carries a classified [ConnectionError] through a [Result.failure] without losing the classification to a generic exception. */
class ConnectionException(val error: ConnectionError) : Exception(error.toMessage())
