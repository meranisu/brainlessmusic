package com.brainlessmusic.app.data.repository

import com.brainlessmusic.app.data.remote.ApiService
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.MediaUrlProvider
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.AlbumsPageDto
import com.brainlessmusic.app.data.remote.dto.ArtistsPageDto
import com.brainlessmusic.app.data.remote.dto.FinishPlayRequest
import com.brainlessmusic.app.data.remote.dto.LetterIndexDto
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.PlaybackStateDto
import com.brainlessmusic.app.data.remote.dto.SavePlaybackStateRequest
import com.brainlessmusic.app.data.remote.dto.ScrobbleRequest
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import com.brainlessmusic.app.data.remote.dto.ShuffledTracksPageDto
import com.brainlessmusic.app.data.remote.dto.TrackDetailDto
import com.brainlessmusic.app.data.remote.dto.TracksPageDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LibraryRepository @Inject constructor(
    private val apiServiceFactory: ApiServiceFactory,
    private val serverConfig: ServerConfig,
    private val mediaUrlProvider: MediaUrlProvider,
    private val tokenProvider: TokenProvider,
) {

    suspend fun getArtists(): Result<List<ArtistSummaryDto>> =
        callApi { it.artists().artists }

    /** [search] narrows to titles, artists or albums containing it; the order stays by title. */
    suspend fun getTracksPage(offset: Int, limit: Int, search: String? = null): Result<TracksPageDto> =
        callApi { it.tracks(limit, offset, search = search) }

    suspend fun getAlbumsPage(offset: Int, limit: Int): Result<AlbumsPageDto> =
        callApi { it.albums(limit, offset) }

    /** A page of the whole library in the random order fixed by [seed]; the same seed always gives the same order. */
    /** [mode] is a [com.brainlessmusic.app.playback.ShuffleMode.apiName]; [asOf] is when the pass started, in Unix seconds. */
    suspend fun getShuffledPage(seed: Int, mode: String, asOf: Long, offset: Int, limit: Int): Result<ShuffledTracksPageDto> =
        callApi { it.shuffled(seed, mode, asOf, limit, offset) }

    suspend fun getArtistsPage(offset: Int, limit: Int): Result<ArtistsPageDto> =
        callApi { it.artists(limit, offset) }

    /** [scope] is `tracks`, `albums` or `artists`. */
    suspend fun getLetterIndex(scope: String): Result<LetterIndexDto> =
        callApi { it.letters(scope) }

    suspend fun getArtistDetail(id: Int): Result<ArtistDetailDto> =
        callApi { it.artistDetail(id) }

    suspend fun getAlbumDetail(id: Int): Result<AlbumDetailDto> =
        callApi { it.albumDetail(id) }

    suspend fun getTrackDetail(id: Int): Result<TrackDetailDto> =
        callApi { it.trackDetail(id) }

    suspend fun search(query: String): Result<SearchResultsDto> =
        callApi { it.search(query) }

    /** Guests are listen-only (A37): the server refuses their plays, so they are not sent at all. */
    /** The new play's id (for [finishPlay]), or `null` for a guest or an older server. */
    suspend fun scrobble(trackId: Int, msPlayed: Long): Result<Int?> {
        if (tokenProvider.isGuest) return Result.success(null)
        return callApi { it.scrobble(trackId, ScrobbleRequest(msPlayed)) }.map { it.playId }
    }

    /** The play's real length, sent when the track ends, is skipped or pauses (A62). Later calls overwrite earlier ones. */
    suspend fun finishPlay(playId: Int, msPlayed: Long): Result<Unit> =
        callApi { it.finishPlay(playId, FinishPlayRequest(msPlayed)) }

    suspend fun loadPlaybackState(): Result<PlaybackStateDto?> =
        callApi { it.playbackState().state }

    suspend fun savePlaybackState(trackIds: List<Int>, index: Int, positionSeconds: Double, playing: Boolean): Result<Unit> =
        callApi { it.savePlaybackState(SavePlaybackStateRequest(trackIds, index, positionSeconds, playing)) }

    /** "Play less often" (A60): accounts only, so a guest's swipe is never sent. */
    suspend fun setLessOften(trackId: Int, lessOften: Boolean): Result<Unit> {
        if (tokenProvider.isGuest) return Result.success(Unit)
        return callApi { if (lessOften) it.markLessOften(trackId) else it.unmarkLessOften(trackId) }
    }

    suspend fun clearLessOften(): Result<Unit> = callApi { it.clearLessOften() }

    /** Seekable, and authenticated by the shared client's bearer header, so no `?token=` is needed. */
    /** [dataSaver] asks for the server's smaller copy; it serves the file instead when that is already small. */
    fun streamUrl(trackId: Int, dataSaver: Boolean = false): String? =
        mediaUrlProvider.current?.let { "${it}tracks/$trackId/stream" + if (dataSaver) "?quality=low" else "" }

    /** `null` with no session; the cover then fails to load like any network error. */
    fun albumCoverUrl(albumId: Int): String? = mediaUrlProvider.current?.let { "${it}albums/$albumId/cover" }

    /** Falls back server-side to the album's cover when the track has none of its own (see backend/src/routes/tracks.ts). */
    fun trackCoverUrl(trackId: Int): String? = mediaUrlProvider.current?.let { "${it}tracks/$trackId/cover" }

    private suspend fun <T> callApi(block: suspend (ApiService) -> T): Result<T> {
        return runCatching { block(apiServiceFactory.get(serverConfig.url)) }
            .recoverCatching { throw ConnectionException(classifyError(it)) }
    }
}
