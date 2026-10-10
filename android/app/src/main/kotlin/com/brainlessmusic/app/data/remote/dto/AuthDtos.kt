package com.brainlessmusic.app.data.remote.dto

// Shapes confirmed by reading the live backend, not the (older) phased-plan
// doc — see backend/src/routes/auth.ts and backend/src/routes/health.ts.

data class HealthResponse(
    val status: String,
)

data class LoginRequest(
    val username: String,
    val password: String,
)

/** `POST /auth/guest`. [code] is left out of the JSON when null (Gson skips nulls); the server only reads it when the guest door is closed. */
data class GuestRequest(
    val code: String?,
)

/** Shared by `/auth/login` and `/auth/guest`: both hand back an ordinary session token. */
data class LoginResponse(
    val token: String,
)

data class MeResponse(
    val id: Int,
    val username: String,
    val isAdmin: Boolean,
    val isGuest: Boolean,
    val hasPasscode: Boolean,
)
