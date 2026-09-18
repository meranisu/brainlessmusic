package com.brainlessmusic.app.data.repository

import com.brainlessmusic.app.data.local.SessionStore
import com.brainlessmusic.app.data.remote.ApiService
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.MediaUrlProvider
import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LibraryRepository @Inject constructor(
    private val apiServiceFactory: ApiServiceFactory,
    private val sessionStore: SessionStore,
    private val mediaUrlProvider: MediaUrlProvider,
) {

    suspend fun getArtists(): Result<List<ArtistSummaryDto>> =
        callApi { it.artists().artists }

    suspend fun getArtistDetail(id: Int): Result<ArtistDetailDto> =
        callApi { it.artistDetail(id) }

    suspend fun getAlbumDetail(id: Int): Result<AlbumDetailDto> =
        callApi { it.albumDetail(id) }

    suspend fun search(query: String): Result<SearchResultsDto> =
        callApi { it.search(query) }

    /** `null` while there's no active session — the cover just won't load, same as any other network failure. */
    fun albumCoverUrl(albumId: Int): String? = mediaUrlProvider.current?.let { "${it}albums/$albumId/cover" }

    /** Falls back server-side to the album's cover when the track has none of its own (see backend/src/routes/tracks.ts). */
    fun trackCoverUrl(trackId: Int): String? = mediaUrlProvider.current?.let { "${it}tracks/$trackId/cover" }

    private suspend fun <T> callApi(block: suspend (ApiService) -> T): Result<T> {
        val serverUrl = sessionStore.serverUrl.first()
            ?: return Result.failure(ConnectionException(ConnectionError.Unreachable))
        return runCatching { block(apiServiceFactory.get(serverUrl)) }
            .recoverCatching { throw ConnectionException(classifyError(it)) }
    }
}
