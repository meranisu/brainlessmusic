package com.brainlessmusic.app.data.repository

import com.brainlessmusic.app.data.remote.ApiService
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.dto.AddPlaylistTrackRequest
import com.brainlessmusic.app.data.remote.dto.CreateSmartPlaylistRequest
import com.brainlessmusic.app.data.remote.dto.EditSmartRulesRequest
import com.brainlessmusic.app.data.remote.dto.SmartPreviewDto
import com.brainlessmusic.app.data.remote.dto.SmartPreviewRequest
import com.brainlessmusic.app.data.remote.dto.SmartRulesDto
import com.brainlessmusic.app.data.remote.dto.FavoritesPageDto
import com.brainlessmusic.app.data.remote.dto.HistoryEntryDto
import com.brainlessmusic.app.data.remote.dto.LessOftenPageDto
import com.brainlessmusic.app.data.remote.dto.PlaylistDetailDto
import com.brainlessmusic.app.data.remote.dto.PlaylistDetailsRequest
import com.brainlessmusic.app.data.remote.dto.PlaylistNameRequest
import com.brainlessmusic.app.data.remote.dto.PlaylistPublicRequest
import com.brainlessmusic.app.data.remote.dto.PublicPlaylistDto
import com.brainlessmusic.app.data.remote.dto.PlaylistRefDto
import com.brainlessmusic.app.data.remote.dto.PlaylistSummaryDto
import com.brainlessmusic.app.data.remote.dto.ReorderPlaylistRequest
import com.brainlessmusic.app.data.remote.dto.TrackStatDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.remote.dto.PersonDto
import com.brainlessmusic.app.data.remote.dto.ProfileDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.remote.MediaUrlProvider
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.HttpException
import javax.inject.Inject
import javax.inject.Singleton

enum class StatsRange(val query: String, val label: String) {
    WEEK("week", "Week"),
    MONTH("month", "Month"),
    YEAR("year", "Year"),
    ALL("all", "All time"),
}

enum class AddToPlaylistResult { ADDED, ALREADY_THERE, FAILED }

/**
 * The signed-in account's own things (profile, A61/A65): stats, liked songs, songs heard less, playlists. Accounts
 * only; guests are listen-only (A37), so callers check [isGuest] before offering any of it.
 */
