package com.brainlessmusic.app.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.FlowPreview
import com.brainlessmusic.app.data.local.RecentSearches
import com.brainlessmusic.app.data.remote.dto.GenreSummaryDto
import com.brainlessmusic.app.data.remote.dto.SearchPageDto
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.data.remote.dto.PersonDto
import com.brainlessmusic.app.data.repository.toMessage
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.Notices
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

private val EMPTY_RESULTS = SearchResultsDto(artists = emptyList(), albums = emptyList(), tracks = emptyList())

/** The filter chips. [ALL] is every kind, a few each; the rest page through one kind ("See all"). */
enum class SearchKind(val label: String) {
    ALL("All"),
    SONGS("Songs"),
    ARTISTS("Artists"),
    ALBUMS("Albums"),
    PLAYLISTS("Playlists"),
    PEOPLE("People"),
}

/** One kind's results so far, while paging through "See all". */
data class KindResults(
    val kind: SearchKind,
    /** The search these pages are for; the next page asks for the same one, not whatever is typed now. */
    val query: String,
    val items: List<Any>,
    val hasMore: Boolean,
    val loadingMore: Boolean = false,
)

@OptIn(FlowPreview::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
    private val profileRepository: ProfileRepository,
    private val recentSearches: RecentSearches,
) : ViewModel() {

    fun avatarUrl(person: PersonDto): String? = profileRepository.avatarUrl(person.id, person.avatarId)

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _kind = MutableStateFlow(SearchKind.ALL)
    val kind: StateFlow<SearchKind> = _kind.asStateFlow()

    private val _state = MutableStateFlow<LoadState<SearchResultsDto>>(LoadState.Content(EMPTY_RESULTS))
    val state: StateFlow<LoadState<SearchResultsDto>> = _state.asStateFlow()

    private val _page = MutableStateFlow<LoadState<KindResults>?>(null)

    /** The chosen kind's pages, or null on All. */
    val page: StateFlow<LoadState<KindResults>?> = _page.asStateFlow()

    val recent: StateFlow<List<String>> =
        recentSearches.queries.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _genres = MutableStateFlow<List<GenreSummaryDto>>(emptyList())

    /** The biggest genres, to browse before typing. Empty if they don't load. */
    val genres: StateFlow<List<GenreSummaryDto>> = _genres.asStateFlow()

    private var pageJob: Job? = null

    init {
        viewModelScope.launch {
            combine(_query.debounce(300), _kind) { q, k -> q.trim() to k }
                .distinctUntilChanged()
                .collectLatest { (q, k) ->
                    when {
                        q.isEmpty() -> {
                            _state.value = LoadState.Content(EMPTY_RESULTS)
                            _page.value = null
                        }
                        k == SearchKind.ALL -> {
                            _page.value = null
                            runSearch(q)
                        }
                        else -> loadPage(q, k, reset = true)
                    }
                }
        }
        viewModelScope.launch {
            libraryRepository.getGenres().onSuccess { dto ->
                _genres.value = dto.genres.sortedByDescending { it.trackCount }.take(GENRES_SHOWN)
            }
        }
    }

    fun onQueryChange(value: String) {
        _query.value = value
    }

    fun setKind(kind: SearchKind) {
        _kind.value = kind
    }

    /** Runs a recent search or a suggestion: fills the box and searches every kind. */
    fun searchFor(query: String) {
        _kind.value = SearchKind.ALL
        _query.value = query
        remember()
    }

    /** Keeps what's typed as a recent search: on the keyboard's search key, or when a result is opened or played. */
    fun remember() {
        val q = _query.value.trim()
        if (q.isNotEmpty()) viewModelScope.launch { recentSearches.remember(q) }
    }

    fun forget(query: String) {
        viewModelScope.launch { recentSearches.forget(query) }
    }

    fun clearRecent() {
        viewModelScope.launch { recentSearches.clear() }
    }

    fun retry() {
        val q = _query.value.trim()
        if (q.isEmpty()) return
        viewModelScope.launch {
            if (_kind.value == SearchKind.ALL) runSearch(q) else loadPage(q, _kind.value, reset = true)
        }
    }

    private suspend fun runSearch(query: String) {
        // Previous results stay up until the new ones land (A83); the skeleton is only for a first search.
        if (!hasResults(_state.value)) _state.value = LoadState.Loading
        libraryRepository.search(query).fold(
            onSuccess = { _state.value = LoadState.Content(it) },
            onFailure = { _state.value = LoadState.Error(it.searchMessage()) },
        )
    }

    /** The next page of the chosen kind, for the end of its list. */
    fun loadMore() {
        val current = (_page.value as? LoadState.Content)?.data ?: return
        if (!current.hasMore || current.loadingMore || pageJob?.isActive == true) return
        pageJob = viewModelScope.launch { loadPage(current.query, current.kind, reset = false) }
    }

    private suspend fun loadPage(query: String, kind: SearchKind, reset: Boolean) {
        // A new search or kind drops a next page still on its way for the old one.
        if (reset) pageJob?.cancel()
        val before = (_page.value as? LoadState.Content)?.data?.takeIf { !reset && it.kind == kind && it.query == query }
        if (before == null) {
            _page.value = LoadState.Loading
        } else {
            _page.value = LoadState.Content(before.copy(loadingMore = true))
        }
        val offset = before?.items?.size ?: 0
        val result: Result<SearchPageDto<out Any>> = when (kind) {
            SearchKind.SONGS -> libraryRepository.searchTracks(query, offset, PAGE)
            SearchKind.ARTISTS -> libraryRepository.searchArtists(query, offset, PAGE)
            SearchKind.ALBUMS -> libraryRepository.searchAlbums(query, offset, PAGE)
            SearchKind.PLAYLISTS -> libraryRepository.searchPlaylists(query, offset, PAGE)
            SearchKind.PEOPLE -> libraryRepository.searchPeople(query, offset, PAGE)
            SearchKind.ALL -> return
        }
        result.fold(
            onSuccess = { dto ->
                // Only if this is still the search on screen.
                val now = (_page.value as? LoadState.Content)?.data
                if (before != null && (now?.query != query || now.kind != kind)) return@fold
                _page.value = LoadState.Content(KindResults(kind, query, before?.items.orEmpty() + dto.items, dto.hasMore))
            },
            onFailure = {
                if (before == null) {
                    _page.value = LoadState.Error(it.searchMessage())
                } else {
                    _page.value = LoadState.Content(before)
                    Notices.show(it.searchMessage())
                }
            },
        )
    }

    private fun Throwable.searchMessage() = (this as? ConnectionException)?.error?.toMessage() ?: "Something went wrong."

    private fun hasResults(state: LoadState<SearchResultsDto>): Boolean =
        state is LoadState.Content &&
            (
                state.data.artists.isNotEmpty() || state.data.albums.isNotEmpty() || state.data.tracks.isNotEmpty() ||
                    !state.data.playlists.isNullOrEmpty() || !state.data.people.isNullOrEmpty()
                )

    fun albumCoverUrl(albumId: Int): String? = libraryRepository.albumCoverUrl(albumId)

    fun trackCoverUrl(track: TrackSummaryDto): String? =
        track.albumId?.let(libraryRepository::albumCoverUrl) ?: libraryRepository.trackCoverUrl(track.id)

    /** For the song menu. */
    fun queueItem(track: TrackSummaryDto): QueueItem = libraryRepository.queueItem(track)

    /** The track results shown become the queue, starting at the one tapped. */
    fun playTracks(tracks: List<TrackSummaryDto>, index: Int) {
        remember()
        playbackController.playQueue(tracks.map(::queueItem), index)
    }

    /** Plays an album from its first song, from a search row's play button or the top result. */
    fun playAlbum(albumId: Int) {
        remember()
        viewModelScope.launch {
            libraryRepository.getAlbumDetail(albumId).fold(
                onSuccess = { album ->
                    if (album.tracks.isEmpty()) return@fold Notices.show("That album has no songs to play.")
                    playbackController.playQueue(album.tracks.map { libraryRepository.queueItem(album, it) }, 0)
                },
                onFailure = { Notices.show(it.searchMessage()) },
            )
        }
    }

    private companion object {
        const val PAGE = 30
        const val GENRES_SHOWN = 12
    }
}
