package com.brainlessmusic.app.data.remote.dto

// Shapes from backend/src/routes/auth.ts and health.ts, not the older phased-plan doc.

data class HealthResponse(
    val status: String,
)

data class LoginRequest(
    val username: String,
    val password: String,
)

/**
 * `POST /auth/guest`. [code] is left out of the JSON when null (Gson skips nulls): the server refuses a wrong code even
 * with the door open. [name] names a new guest (blank: `Guest 1234`) and is ignored when the code already has a guest.
 */
data class GuestRequest(
    val code: String?,
    val name: String,
    val platform: String = "android",
)

/** `POST /auth/guest/requests` (A67): "Request a code". */
data class GuestCodeRequestBody(
    val name: String,
    val platform: String = "android",
)

/** The waiting device keeps both; only the hash of [secret] is on the server. */
data class GuestCodeRequestCreated(
    val id: Int,
    val secret: String,
)

/** Body of the request's `collect` and `cancel` calls. */
data class GuestRequestSecret(
    val secret: String,
)

/** `pending`, `denied`, `expired`, or `approved` with [token] and [code], handed over once. */
data class GuestRequestStatus(
    val status: String,
    val token: String? = null,
    val code: String? = null,
)

/** `PUT /me/name` (A68). Blank resets it: a guest gets a new `Guest 1234`, an account its username. */
data class DisplayNameRequest(
    val name: String,
)

data class DisplayNameResponse(
    val displayName: String,
)

/** Shared by `/auth/login` and `/auth/guest`: both hand back an ordinary session token. */
data class LoginResponse(
    val token: String,
)

data class MeResponse(
    val id: Int,
    val username: String,
    /** Null from a server older than A68; fall back to [username]. */
    val displayName: String?,
    val isAdmin: Boolean,
    val isGuest: Boolean,
    val hasPasscode: Boolean,
)
