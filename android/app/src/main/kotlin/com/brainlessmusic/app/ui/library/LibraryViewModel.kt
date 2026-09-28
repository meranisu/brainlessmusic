package com.brainlessmusic.app.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.paging.cachedIn
import com.brainlessmusic.app.data.paging.OffsetPage
import com.brainlessmusic.app.data.paging.OffsetPagingSource
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.LetterEntryDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.playback.QueueSource
import com.brainlessmusic.app.playback.queueItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.random.Random

enum class LibraryTab(val label: String, val letterScope: String?) {
    SONGS("Songs", "tracks"),
    ALBUMS("Albums", "albums"),
    ARTISTS("Artists", "artists"),
    GENRES("Genres", null),
}

// Well under the server's hard cap of 200 rows per request (backend/src/utils/pagination.ts).
private const val PAGE_SIZE = 100

// How many songs are fetched up front (the server's page cap); the queue is topped up from there as it runs down.
private const val QUEUE_FROM_TAP = 200

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val libraryRepository: LibraryRepository,
    private val authRepository: AuthRepository,
    private val playbackController: PlaybackController,
    private val playbackResume: PlaybackResume,
) : ViewModel() {

    private val _tab = MutableStateFlow(LibraryTab.SONGS)
    val tab: StateFlow<LibraryTab> = _tab.asStateFlow()

    // Each list is a pager over the server's list, so it knows its full length from the first page (see
    // OffsetPagingSource) and the rail can jump anywhere in it. Nothing is fetched until a tab is first shown.
    val songs: Flow<PagingData<TrackSummaryDto>> = pager { offset, limit ->
        libraryRepository.getTracksPage(offset, limit).map { OffsetPage(it.tracks, it.total) }
    }

    val albums: Flow<PagingData<AlbumSummaryDto>> = pager { offset, limit ->
        libraryRepository.getAlbumsPage(offset, limit).map { OffsetPage(it.albums, it.total) }
    }

    val artists: Flow<PagingData<ArtistSummaryDto>> = pager { offset, limit ->
        libraryRepository.getArtistsPage(offset, limit).map { OffsetPage(it.artists, it.total) }
    }

    private val _letters = MutableStateFlow<Map<LibraryTab, List<LetterEntryDto>>>(emptyMap())
    val letters: StateFlow<Map<LibraryTab, List<LetterEntryDto>>> = _letters.asStateFlow()

    /** Set by the screen for the tab showing, so Refresh reaches that tab's list. */
    private var refreshCurrent: () -> Unit = {}

    init {
        selectTab(LibraryTab.SONGS)
        // First screen after a login or a restored session: the earliest point a saved queue can be fetched.
        viewModelScope.launch { playbackResume.restore() }
    }

    fun selectTab(tab: LibraryTab) {
        _tab.value = tab
        loadLetters(tab)
    }

    fun registerRefresh(refresh: () -> Unit) {
        refreshCurrent = refresh
    }

    /** Reloads whichever tab is showing, letters included. */
    fun refresh() {
        loadLetters(_tab.value, force = true)
        refreshCurrent()
    }

    private fun loadLetters(tab: LibraryTab, force: Boolean = false) {
        val scope = tab.letterScope ?: return
        if (!force && _letters.value.containsKey(tab)) return
        viewModelScope.launch {
            // A failure just leaves the rail off; the list itself still works.
            libraryRepository.getLetterIndex(scope).onSuccess { index ->
                _letters.update { it + (tab to index.letters) }
            }
        }
    }

    fun albumCoverUrl(albumId: Int): String? = libraryRepository.albumCoverUrl(albumId)

    /** Queues the tapped song and the ones after it, in list order — and keeps adding from the library as the queue runs down. */
    fun playSongsFrom(index: Int) {
        viewModelScope.launch {
            libraryRepository.getTracksPage(index, QUEUE_FROM_TAP).onSuccess { page ->
                if (page.tracks.isEmpty()) return@onSuccess
                val next = index + page.tracks.size
                playbackController.playQueue(
                    items = page.tracks.map(libraryRepository::queueItem),
                    startIndex = 0,
                    source = if (next < page.total) QueueSource.Songs(next) else null,
                )
            }
        }
    }

    /**
     * Plays the whole library in a random order: a seeded shuffle from the server, so each song comes up once
     * before any repeats, and a fresh shuffle starts when a pass ends. Turns the player's shuffle on, so the
     * batch on hand is also spread by artist.
     */
    fun shuffleAll() {
        val seed = Random.nextInt(Int.MAX_VALUE)
        viewModelScope.launch {
            libraryRepository.getShuffledPage(seed, 0, QUEUE_FROM_TAP).onSuccess { page ->
                if (page.tracks.isEmpty()) return@onSuccess
                playbackController.playQueue(
                    items = page.tracks.map(libraryRepository::queueItem),
                    startIndex = 0,
                    source = QueueSource.Shuffled(seed, page.tracks.size),
                    shuffle = true,
                )
            }
        }
    }

    fun logout(onLoggedOut: () -> Unit) {
        viewModelScope.launch {
            playbackController.stop()
            authRepository.logout()
            onLoggedOut()
        }
    }

    private fun <T : Any> pager(fetch: suspend (offset: Int, limit: Int) -> Result<OffsetPage<T>>): Flow<PagingData<T>> =
        Pager(
            config = PagingConfig(
                pageSize = PAGE_SIZE,
                initialLoadSize = PAGE_SIZE,
                prefetchDistance = PAGE_SIZE / 2,
                enablePlaceholders = true,
                // Scrolling further than this past what is loaded reloads at the target row instead of paging
                // through every page in between.
                jumpThreshold = PAGE_SIZE * 2,
            ),
            pagingSourceFactory = { OffsetPagingSource(fetch) },
        ).flow.cachedIn(viewModelScope)
}
