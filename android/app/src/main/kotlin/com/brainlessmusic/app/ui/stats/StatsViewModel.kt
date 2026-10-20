package com.brainlessmusic.app.ui.stats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.HistoryEntryDto
import com.brainlessmusic.app.data.remote.dto.ListeningPatternsDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.data.repository.StatsRange
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.profile.loadMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * What the Stats screen shows for one range: the totals and top lists, and when you listen. [patterns] is null when
 * that call failed, as it does on a server older than the Stats screen; the rest still shows.
 */
data class StatsPage(val stats: UserStatsDto, val patterns: ListeningPatternsDto?)

/** Every play so far, newest first, a page at a time. Not tied to the range. */
data class HistoryList(val rows: List<HistoryEntryDto>, val total: Int, val loading: Boolean, val failed: Boolean)

/** The Stats screen (A228): your own listening, opened from Home. Accounts only; Home doesn't offer it to guests. */
@HiltViewModel
class StatsViewModel @Inject constructor(
    private val profile: ProfileRepository,
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
) : ViewModel() {

    private val _range = MutableStateFlow(StatsRange.MONTH)
    val range: StateFlow<StatsRange> = _range.asStateFlow()

    private val _state = MutableStateFlow<LoadState<StatsPage>>(LoadState.Loading)
    val state: StateFlow<LoadState<StatsPage>> = _state.asStateFlow()

    /** True while another range loads over the one shown, which stays up, faded. */
    private val _switching = MutableStateFlow(false)
    val switching: StateFlow<Boolean> = _switching.asStateFlow()

    private val _history = MutableStateFlow(HistoryList(emptyList(), 0, loading = true, failed = false))
    val history: StateFlow<HistoryList> = _history.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
        loadMoreHistory()
    }

    fun setRange(range: StatsRange) {
        if (range == _range.value) return
        _range.value = range
        load()
    }

    fun load() {
        loadJob?.cancel()
        val shown = _state.value is LoadState.Content
        if (shown) _switching.value = true else _state.value = LoadState.Loading
        val range = _range.value
        loadJob = viewModelScope.launch {
            try {
                val stats = async { profile.stats(range) }
                val patterns = async { profile.listeningPatterns(range) }
                val s = stats.await()
                val p = patterns.await()
                _state.value = s.fold(
                    onSuccess = { LoadState.Content(StatsPage(it, p.getOrNull())) },
                    onFailure = { LoadState.Error(it.loadMessage()) },
                )
            } finally {
                _switching.value = false
            }
        }
    }

    fun loadMoreHistory() {
        val now = _history.value
        if (now.rows.isNotEmpty() && now.loading) return
        _history.value = now.copy(loading = true, failed = false)
        viewModelScope.launch {
            profile.historyPage(offset = now.rows.size, limit = HISTORY_PAGE).fold(
                onSuccess = { page -> _history.value = HistoryList(now.rows + page.history, page.total, loading = false, failed = false) },
                onFailure = { _history.value = now.copy(loading = false, failed = true) },
            )
        }
    }

    /** Plays the top songs as the queue, from the one tapped. */
    fun playTop(stats: UserStatsDto, index: Int) {
        playbackController.playQueue(stats.topTracks.map { libraryRepository.queueItem(it.track) }, index)
    }

    /** Plays the history from the row tapped; files that are gone are left out. */
    fun playHistory(entry: HistoryEntryDto) {
        val playable = _history.value.rows.filter { !it.missing }
        val index = playable.indexOf(entry)
        if (index >= 0) playbackController.playQueue(playable.map { libraryRepository.queueItem(it) }, index)
    }

    fun queueItem(track: TrackSummaryDto): QueueItem = libraryRepository.queueItem(track)

    fun queueItem(entry: HistoryEntryDto): QueueItem = libraryRepository.queueItem(entry)

    fun trackCoverUrl(trackId: Int): String? = libraryRepository.trackCoverUrl(trackId)

    private companion object {
        const val HISTORY_PAGE = 50
    }
}
