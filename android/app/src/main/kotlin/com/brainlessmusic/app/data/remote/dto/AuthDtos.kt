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
