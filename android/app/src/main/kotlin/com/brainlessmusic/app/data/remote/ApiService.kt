package com.brainlessmusic.app.data.remote

import com.brainlessmusic.app.data.remote.dto.ActivityVisibilityRequest
import com.brainlessmusic.app.data.remote.dto.FeedPageDto
import com.brainlessmusic.app.data.remote.dto.NowPlayingDto
import com.brainlessmusic.app.data.remote.dto.AcceptInviteRequest
import com.brainlessmusic.app.data.remote.dto.AcceptInviteResponse
import com.brainlessmusic.app.data.remote.dto.AddPlaylistTrackRequest
import com.brainlessmusic.app.data.remote.dto.CreateSmartPlaylistRequest
import com.brainlessmusic.app.data.remote.dto.EditSmartRulesRequest
import com.brainlessmusic.app.data.remote.dto.SmartPreviewDto
import com.brainlessmusic.app.data.remote.dto.SmartPreviewRequest
import com.brainlessmusic.app.data.remote.dto.SmartRulesDto
import com.brainlessmusic.app.data.remote.dto.EmailRequest
import com.brainlessmusic.app.data.remote.dto.InvitePeek
import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.PlaylistDetailsRequest
import com.brainlessmusic.app.data.remote.dto.GenreDetailDto
import com.brainlessmusic.app.data.remote.dto.GenresDto
import com.brainlessmusic.app.data.remote.dto.TrackDetailDto
import com.brainlessmusic.app.data.remote.dto.WaveformDto
import com.brainlessmusic.app.data.remote.dto.AlbumsPageDto
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.data.remote.dto.ArtistsPageDto
import com.brainlessmusic.app.data.remote.dto.FavoriteIdsDto
import com.brainlessmusic.app.data.remote.dto.FavoritesPageDto
import com.brainlessmusic.app.data.remote.dto.DisplayNameRequest
import com.brainlessmusic.app.data.remote.dto.ThemeRequest
import com.brainlessmusic.app.data.remote.dto.DisplayNameResponse
import com.brainlessmusic.app.data.remote.dto.FinishPlayRequest
import com.brainlessmusic.app.data.remote.dto.GuestCodeRequestBody
import com.brainlessmusic.app.data.remote.dto.GuestCodeRequestCreated
import com.brainlessmusic.app.data.remote.dto.GuestRequest
import com.brainlessmusic.app.data.remote.dto.GuestRequestSecret
import com.brainlessmusic.app.data.remote.dto.GuestRequestStatus
import com.brainlessmusic.app.data.remote.dto.HealthResponse
import com.brainlessmusic.app.data.remote.dto.LessOftenPageDto
import com.brainlessmusic.app.data.remote.dto.LetterIndexDto
import com.brainlessmusic.app.data.remote.dto.LoginRequest
import com.brainlessmusic.app.data.remote.dto.LoginResponse
import com.brainlessmusic.app.data.remote.dto.MeResponse
import com.brainlessmusic.app.data.remote.dto.PlaybackStateResponse
import com.brainlessmusic.app.data.remote.dto.PlaylistDetailDto
import com.brainlessmusic.app.data.remote.dto.PlaylistNameRequest
import com.brainlessmusic.app.data.remote.dto.PlaylistPublicRequest
import com.brainlessmusic.app.data.remote.dto.PlaylistRefDto
import com.brainlessmusic.app.data.remote.dto.PlaylistsDto
import com.brainlessmusic.app.data.remote.dto.PublicPlaylistsDto
import com.brainlessmusic.app.data.remote.dto.ReorderPlaylistRequest
import com.brainlessmusic.app.data.remote.dto.SavePlaybackStateRequest
import com.brainlessmusic.app.data.remote.dto.ScrobbleRequest
import com.brainlessmusic.app.data.remote.dto.ScrobbleResponse
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import com.brainlessmusic.app.data.remote.dto.ShuffledTracksPageDto
import com.brainlessmusic.app.data.remote.dto.RadioPageDto
import com.brainlessmusic.app.data.remote.dto.DailyMixesDto
import com.brainlessmusic.app.data.remote.dto.OnThisDayDto
import com.brainlessmusic.app.data.remote.dto.TracksPageDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.remote.dto.TrackStatDto
import com.brainlessmusic.app.data.remote.dto.HistoryPageDto
import com.brainlessmusic.app.data.remote.dto.ListeningPatternsDto
import com.brainlessmusic.app.data.remote.dto.CreateRoomRequest
import com.brainlessmusic.app.data.remote.dto.RoomCodeResponse
import com.brainlessmusic.app.data.remote.dto.RoomLookupDto
import com.brainlessmusic.app.data.remote.dto.AvatarDto
import com.brainlessmusic.app.data.remote.dto.PeopleDto
import com.brainlessmusic.app.data.remote.dto.ProfileDto
import com.brainlessmusic.app.data.remote.dto.ProfileSongsDto
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Multipart
import retrofit2.http.Part
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.PersonDto
import com.brainlessmusic.app.data.remote.dto.PlaylistSearchDto
import com.brainlessmusic.app.data.remote.dto.SearchPageDto

