package com.brainlessmusic.app.data.remote

import com.brainlessmusic.app.data.remote.dto.HealthResponse
import com.brainlessmusic.app.data.remote.dto.LoginRequest
import com.brainlessmusic.app.data.remote.dto.LoginResponse
import com.brainlessmusic.app.data.remote.dto.MeResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Paths are relative to whatever base URL [ApiServiceFactory] builds — always
 * ending in `/api/`, matching backend/src/app.ts's API_PREFIX.
 */
interface ApiService {
    @GET("health")
    suspend fun health(): HealthResponse

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("auth/me")
    suspend fun me(): MeResponse
}
