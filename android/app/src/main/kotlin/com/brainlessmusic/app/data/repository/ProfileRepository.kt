package com.brainlessmusic.app.data.repository

import com.brainlessmusic.app.data.remote.ApiService
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.dto.AddPlaylistTrackRequest
import com.brainlessmusic.app.data.remote.dto.FavoritesPageDto
import com.brainlessmusic.app.data.remote.dto.HistoryEntryDto
import com.brainlessmusic.app.data.remote.dto.LessOftenPageDto
import com.brainlessmusic.app.data.remote.dto.PlaylistDetailDto
import com.brainlessmusic.app.data.remote.dto.PlaylistNameRequest
import com.brainlessmusic.app.data.remote.dto.PlaylistRefDto
import com.brainlessmusic.app.data.remote.dto.PlaylistSummaryDto
import com.brainlessmusic.app.data.remote.dto.ReorderPlaylistRequest
import com.brainlessmusic.app.data.remote.dto.TrackStatDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.HttpException
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException

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

    // Disliked ("less often" on the server, A60; renamed Dislike, A148): one set too, so every heart shows it.
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
        // Liked or disliked, never both (A148).
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
     * Dislikes a song or takes it back (A148): shuffle picks a disliked song about one pass in four (A60). Shown at
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

    suspend fun playlists(): Result<List<PlaylistSummaryDto>> = callApi { it.playlists().playlists }

    suspend fun playlist(id: Int): Result<PlaylistDetailDto> = callApi { it.playlist(id) }

    suspend fun createPlaylist(name: String): Result<PlaylistRefDto> = callApi { it.createPlaylist(PlaylistNameRequest(name)) }

    suspend fun renamePlaylist(id: Int, name: String): Result<PlaylistRefDto> =
        callApi { it.renamePlaylist(id, PlaylistNameRequest(name)) }

    suspend fun deletePlaylist(id: Int): Result<Unit> = callApi { it.deletePlaylist(id) }

    suspend fun addToPlaylist(playlistId: Int, trackId: Int): AddToPlaylistResult =
        runCatching { api().addToPlaylist(playlistId, AddPlaylistTrackRequest(trackId)) }.fold(
            onSuccess = { AddToPlaylistResult.ADDED },
            onFailure = { if ((it as? HttpException)?.code() == 409) AddToPlaylistResult.ALREADY_THERE else AddToPlaylistResult.FAILED },
        )

    suspend fun removeFromPlaylist(playlistId: Int, trackId: Int): Result<Unit> =
        callApi { it.removeFromPlaylist(playlistId, trackId) }

    suspend fun reorderPlaylist(playlistId: Int, trackIds: List<Int>): Result<PlaylistDetailDto> =
        callApi { it.reorderPlaylist(playlistId, ReorderPlaylistRequest(trackIds)) }

    /** Forgets the liked set, for logout, so the next account doesn't see the last one's hearts. */
    fun clear() {
        _likedIds.value = emptySet()
        pendingLikes.clear()
        likedLoaded = false
        _dislikedIds.value = emptySet()
        dislikedLoaded = false
    }

    private fun api(): ApiService = apiServiceFactory.get(serverConfig.url)

    /**
     * A failed call as a [ConnectionException]. Cancellation is rethrown instead: a Week tap superseded by a Month tap
     * was otherwise reported as an error, and Home flashed its error and then its skeleton (as C21 in LibraryRepository).
     */
    private suspend fun <T> callApi(block: suspend (ApiService) -> T): Result<T> =
        try {
            Result.success(block(api()))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(ConnectionException(classifyError(e)))
        }

    private companion object {
        const val TOP_LIMIT = 10
    }
}