/** Paths are relative to the `/api/` base [ApiServiceFactory] builds. */
interface ApiService {
    @GET("health")
    suspend fun health(): HealthResponse

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @POST("auth/guest")
    suspend fun guest(@Body body: GuestRequest): LoginResponse

    // Ends every session of this user, this one included (Q202). The fresh token it returns is not used: the phone signs out.
    @POST("auth/sessions/revoke")
    suspend fun revokeSessions(): LoginResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    // Sign-up with an invite code (A189-A192). The peek answers 404 for a code never issued, 429 when tried too often.
    @GET("invites/{code}")
    suspend fun peekInvite(@Path("code") code: String): InvitePeek

    @POST("invites/{code}/accept")
    suspend fun acceptInvite(@Path("code") code: String, @Body body: AcceptInviteRequest): AcceptInviteResponse

    // 409 when another account has it.
    @PUT("me/email")
    suspend fun setEmail(@Body body: EmailRequest): EmailRequest

    // "Request a code" (A67): queue it, poll it, or withdraw it. The poll answers 404 once collected or unknown.
    @POST("auth/guest/requests")
    suspend fun requestGuestCode(@Body body: GuestCodeRequestBody): GuestCodeRequestCreated

    @POST("auth/guest/requests/{id}/collect")
    suspend fun collectGuestCodeRequest(@Path("id") id: Int, @Body body: GuestRequestSecret): GuestRequestStatus

    // Answers 204 with no body.
    @POST("auth/guest/requests/{id}/cancel")
    suspend fun cancelGuestCodeRequest(@Path("id") id: Int, @Body body: GuestRequestSecret)

    // Answers 204 with no body.
    @PUT("me/theme")
    suspend fun setTheme(@Body body: ThemeRequest)

    @PUT("me/name")
    suspend fun setDisplayName(@Body body: DisplayNameRequest): DisplayNameResponse

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
    suspend fun shuffled(
        @Query("seed") seed: Int,
        @Query("mode") mode: String,
        @Query("asOf") asOf: Long,
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
    ): ShuffledTracksPageDto

    /** [exclude] is comma-separated ids already queued, so a refill never repeats one. */
    @GET("mix/radio")
    suspend fun radio(
        @Query("seedTrackId") seedTrackId: Int,
        @Query("seed") seed: Int,
        @Query("exclude") exclude: String?,
        @Query("limit") limit: Int,
    ): RadioPageDto

    @GET("mix/daily")
    suspend fun dailyMixes(): DailyMixesDto

    @GET("me/on-this-day")
    suspend fun onThisDay(@Query("tz") tz: String): OnThisDayDto

    @GET("browse/letters")
    suspend fun letters(@Query("scope") scope: String): LetterIndexDto

