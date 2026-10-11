package com.brainlessmusic.app.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.FlowPreview
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.toMessage
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import javax.inject.Inject

private val EMPTY_RESULTS = SearchResultsDto(artists = emptyList(), albums = emptyList(), tracks = emptyList())

@OptIn(FlowPreview::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _state = MutableStateFlow<LoadState<SearchResultsDto>>(LoadState.Content(EMPTY_RESULTS))
    val state: StateFlow<LoadState<SearchResultsDto>> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _query.debounce(300).distinctUntilChanged().collectLatest { q ->
                if (q.isBlank()) {
                    _state.value = LoadState.Content(EMPTY_RESULTS)
                } else {
                    runSearch(q)
                }
            }
        }
    }

    fun onQueryChange(value: String) {
        _query.value = value
    }

    fun retry() {
        val q = _query.value
        if (q.isNotBlank()) {
            viewModelScope.launch { runSearch(q) }
        }
    }

    private suspend fun runSearch(query: String) {
        // Previous results stay up until the new ones land (A83); the skeleton is only for a first search.
        if (!hasResults(_state.value)) _state.value = LoadState.Loading
        libraryRepository.search(query).fold(
            onSuccess = { _state.value = LoadState.Content(it) },
            onFailure = {
                _state.value = LoadState.Error(
                    (it as? ConnectionException)?.error?.toMessage() ?: "Something went wrong.",
                )
            },
        )
    }

    private fun hasResults(state: LoadState<SearchResultsDto>): Boolean =
        state is LoadState.Content &&
            (state.data.artists.isNotEmpty() || state.data.albums.isNotEmpty() || state.data.tracks.isNotEmpty())

    fun albumCoverUrl(albumId: Int): String? = libraryRepository.albumCoverUrl(albumId)

    /** For the song menu. */
    fun queueItem(track: TrackSummaryDto): QueueItem = libraryRepository.queueItem(track)

    /** The visible track results become the queue, starting at the one tapped. */
    fun playTracks(tracks: List<TrackSummaryDto>, index: Int) {
        playbackController.playQueue(tracks.map(::queueItem), index)
    }
}
