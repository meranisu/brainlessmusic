package com.brainlessmusic.app.data.remote

import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.AlbumsPageDto
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.data.remote.dto.ArtistsPageDto
import com.brainlessmusic.app.data.remote.dto.GuestRequest
import com.brainlessmusic.app.data.remote.dto.HealthResponse
import com.brainlessmusic.app.data.remote.dto.FinishPlayRequest
import com.brainlessmusic.app.data.remote.dto.LetterIndexDto
import com.brainlessmusic.app.data.remote.dto.LoginRequest
import com.brainlessmusic.app.data.remote.dto.LoginResponse
import com.brainlessmusic.app.data.remote.dto.MeResponse
import com.brainlessmusic.app.data.remote.dto.PlaybackStateResponse
import com.brainlessmusic.app.data.remote.dto.SavePlaybackStateRequest
import com.brainlessmusic.app.data.remote.dto.ScrobbleRequest
import com.brainlessmusic.app.data.remote.dto.ScrobbleResponse
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import com.brainlessmusic.app.data.remote.dto.ShuffledTracksPageDto
import com.brainlessmusic.app.data.remote.dto.TracksPageDto
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Paths are relative to the `/api/` base [ApiServiceFactory] builds. */
interface ApiService {
    @GET("health")
    suspend fun health(): HealthResponse

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @POST("auth/guest")
    suspend fun guest(@Body body: GuestRequest): LoginResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    // One page at the server's 200 cap (backend/src/utils/pagination.ts); every library here is well under it.
    @GET("artists")
    suspend fun artists(@Query("limit") limit: Int = 200, @Query("offset") offset: Int = 0): ArtistsPageDto

    @GET("albums")
    suspend fun albums(@Query("limit") limit: Int, @Query("offset") offset: Int): AlbumsPageDto

    // Sorted server-side so paging is stable; hidden/missing tracks are already excluded by default.
    @GET("tracks")
    suspend fun tracks(
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
        @Query("sort") sort: String = "title",
        // Title, artist or album; Retrofit leaves a null out of the URL.
        @Query("search") search: String? = null,
    ): TracksPageDto

    @GET("browse/shuffled")
    suspend fun shuffled(@Query("seed") seed: Int, @Query("limit") limit: Int, @Query("offset") offset: Int): ShuffledTracksPageDto

    @GET("browse/letters")
    suspend fun letters(@Query("scope") scope: String): LetterIndexDto

    @GET("artists/{id}")
    suspend fun artistDetail(@Path("id") id: Int): ArtistDetailDto

    @GET("albums/{id}")
    suspend fun albumDetail(@Path("id") id: Int): AlbumDetailDto

    @GET("search")
    suspend fun search(@Query("q") query: String): SearchResultsDto

    @POST("tracks/{id}/scrobble")
    suspend fun scrobble(@Path("id") id: Int, @Body body: ScrobbleRequest): ScrobbleResponse

    // Answers 204 with no body.
    @PATCH("me/history/{id}")
    suspend fun finishPlay(@Path("id") id: Int, @Body body: FinishPlayRequest)

    @GET("me/playback-state")
    suspend fun playbackState(): PlaybackStateResponse

    // Answers 204 with no body.
    @PUT("me/playback-state")
    suspend fun savePlaybackState(@Body body: SavePlaybackStateRequest)

    // "Play less often" (A60). All answer 204 or a body nobody reads; Unit discards it.
    @PUT("tracks/{id}/less-often")
    suspend fun markLessOften(@Path("id") id: Int)

    @DELETE("tracks/{id}/less-often")
    suspend fun unmarkLessOften(@Path("id") id: Int)

    @DELETE("me/less-often")
    suspend fun clearLessOften()
}
