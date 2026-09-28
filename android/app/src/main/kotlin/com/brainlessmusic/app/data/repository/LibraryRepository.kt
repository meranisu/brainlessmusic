package com.brainlessmusic.app.data.repository

import com.brainlessmusic.app.data.remote.ApiService
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.MediaUrlProvider
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.AlbumsPageDto
import com.brainlessmusic.app.data.remote.dto.ArtistsPageDto
import com.brainlessmusic.app.data.remote.dto.LetterIndexDto
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.PlaybackStateDto
import com.brainlessmusic.app.data.remote.dto.SavePlaybackStateRequest
import com.brainlessmusic.app.data.remote.dto.ScrobbleRequest
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import com.brainlessmusic.app.data.remote.dto.ShuffledTracksPageDto
import com.brainlessmusic.app.data.remote.dto.TracksPageDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LibraryRepository @Inject constructor(
    private val apiServiceFactory: ApiServiceFactory,
    private val serverConfig: ServerConfig,
    private val mediaUrlProvider: MediaUrlProvider,
) {

    suspend fun getArtists(): Result<List<ArtistSummaryDto>> =
        callApi { it.artists().artists }

    suspend fun getTracksPage(offset: Int, limit: Int): Result<TracksPageDto> =
        callApi { it.tracks(limit, offset) }

    suspend fun getAlbumsPage(offset: Int, limit: Int): Result<AlbumsPageDto> =
        callApi { it.albums(limit, offset) }

    /** A page of the whole library in the random order fixed by [seed]; the same seed always gives the same order. */
    suspend fun getShuffledPage(seed: Int, offset: Int, limit: Int): Result<ShuffledTracksPageDto> =
        callApi { it.shuffled(seed, limit, offset) }

    suspend fun getArtistsPage(offset: Int, limit: Int): Result<ArtistsPageDto> =
        callApi { it.artists(limit, offset) }

    /** [scope] is `tracks`, `albums` or `artists`. */
    suspend fun getLetterIndex(scope: String): Result<LetterIndexDto> =
        callApi { it.letters(scope) }

    suspend fun getArtistDetail(id: Int): Result<ArtistDetailDto> =
        callApi { it.artistDetail(id) }

    suspend fun getAlbumDetail(id: Int): Result<AlbumDetailDto> =
        callApi { it.albumDetail(id) }

    suspend fun search(query: String): Result<SearchResultsDto> =
        callApi { it.search(query) }

    suspend fun scrobble(trackId: Int, msPlayed: Long): Result<Unit> =
        callApi { it.scrobble(trackId, ScrobbleRequest(msPlayed)) }.map { }

    suspend fun loadPlaybackState(): Result<PlaybackStateDto?> =
        callApi { it.playbackState().state }

    suspend fun savePlaybackState(trackIds: List<Int>, index: Int, positionSeconds: Double): Result<Unit> =
        callApi { it.savePlaybackState(SavePlaybackStateRequest(trackIds, index, positionSeconds)) }

    /**
     * Byte-range seekable, and authenticated by the bearer header ExoPlayer's
     * OkHttp data source adds via the shared client — no `?token=` needed
     * (backend/src/plugins/auth.ts `authenticateMedia`).
     */
    fun streamUrl(trackId: Int): String? = mediaUrlProvider.current?.let { "${it}tracks/$trackId/stream" }

    /** `null` while there's no active session — the cover just won't load, same as any other network failure. */
    fun albumCoverUrl(albumId: Int): String? = mediaUrlProvider.current?.let { "${it}albums/$albumId/cover" }

    /** Falls back server-side to the album's cover when the track has none of its own (see backend/src/routes/tracks.ts). */
    fun trackCoverUrl(trackId: Int): String? = mediaUrlProvider.current?.let { "${it}tracks/$trackId/cover" }

    private suspend fun <T> callApi(block: suspend (ApiService) -> T): Result<T> {
        return runCatching { block(apiServiceFactory.get(serverConfig.url)) }
            .recoverCatching { throw ConnectionException(classifyError(it)) }
    }
}