    @GET("artists/{id}")
    suspend fun artistDetail(@Path("id") id: Int): ArtistDetailDto

    @GET("albums/{id}")
    suspend fun albumDetail(@Path("id") id: Int): AlbumDetailDto

    @GET("genres")
    suspend fun genres(): GenresDto

    @GET("genres/{id}")
    suspend fun genreDetail(@Path("id") id: Int): GenreDetailDto

    @GET("tracks/{id}")
    suspend fun trackDetail(@Path("id") id: Int): TrackDetailDto

    @GET("tracks/{id}/waveform")
    suspend fun waveform(@Path("id") id: Int): WaveformDto

    @GET("search")
    suspend fun search(@Query("q") query: String): SearchResultsDto

    // One kind at a time, for "See all".
    @GET("search?type=tracks")
    suspend fun searchTracks(@Query("q") query: String, @Query("offset") offset: Int, @Query("limit") limit: Int): SearchPageDto<TrackSummaryDto>

    @GET("search?type=artists")
    suspend fun searchArtists(@Query("q") query: String, @Query("offset") offset: Int, @Query("limit") limit: Int): SearchPageDto<ArtistSummaryDto>

    @GET("search?type=albums")
    suspend fun searchAlbums(@Query("q") query: String, @Query("offset") offset: Int, @Query("limit") limit: Int): SearchPageDto<AlbumSummaryDto>

    @GET("search?type=playlists")
    suspend fun searchPlaylists(@Query("q") query: String, @Query("offset") offset: Int, @Query("limit") limit: Int): SearchPageDto<PlaylistSearchDto>

    @GET("search?type=people")
    suspend fun searchPeople(@Query("q") query: String, @Query("offset") offset: Int, @Query("limit") limit: Int): SearchPageDto<PersonDto>

    /** Asks the server to convert a track ahead of time; replies at once whatever it decides. */
    @POST("tracks/{id}/prepare")
    suspend fun prepareTrack(@Path("id") id: Int, @Query("quality") quality: String?)

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

    @GET("me/less-often/ids")
    suspend fun lessOftenIds(): FavoriteIdsDto

    // Profile (A61): stats, liked songs, songs heard less, playlists. Accounts only.
    @GET("me/stats")
    suspend fun stats(@Query("range") range: String, @Query("limit") limit: Int): UserStatsDto

    @GET("me/stats/patterns")
    suspend fun listeningPatterns(@Query("range") range: String, @Query("tz") tz: String): ListeningPatternsDto

    @GET("me/stats/tracks/{id}")
    suspend fun trackStat(@Path("id") id: Int): TrackStatDto

    @GET("me/history")
    suspend fun history(@Query("limit") limit: Int, @Query("offset") offset: Int = 0): HistoryPageDto

    @GET("me/favorites")
    suspend fun favorites(@Query("limit") limit: Int, @Query("offset") offset: Int): FavoritesPageDto

    @GET("me/favorites/ids")
    suspend fun favoriteIds(): FavoriteIdsDto

    @PUT("tracks/{id}/favorite")
    suspend fun like(@Path("id") id: Int)

    @DELETE("tracks/{id}/favorite")
    suspend fun unlike(@Path("id") id: Int)

    @GET("me/less-often")
    suspend fun lessOften(@Query("limit") limit: Int, @Query("offset") offset: Int): LessOftenPageDto

    /** With [trackId], each playlist says whether it already holds that song (`hasTrack`). */
    @GET("playlists")
    suspend fun playlists(@Query("trackId") trackId: Int?): PlaylistsDto

    @POST("playlists")
    suspend fun createPlaylist(@Body body: PlaylistNameRequest): PlaylistRefDto

    // Smart playlists (A207): rules instead of songs.
    @POST("playlists")
    suspend fun createSmartPlaylist(@Body body: CreateSmartPlaylistRequest): PlaylistRefDto

