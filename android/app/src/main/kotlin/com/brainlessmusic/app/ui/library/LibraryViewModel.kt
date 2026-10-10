package com.brainlessmusic.app.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.paging.cachedIn
import androidx.paging.map
import com.brainlessmusic.app.data.paging.OffsetPage
import com.brainlessmusic.app.data.paging.OffsetPagingSource
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.LetterEntryDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.playback.QueueSource
import com.brainlessmusic.app.playback.queueItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class LibraryTab(val label: String, val letterScope: String?) {
    SONGS("Songs", "tracks"),
    ALBUMS("Albums", "albums"),
    ARTISTS("Artists", "artists"),
    GENRES("Genres", null),
}

// Well under the server's hard cap of 200 rows per request (backend/src/utils/pagination.ts).
private const val PAGE_SIZE = 100

// Wait for a pause in typing before asking the server, so each keystroke is not a request.
private const val FILTER_DEBOUNCE_MS = 300L

// How many songs are fetched up front (the server's page cap); the queue is topped up from there as it runs down.
private const val QUEUE_FROM_TAP = 200

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
    private val playbackResume: PlaybackResume,
) : ViewModel() {

    private val _tab = MutableStateFlow(LibraryTab.SONGS)
    val tab: StateFlow<LibraryTab> = _tab.asStateFlow()

    // Each list is a pager over the server's list, so it knows its full length from the first page (see
    // OffsetPagingSource) and the rail can jump anywhere in it. Nothing is fetched until a tab is first shown.
    private val _songFilter = MutableStateFlow("")

    /** What is typed in the Songs filter, as typed. */
    val songFilter: StateFlow<String> = _songFilter.asStateFlow()

    /**
     * Each row carries the filter it was loaded under. The old list stays on screen until the new filter's first page
     * arrives, so a tap in that gap must play from the list it was made in, not the one on its way.
     */
    @OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
    val songs: Flow<PagingData<SongListRow>> = _songFilter
        .map { it.trim().ifEmpty { null } }
        .distinctUntilChanged()
        .debounce { if (it == null) 0L else FILTER_DEBOUNCE_MS } // clearing is instant
        .flatMapLatest { filter ->
            pager { offset, limit ->
                libraryRepository.getTracksPage(offset, limit, filter).map { OffsetPage(it.tracks, it.total) }
            }.map { page -> page.map { SongListRow(it, filter) } }
        }
        .cachedIn(viewModelScope)

    val albums: Flow<PagingData<AlbumSummaryDto>> = pager { offset, limit ->
        libraryRepository.getAlbumsPage(offset, limit).map { OffsetPage(it.albums, it.total) }
    }.cachedIn(viewModelScope)

    val artists: Flow<PagingData<ArtistSummaryDto>> = pager { offset, limit ->
        libraryRepository.getArtistsPage(offset, limit).map { OffsetPage(it.artists, it.total) }
    }.cachedIn(viewModelScope)

    private val _letters = MutableStateFlow<Map<LibraryTab, List<LetterEntryDto>>>(emptyMap())
    val letters: StateFlow<Map<LibraryTab, List<LetterEntryDto>>> = _letters.asStateFlow()

    init {
        selectTab(LibraryTab.SONGS)
        // First screen after a login or a restored session: the earliest point a saved queue can be fetched.
        viewModelScope.launch { playbackResume.restore() }
    }

    fun selectTab(tab: LibraryTab) {
        _tab.value = tab
        loadLetters(tab)
    }

    fun setSongFilter(text: String) {
        _songFilter.value = text
    }

    /** For pull to refresh: the list reloads itself, and the rail's letters may have moved with it. */
    fun reloadLetters(tab: LibraryTab) {
        loadLetters(tab, force = true)
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

    /**
     * Queues the tapped song and the ones after it in the list it was tapped in ([row]'s filter), topping up as it runs
     * down.
     */
    fun playSongsFrom(index: Int, row: SongListRow) {
        val filter = row.filter
        viewModelScope.launch {
            libraryRepository.getTracksPage(index, QUEUE_FROM_TAP, filter).onSuccess { page ->
                if (page.tracks.isEmpty()) return@onSuccess
                val next = index + page.tracks.size
                playbackController.playQueue(
                    items = page.tracks.map(libraryRepository::queueItem),
                    startIndex = 0,
                    source = if (next < page.total) QueueSource.Songs(next, filter) else null,
                )
            }
        }
    }

    /**
     * Plays the library in a seeded server shuffle (each song once per pass), in the mode picked on the shuffle button
     * (plain shuffle when it is off), with player shuffle on.
     */
    fun shuffleAll() {
        val pass = QueueSource.Shuffled.fresh(playbackController.libraryShuffleMode())
        viewModelScope.launch {
            libraryRepository.getShuffledPage(pass.seed, pass.mode.apiName ?: "shuffle", pass.asOf, 0, QUEUE_FROM_TAP).onSuccess { page ->
                if (page.tracks.isEmpty()) return@onSuccess
                playbackController.playQueue(
                    items = page.tracks.map(libraryRepository::queueItem),
                    startIndex = 0,
                    source = pass.copy(nextOffset = page.tracks.size),
                    shuffle = true,
                )
            }
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
        ).flow
}

/** A row of the Songs list, with the filter (`null`: none) the list it is in was loaded under. */
data class SongListRow(val track: TrackSummaryDto, val filter: String?)