@Singleton
class ProfileRepository @Inject constructor(
    private val apiServiceFactory: ApiServiceFactory,
    private val serverConfig: ServerConfig,
    private val tokenProvider: TokenProvider,
    private val mediaUrlProvider: MediaUrlProvider,
) {
    val isGuest: Boolean get() = tokenProvider.isGuest

    // One set for every screen, so a heart tapped on Now Playing shows on the You tab too.
    private val _likedIds = MutableStateFlow<Set<Int>>(emptySet())
    val likedIds: StateFlow<Set<Int>> = _likedIds.asStateFlow()
    private var likedLoaded = false

    /** Whether [likedIds] came from the server. Until it has, an empty heart may just mean "not loaded". */
    val likesLoaded: Boolean get() = likedLoaded

    // Like and unlike calls go out one at a time, in tap order, so a double tap can't reach the server reversed.
    private val likeMutex = Mutex()
    // Taps the server hasn't answered yet. A liked set that loads meanwhile keeps them on top, rather than undoing them.
    private val pendingLikes = HashMap<Int, Boolean>()

    // Disliked ("less often" on the server, A60; renamed Dislike, A153): one set too, so every heart shows it.
    private val _dislikedIds = MutableStateFlow<Set<Int>>(emptySet())
    val dislikedIds: StateFlow<Set<Int>> = _dislikedIds.asStateFlow()
    private var dislikedLoaded = false

    suspend fun stats(range: StatsRange): Result<UserStatsDto> = callApi { it.stats(range.query, TOP_LIMIT) }

    /** This account's numbers for one song, all time (A91). */
    suspend fun trackStat(trackId: Int): Result<TrackStatDto> = callApi { it.trackStat(trackId) }

    /**
     * The last [count] different songs played, newest first, skipping files that are gone. Reads a few plays per song,
     * since a song on repeat fills the history with itself.
     */
    suspend fun recentlyPlayed(count: Int): Result<List<HistoryEntryDto>> = callApi { api ->
        api.history(limit = count * 5).history.filter { !it.missing }.distinctBy { it.trackId }.take(count)
    }

    /** Loads the liked set once per process; [force] reloads it (pull to refresh, a new login). */
    suspend fun loadLikedIds(force: Boolean = false) {
        if (isGuest || (likedLoaded && !force)) return
        callApi { it.favoriteIds() }.onSuccess {
            val pending = pendingLikes.toMap()
            _likedIds.value = it.trackIds.toSet() + pending.filterValues { liked -> liked }.keys -
                pending.filterValues { liked -> !liked }.keys
            likedLoaded = true
        }
    }

    /** Loads the disliked set once per process; [force] reloads it. */
    suspend fun loadDislikedIds(force: Boolean = false) {
        if (isGuest || (dislikedLoaded && !force)) return
        callApi { it.lessOftenIds() }.onSuccess {
            _dislikedIds.value = it.trackIds.toSet()
            dislikedLoaded = true
        }
    }

    /**
     * Flips the heart at once, then tells the server, after any earlier taps. If the server says no, the set is reloaded:
     * with taps queued, putting back just this one could undo a later one.
     */
    suspend fun setLiked(trackId: Int, liked: Boolean): Result<Unit> {
        if (isGuest) return Result.success(Unit)
        // Liked or disliked, never both (A153).
        if (liked && trackId in _dislikedIds.value) setDisliked(trackId, false)
        pendingLikes[trackId] = liked
        _likedIds.update { if (liked) it + trackId else it - trackId }
        val result = likeMutex.withLock { callApi { if (liked) it.like(trackId) else it.unlike(trackId) } }
        if (pendingLikes[trackId] == liked) pendingLikes.remove(trackId)
        if (result.isFailure) {
            pendingLikes.remove(trackId)
            loadLikedIds(force = true)
        }
        return result
    }

    suspend fun likedPage(offset: Int, limit: Int): Result<FavoritesPageDto> = callApi { it.favorites(limit, offset) }

    suspend fun lessOftenPage(offset: Int, limit: Int): Result<LessOftenPageDto> = callApi { it.lessOften(limit, offset) }

    /**
     * Dislikes a song or takes it back (A153): shuffle picks a disliked song about one pass in four (A60). Shown at
     * once; reloaded if the server says no. Disliking a liked song unlikes it.
     */
    suspend fun setDisliked(trackId: Int, disliked: Boolean): Result<Unit> {
        if (isGuest) return Result.success(Unit)
        if (disliked && trackId in _likedIds.value) setLiked(trackId, false)
        _dislikedIds.update { if (disliked) it + trackId else it - trackId }
        val result = likeMutex.withLock { callApi { if (disliked) it.markLessOften(trackId) else it.unmarkLessOften(trackId) } }
        if (result.isFailure) loadDislikedIds(force = true)
        return result
    }

    /** Settings' reset: nothing disliked any more. */
    suspend fun clearDisliked(): Result<Unit> =
        callApi { it.clearLessOften() }.onSuccess { _dislikedIds.value = emptySet() }

    /** Your playlists; with [trackId], each also says whether it holds that song. */
    suspend fun playlists(trackId: Int? = null): Result<List<PlaylistSummaryDto>> = callApi { it.playlists(trackId).playlists }

    suspend fun playlist(id: Int): Result<PlaylistDetailDto> = callApi { it.playlist(id) }

    suspend fun createPlaylist(name: String): Result<PlaylistRefDto> = callApi { it.createPlaylist(PlaylistNameRequest(name)) }

    /** A smart playlist (A207): [rules] fill it each time it opens. */
    suspend fun createSmartPlaylist(name: String, rules: SmartRulesDto): Result<PlaylistRefDto> =
        callApi { it.createSmartPlaylist(CreateSmartPlaylistRequest(name, rules)) }

    suspend fun editSmartRules(id: Int, rules: SmartRulesDto): Result<PlaylistRefDto> =
        callApi { it.editSmartRules(id, EditSmartRulesRequest(rules)) }

    suspend fun previewSmartPlaylist(rules: SmartRulesDto): Result<SmartPreviewDto> =
        callApi { it.previewSmartPlaylist(SmartPreviewRequest(rules)) }

    suspend fun renamePlaylist(id: Int, name: String): Result<PlaylistRefDto> =
        callApi { it.renamePlaylist(id, PlaylistNameRequest(name)) }

    /** Name and description in one save (A185); an empty [description] clears it, a null [name] leaves it. */
    suspend fun editPlaylistDetails(id: Int, name: String?, description: String): Result<PlaylistRefDto> =
        callApi { it.editPlaylistDetails(id, PlaylistDetailsRequest(name, description)) }

    suspend fun deletePlaylist(id: Int): Result<Unit> = callApi { it.deletePlaylist(id) }

    /** Other people's public playlists (A162, A166). Guests too: they see and play them (A163). */
    suspend fun publicPlaylists(): Result<List<PublicPlaylistDto>> = callApi { it.publicPlaylists().playlists }

    suspend fun setPlaylistPublic(id: Int, isPublic: Boolean): Result<PlaylistRefDto> =
        callApi { it.setPlaylistPublic(id, PlaylistPublicRequest(isPublic)) }

    /** "Save a copy" (A162): a private playlist of your own with the same songs in the same order. */
    suspend fun copyPlaylist(id: Int): Result<PlaylistRefDto> = callApi { it.copyPlaylist(id) }

    suspend fun addToPlaylist(playlistId: Int, trackId: Int): AddToPlaylistResult =
        runCatching { api().addToPlaylist(playlistId, AddPlaylistTrackRequest(trackId)) }.fold(
            onSuccess = { AddToPlaylistResult.ADDED },
            onFailure = { if ((it as? HttpException)?.code() == 409) AddToPlaylistResult.ALREADY_THERE else AddToPlaylistResult.FAILED },
        )

    suspend fun removeFromPlaylist(playlistId: Int, trackId: Int): Result<Unit> =
        callApi { it.removeFromPlaylist(playlistId, trackId) }

    suspend fun reorderPlaylist(playlistId: Int, trackIds: List<Int>): Result<PlaylistDetailDto> =
        callApi { it.reorderPlaylist(playlistId, ReorderPlaylistRequest(trackIds)) }

    // Who you are, for Home's picture button (A171): the id opens your profile. Null until loaded, and for a guest.
    private val _me = MutableStateFlow<PersonDto?>(null)
    val me: StateFlow<PersonDto?> = _me.asStateFlow()

    /** Loads [me] from `/auth/me`; a guest has no profile, so it stays null. */
    suspend fun loadMe() {
        if (isGuest) return
        callApi { it.me() }.onSuccess { if (!it.isGuest) _me.value = PersonDto(it.id, it.displayName ?: it.username, it.avatarId) }
    }

    /** Everyone with a profile, most recently listening first (A170). Guests too. */
    suspend fun people(): Result<List<PersonDto>> = callApi { it.people().people }

    suspend fun profile(userId: Int, range: StatsRange): Result<ProfileDto> = callApi { it.profile(userId, range.query) }

    /** Someone's liked ([liked] true) or disliked songs, up to the server's cap. */
    suspend fun profileSongs(userId: Int, liked: Boolean): Result<List<TrackSummaryDto>> =
        callApi { it.profileSongs(userId, if (liked) "liked" else "disliked", PROFILE_SONGS_LIMIT).tracks }

    /** Saves your bio and pins (A169). Null clears; every field is sent, so this is the whole edit. */
    suspend fun updateProfile(bio: String?, favoriteTrackId: Int?, favoriteArtistId: Int?): Result<Unit> = callApi { api ->
        val body = JSONObject()
            .put("bio", bio ?: JSONObject.NULL)
            .put("favoriteTrackId", favoriteTrackId ?: JSONObject.NULL)
            .put("favoriteArtistId", favoriteArtistId ?: JSONObject.NULL)
        api.updateProfile(body.toString().toRequestBody(JSON))
    }

    /** A new picture from the phone; the server crops it square (A167). Null removes it. */
    suspend fun setAvatar(image: ByteArray?, mimeType: String?): Result<Unit> = callApi { api ->
        val avatarId = if (image == null) {
            api.removeAvatar()
            null
        } else {
            val part = MultipartBody.Part.createFormData(
                "file",
                "picture",
                image.toRequestBody((mimeType ?: "image/jpeg").toMediaType()),
            )
            api.uploadAvatar(part).avatarId
        }
        _me.value = _me.value?.copy(avatarId = avatarId)
    }

    /** The picture's URL, with its id in it so a new picture is never an old cached one. */
    fun avatarUrl(userId: Int, avatarId: String?): String? =
        avatarId?.let { id -> mediaUrlProvider.current?.let { "${it}users/$userId/avatar?v=$id" } }

    /** Forgets the liked set, for logout, so the next account doesn't see the last one's hearts. */
    fun clear() {
        _likedIds.value = emptySet()
        pendingLikes.clear()
        likedLoaded = false
        _dislikedIds.value = emptySet()
        dislikedLoaded = false
        _me.value = null
    }

    private fun api(): ApiService = apiServiceFactory.get(serverConfig.url)

    /**
     * A failed call as a [ConnectionException]. Cancellation is rethrown instead: a Week tap superseded by a Month tap
     * was otherwise reported as an error, and Home flashed its error and then its skeleton (as C21 in LibraryRepository).
     */
    private suspend fun <T> callApi(block: suspend (ApiService) -> T): Result<T> =
        apiResult { block(api()) }

    private companion object {
        const val TOP_LIMIT = 10
        const val PROFILE_SONGS_LIMIT = 200
        val JSON = "application/json".toMediaType()
    }
}
