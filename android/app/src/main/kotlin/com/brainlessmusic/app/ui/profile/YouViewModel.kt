package com.brainlessmusic.app.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.HistoryEntryDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.data.repository.StatsRange
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The You tab (A61): who you are and what you listen to, over a range you pick. */
@HiltViewModel
class YouViewModel @Inject constructor(
    private val profile: ProfileRepository,
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
    authRepository: AuthRepository,
) : ViewModel() {

    val isGuest: Boolean = profile.isGuest

    val username: StateFlow<String?> = flow { emit(authRepository.savedUsername()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _range = MutableStateFlow(StatsRange.MONTH)
    val range: StateFlow<StatsRange> = _range.asStateFlow()

    private val _state = MutableStateFlow<LoadState<UserStatsDto>>(LoadState.Loading)
    val state: StateFlow<LoadState<UserStatsDto>> = _state.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    // Recently played (A91) doesn't follow the range. A failed load keeps the last list rather than blanking the row.
    private val _recent = MutableStateFlow<List<HistoryEntryDto>>(emptyList())
    val recent: StateFlow<List<HistoryEntryDto>> = _recent.asStateFlow()

    init {
        if (!isGuest) {
            load()
            loadRecent()
        }
    }

    private var recentJob: Job? = null

    private fun loadRecent() {
        recentJob?.cancel()
        recentJob = viewModelScope.launch { profile.recentlyPlayed(RECENT_COUNT).onSuccess { _recent.value = it } }
    }

    fun setRange(range: StatsRange) {
        if (range == _range.value) return
        _range.value = range
        load()
    }

    // One stats request at a time. A newer one cancels the older, so a slow Month answer can't land under Week.
    private var statsJob: Job? = null

    fun load() {
        statsJob?.cancel()
        statsJob = viewModelScope.launch {
            _refreshing.value = false
            _state.value = LoadState.Loading
            profile.stats(_range.value).fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { _state.value = LoadState.Error(it.loadMessage()) },
            )
        }
    }

    /** Pull to refresh: what is shown stays up while it reloads. */
    fun refresh() {
        if (isGuest) return
        reload(showSpinner = true)
        loadRecent()
    }

    /** Coming back to the tab: counts may have changed elsewhere (a song unliked, a playlist made). No spinner. */
    fun onResume() {
        if (isGuest || _state.value !is LoadState.Content) return
        reload(showSpinner = false)
        loadRecent()
    }

    private fun reload(showSpinner: Boolean) {
        statsJob?.cancel()
        statsJob = viewModelScope.launch {
            _refreshing.value = showSpinner
            try {
                profile.stats(_range.value).onSuccess { _state.value = LoadState.Content(it) }
            } finally {
                _refreshing.value = false
            }
        }
    }

    /** Plays your top songs as the queue, from the one tapped. */
    fun playTop(stats: UserStatsDto, index: Int) {
        playbackController.playQueue(stats.topTracks.map { libraryRepository.queueItem(it.track) }, index)
    }

    /** Play all / Shuffle on Top songs. Shuffle starts on a random song; a start of 0 would always open on #1. */
    fun playAllTop(stats: UserStatsDto, shuffle: Boolean) {
        if (stats.topTracks.isEmpty()) return
        val start = if (shuffle) stats.topTracks.indices.random() else 0
        playbackController.playQueue(
            stats.topTracks.map { libraryRepository.queueItem(it.track) },
            start,
            shuffle = if (shuffle) true else null,
        )
    }

    /** Plays the recently played row as the queue, from the one tapped. Takes the list on screen: a reload may have replaced [recent]. */
    fun playRecent(recent: List<HistoryEntryDto>, index: Int) {
        if (index in recent.indices) playbackController.playQueue(recent.map { libraryRepository.queueItem(it) }, index)
    }

    /** For the song menu. */
    fun queueItem(track: TrackSummaryDto): QueueItem = libraryRepository.queueItem(track)

    fun queueItem(entry: HistoryEntryDto): QueueItem = libraryRepository.queueItem(entry)

    fun trackCoverUrl(trackId: Int): String? = libraryRepository.trackCoverUrl(trackId)

    fun albumCoverUrl(albumId: Int): String? = libraryRepository.albumCoverUrl(albumId)

    private companion object {
        const val RECENT_COUNT = 12
    }
}
