package com.brainlessmusic.app.data.remote

import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.data.remote.dto.ArtistsPageDto
import com.brainlessmusic.app.data.remote.dto.HealthResponse
import com.brainlessmusic.app.data.remote.dto.LoginRequest
import com.brainlessmusic.app.data.remote.dto.LoginResponse
import com.brainlessmusic.app.data.remote.dto.MeResponse
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

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

    // 200 is the server's own hard cap (backend/src/utils/pagination.ts) —
    // fetched as one page rather than built out as real infinite-scroll
    // paging, since nothing in the phased plan's Phase 1 done-when asks for
    // it and every library described in .docs/STATUS.md is well under it.
    @GET("artists")
    suspend fun artists(@Query("limit") limit: Int = 200, @Query("offset") offset: Int = 0): ArtistsPageDto

    @GET("artists/{id}")
    suspend fun artistDetail(@Path("id") id: Int): ArtistDetailDto

    @GET("albums/{id}")
    suspend fun albumDetail(@Path("id") id: Int): AlbumDetailDto

    @GET("search")
    suspend fun search(@Query("q") query: String): SearchResultsDto
}