    @PATCH("playlists/{id}")
    suspend fun editSmartRules(@Path("id") id: Int, @Body body: EditSmartRulesRequest): PlaylistRefDto

    // What the rules pick now for the caller; saves nothing.
    @POST("playlists/smart/preview")
    suspend fun previewSmartPlaylist(@Body body: SmartPreviewRequest): SmartPreviewDto

    @GET("playlists/{id}")
    suspend fun playlist(@Path("id") id: Int): PlaylistDetailDto

    @PATCH("playlists/{id}")
    suspend fun renamePlaylist(@Path("id") id: Int, @Body body: PlaylistNameRequest): PlaylistRefDto

    @PATCH("playlists/{id}")
    suspend fun editPlaylistDetails(@Path("id") id: Int, @Body body: PlaylistDetailsRequest): PlaylistRefDto

    // Public playlists (A162-A166). Listing and reading them is open to guests too; the switch and copying are not.
    @GET("playlists/public")
    suspend fun publicPlaylists(): PublicPlaylistsDto

    @PATCH("playlists/{id}")
    suspend fun setPlaylistPublic(@Path("id") id: Int, @Body body: PlaylistPublicRequest): PlaylistRefDto

    @POST("playlists/{id}/copy")
    suspend fun copyPlaylist(@Path("id") id: Int): PlaylistRefDto

    @DELETE("playlists/{id}")
    suspend fun deletePlaylist(@Path("id") id: Int)

    // 409 when the song is already there.
    @POST("playlists/{id}/tracks")
    suspend fun addToPlaylist(@Path("id") id: Int, @Body body: AddPlaylistTrackRequest)

    @DELETE("playlists/{id}/tracks/{trackId}")
    suspend fun removeFromPlaylist(@Path("id") id: Int, @Path("trackId") trackId: Int)

    @PATCH("playlists/{id}/tracks/reorder")
    suspend fun reorderPlaylist(@Path("id") id: Int, @Body body: ReorderPlaylistRequest): PlaylistDetailDto

    // "Listen together" (A102). The live part is the WebSocket at rooms/ws (`rooms/RoomSocket.kt`).
    @POST("rooms")
    suspend fun createRoom(@Body body: CreateRoomRequest): RoomCodeResponse

    @GET("rooms/mine")
    suspend fun myRoom(): RoomCodeResponse

    // Answers 204 with no body. For a Leave pressed while the socket is reconnecting.
    @POST("rooms/leave")
    suspend fun leaveRoom()

    @GET("rooms/{code}")
    suspend fun lookupRoom(@Path("code") code: String): RoomLookupDto

    // Profiles (A167-A174). Anyone signed in reads them; only an account edits its own.
    @GET("people")
    suspend fun people(): PeopleDto

    // Friends' now playing and the activity feed (A239-A241). Accounts only; a guest gets 403.
    @GET("social/now-playing")
    suspend fun friendsNowPlaying(): NowPlayingDto

    @GET("social/feed")
    suspend fun friendsFeed(@Query("before") before: String?): FeedPageDto

    @PUT("me/activity-visibility")
    suspend fun setActivityHidden(@Body body: ActivityVisibilityRequest)

    @GET("users/{id}/profile")
    suspend fun profile(@Path("id") id: Int, @Query("range") range: String): ProfileDto

    /** `kind` is `liked` or `disliked`. */
    @GET("users/{id}/{kind}")
    suspend fun profileSongs(@Path("id") id: Int, @Path("kind") kind: String, @Query("limit") limit: Int): ProfileSongsDto

    // A raw JSON body: a pin cleared is sent as null, which Gson would leave out (and left out means "unchanged").
    @PUT("me/profile")
    suspend fun updateProfile(@Body body: RequestBody)

    @Multipart
    @PUT("me/avatar")
    suspend fun uploadAvatar(@Part file: MultipartBody.Part): AvatarDto

    @DELETE("me/avatar")
    suspend fun removeAvatar()
}
