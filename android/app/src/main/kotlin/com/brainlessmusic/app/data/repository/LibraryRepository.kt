package com.brainlessmusic.app.data.repository

import com.brainlessmusic.app.data.remote.ApiService
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.MediaUrlProvider
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.GenreDetailDto
import com.brainlessmusic.app.data.remote.dto.GenresDto
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
import com.brainlessmusic.app.data.remote.dto.RadioPageDto
import com.brainlessmusic.app.data.remote.dto.DailyMixesDto
import com.brainlessmusic.app.data.remote.dto.OnThisDayDto
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

    /** Songs like [seedTrackId] (A234), leaving out [exclude]. The server takes at most 1000 ids; the newest matter. */
    suspend fun getRadio(seedTrackId: Int, seed: Int, exclude: List<Int>, limit: Int): Result<RadioPageDto> =
        callApi { it.radio(seedTrackId, seed, exclude.takeLast(1000).joinToString(",").ifEmpty { null }, limit) }

    /** Today's mixes; account only, so guests never ask. */
    suspend fun getDailyMixes(): Result<DailyMixesDto> = callApi { it.dailyMixes() }

    /** On this day, by this device's zone; account only, like the mixes. */
    suspend fun getOnThisDay(): Result<OnThisDayDto> = callApi { it.onThisDay(java.time.ZoneId.systemDefault().id) }

    suspend fun getArtistsPage(offset: Int, limit: Int): Result<ArtistsPageDto> =
        callApi { it.artists(limit, offset) }

    /** [scope] is `tracks`, `albums` or `artists`. */
    suspend fun getLetterIndex(scope: String): Result<LetterIndexDto> =
        callApi { it.letters(scope) }

    suspend fun getArtistDetail(id: Int): Result<ArtistDetailDto> =
        callApi { it.artistDetail(id) }

    suspend fun getAlbumDetail(id: Int): Result<AlbumDetailDto> =
        callApi { it.albumDetail(id) }

    suspend fun getGenres(): Result<GenresDto> =
        callApi { it.genres() }

    suspend fun getGenreDetail(id: Int): Result<GenreDetailDto> =
        callApi { it.genreDetail(id) }

    suspend fun getTrackDetail(id: Int): Result<TrackDetailDto> =
        callApi { it.trackDetail(id) }

    /** Kept for the process: peaks only change with the file. A failure (offline, busy, no file) is not kept. */
    private val waveforms = java.util.concurrent.ConcurrentHashMap<Int, List<Int>>()

    suspend fun waveform(trackId: Int): Result<List<Int>> {
        waveforms[trackId]?.let { return Result.success(it) }
        return callApi { it.waveform(trackId).peaks }.onSuccess { waveforms[trackId] = it }
    }

    suspend fun searchTracks(query: String, offset: Int, limit: Int) = callApi { it.searchTracks(query, offset, limit) }
    suspend fun searchArtists(query: String, offset: Int, limit: Int) = callApi { it.searchArtists(query, offset, limit) }
    suspend fun searchAlbums(query: String, offset: Int, limit: Int) = callApi { it.searchAlbums(query, offset, limit) }
    suspend fun searchPlaylists(query: String, offset: Int, limit: Int) = callApi { it.searchPlaylists(query, offset, limit) }
    suspend fun searchPeople(query: String, offset: Int, limit: Int) = callApi { it.searchPeople(query, offset, limit) }

    suspend fun search(query: String): Result<SearchResultsDto> =
        callApi { it.search(query) }

    /**
     * The new play's id (for [finishPlay]), or `null` for a guest or an older server. Guests are listen-only (A37): the
     * server refuses their plays, so they are not sent at all. [playedAt] (ISO) dates a play made offline (A87); null
     * is now. A [skipped] song (A113) is sent once, at its end, and counts for time listened only.
     */
    suspend fun scrobble(
        trackId: Int,
        msPlayed: Long,
        playedAt: String? = null,
        clientPlayId: String? = null,
        skipped: Boolean = false,
    ): Result<Int?> {
        if (tokenProvider.isGuest) return Result.success(null)
        val body = ScrobbleRequest(msPlayed, playedAt, clientPlayId, skipped.takeIf { it })
        return callApi { it.scrobble(trackId, body) }.map { it.playId }
    }

    /** Warms the server's converted copy of [trackId] so its first play doesn't wait for it. Best effort. */
    suspend fun prepareTrack(trackId: Int, dataSaver: Boolean): Result<Unit> =
        callApi { it.prepareTrack(trackId, if (dataSaver) "low" else null) }

    /** The play's real length, sent when the track ends, is skipped or pauses (A62). Later calls overwrite earlier ones. */
    suspend fun finishPlay(playId: Int, msPlayed: Long): Result<Unit> =
        callApi { it.finishPlay(playId, FinishPlayRequest(msPlayed)) }

    suspend fun loadPlaybackState(): Result<PlaybackStateDto?> =
        callApi { it.playbackState().state }

    suspend fun savePlaybackState(trackIds: List<Int>, index: Int, positionSeconds: Double, playing: Boolean): Result<Unit> =
        callApi { it.savePlaybackState(SavePlaybackStateRequest(trackIds, index, positionSeconds, playing)) }


    /** Seekable, and authenticated by the shared client's bearer header, so no `?token=` is needed. */
    /** [dataSaver] asks for the server's smaller copy; it serves the file instead when that is already small. */
    fun streamUrl(trackId: Int, dataSaver: Boolean = false): String? =
        mediaUrlProvider.current?.let { "${it}tracks/$trackId/stream" + if (dataSaver) "?quality=low" else "" }

    /** `null` with no session; the cover then fails to load like any network error. */
    fun albumCoverUrl(albumId: Int): String? = mediaUrlProvider.current?.let { "${it}albums/$albumId/cover" }

    /** Falls back server-side to the album's cover when the track has none of its own (see backend/src/routes/tracks.ts). */
    fun trackCoverUrl(trackId: Int): String? = mediaUrlProvider.current?.let { "${it}tracks/$trackId/cover" }

    /**
     * A failed call as a [ConnectionException]. Cancellation is rethrown instead: a search superseded by the next
     * keystroke was otherwise reported as an error, and the results flickered (C21, against A83).
     */
    private suspend fun <T> callApi(block: suspend (ApiService) -> T): Result<T> =
        apiResult { block(apiServiceFactory.get(serverConfig.url)) }
}
