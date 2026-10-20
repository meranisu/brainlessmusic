package com.brainlessmusic.app.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.DailyMixDto
import com.brainlessmusic.app.data.remote.dto.OnThisDayYearDto
import com.brainlessmusic.app.data.remote.dto.HistoryEntryDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.data.repository.StatsRange
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import com.brainlessmusic.app.data.remote.dto.PersonDto
import javax.inject.Inject
import kotlin.random.Random

/** What a guest's Home shows: the library's size, and some songs and albums picked at random to start from. */
data class GuestHome(
    val songs: Int,
    val albums: Int,
    val artists: Int,
    val picks: List<TrackSummaryDto>,
    val albumPicks: List<AlbumPick>,
)

/** An album to try, taken from a random song on it. */
data class AlbumPick(val id: Int, val title: String, val artist: String?)

/** Songs in a guest's "Songs to try" row. */
internal const val GUEST_PICKS = 12

/** Albums in a guest's "Albums to try" row. */
internal const val GUEST_ALBUM_PICKS = 10

/** The playable songs of a shuffled page, first [GUEST_PICKS] of them. */
internal fun guestPicks(shuffled: List<TrackSummaryDto>): List<TrackSummaryDto> =
    shuffled.filter { !it.missing && !it.hidden }.take(GUEST_PICKS)

/**
 * Albums from a shuffled page, in its order, once each. The songs already in "Songs to try" are skipped first, so the
 * two rows don't open on the same records; when that leaves too few, they're used after all.
 */
internal fun guestAlbumPicks(shuffled: List<TrackSummaryDto>, picks: List<TrackSummaryDto>): List<AlbumPick> {
    val inPicks = picks.mapNotNull { it.albumId }.toSet()
    val (fresh, repeats) = shuffled.filter { it.albumId != null && !it.missing && !it.hidden }.partition { it.albumId !in inPicks }
    return (fresh + repeats)
        .distinctBy { it.albumId }
        .take(GUEST_ALBUM_PICKS)
        .map { AlbumPick(it.albumId!!, it.album ?: "Unknown album", it.artist) }
}

/** The Home tab (A97, was You, A61): something to play, then what you listen to over a range you pick. */
@HiltViewModel
class YouViewModel @Inject constructor(
    private val profile: ProfileRepository,
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
    playbackResume: PlaybackResume,
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

    // A new range is loading while the old one stays on screen, dimmed, so the page doesn't drop to a skeleton.
    private val _switching = MutableStateFlow(false)
    val switching: StateFlow<Boolean> = _switching.asStateFlow()

    // Recently played (A91) doesn't follow the range. A failed load keeps the last list rather than blanking the row.
    private val _recent = MutableStateFlow<List<HistoryEntryDto>>(emptyList())
    val recent: StateFlow<List<HistoryEntryDto>> = _recent.asStateFlow()

    // Today's mixes (A234, A236); the same all day on the server, so loaded at start and on pull, not on every return.
    private val _mixes = MutableStateFlow<List<DailyMixDto>>(emptyList())
    val mixes: StateFlow<List<DailyMixDto>> = _mixes.asStateFlow()

    // On this day: earlier years' plays on today's date, loaded with the mixes.
    private val _onThisDay = MutableStateFlow<List<OnThisDayYearDto>>(emptyList())
    val onThisDay: StateFlow<List<OnThisDayYearDto>> = _onThisDay.asStateFlow()

    // A guest's Home (A98): no stats, so the library and some random picks instead.
    private val _guest = MutableStateFlow<LoadState<GuestHome>>(LoadState.Loading)
    val guest: StateFlow<LoadState<GuestHome>> = _guest.asStateFlow()

    /** You, for the top bar's picture button (A171). Null for a guest, who has no profile. */
    val me: StateFlow<PersonDto?> = profile.me

    fun avatarUrl(person: PersonDto): String? = profile.avatarUrl(person.id, person.avatarId)

    init {
        // Home is the first screen after a cold start, so the mini player's saved song is fetched here too, not only
        // when Library opens.
        viewModelScope.launch { playbackResume.restore() }
        if (isGuest) {
            loadGuest()
        } else {
            load()
            loadRecent()
            loadMixes()
            viewModelScope.launch { profile.loadMe() }
        }
    }

    private var guestJob: Job? = null

    /** A fresh random pick each time; [keepShown] leaves the old picks up, with the pull spinner, until it lands. */
    fun loadGuest(keepShown: Boolean = false) {
        guestJob?.cancel()
        guestJob = viewModelScope.launch {
            if (keepShown && _guest.value is LoadState.Content) _refreshing.value = true else _guest.value = LoadState.Loading
            try {
                val seed = Random.nextInt(0, Int.MAX_VALUE)
                val now = System.currentTimeMillis() / 1000
                val shuffled = async { libraryRepository.getShuffledPage(seed, "shuffle", now, 0, GUEST_PAGE) }
                val albums = async { libraryRepository.getAlbumsPage(0, 1) }
                val artists = async { libraryRepository.getArtistsPage(0, 1) }
                val page = shuffled.await().getOrElse { return@launch fail(it, keepShown) }
                val albumTotal = albums.await().getOrElse { return@launch fail(it, keepShown) }.total
                val artistTotal = artists.await().getOrElse { return@launch fail(it, keepShown) }.total
                val picks = guestPicks(page.tracks)
                _guest.value = LoadState.Content(
                    GuestHome(page.total, albumTotal, artistTotal, picks, guestAlbumPicks(page.tracks, picks)),
                )
            } finally {
                if (guestJob === coroutineContext.job) _refreshing.value = false
            }
        }
    }

    /** A failed reroll keeps the picks already up; only a first load shows the error. */
    private fun fail(error: Throwable, keepShown: Boolean) {
        if (!keepShown || _guest.value !is LoadState.Content) _guest.value = LoadState.Error(error.loadMessage())
    }

    /** Plays "Songs to try" as the queue, from the one tapped. */
    fun playPick(picks: List<TrackSummaryDto>, index: Int) {
        if (index in picks.indices) playbackController.playQueue(picks.map { libraryRepository.queueItem(it) }, index)
    }

    private var recentJob: Job? = null

    private fun loadMixes() {
        viewModelScope.launch {
            libraryRepository.getDailyMixes().onSuccess { daily -> _mixes.value = daily.mixes.filter { it.tracks.isNotEmpty() } }
        }
        viewModelScope.launch {
            libraryRepository.getOnThisDay().onSuccess { result -> _onThisDay.value = result.years.filter { it.tracks.isNotEmpty() } }
        }
    }

    /** Plays that year's songs from this date, most played first. */
    fun playYear(year: OnThisDayYearDto) {
        val items = year.tracks.map { libraryRepository.queueItem(it) }
        if (items.isNotEmpty()) playbackController.playQueue(items, 0)
    }

    /** Plays a mix, then keeps going as a radio from its first song. */
    fun playMix(mix: DailyMixDto) {
        val items = mix.tracks.map { libraryRepository.queueItem(it) }
        if (items.isNotEmpty()) playbackController.startRadio(items.first(), items)
    }

    private fun loadRecent() {
        recentJob?.cancel()
        recentJob = viewModelScope.launch { profile.recentlyPlayed(RECENT_COUNT).onSuccess { _recent.value = it } }
    }

    fun setRange(range: StatsRange) {
        if (range == _range.value) return
        _range.value = range
        if (_state.value !is LoadState.Content) {
            load()
            return
        }
        statsJob?.cancel()
        statsJob = viewModelScope.launch {
            _refreshing.value = false
            _switching.value = true
            try {
                profile.stats(range).fold(
                    onSuccess = { _state.value = LoadState.Content(it) },
                    onFailure = { _state.value = LoadState.Error(it.loadMessage()) },
                )
            } finally {
                // A newer pick cancels this one; leave the dimming to it.
                if (statsJob === coroutineContext.job) _switching.value = false
            }
        }
    }

    // One stats request at a time. A newer one cancels the older, so a slow Month answer can't land under Week.
    private var statsJob: Job? = null

    fun load() {
        statsJob?.cancel()
        statsJob = viewModelScope.launch {
            _refreshing.value = false
            _switching.value = false
            _state.value = LoadState.Loading
            profile.stats(_range.value).fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { _state.value = LoadState.Error(it.loadMessage()) },
            )
        }
    }

    /** Pull to refresh: what is shown stays up while it reloads. */
    fun refresh() {
        if (isGuest) return loadGuest(keepShown = true)
        reload(showSpinner = true)
        loadRecent()
        loadMixes()
    }

    /** Coming back to the tab: counts may have changed elsewhere (a song unliked, a playlist made). No spinner. */
    fun onResume() {
        // A picture changed on the profile shows here on the way back.
        if (!isGuest) viewModelScope.launch { profile.loadMe() }
        if (isGuest || _state.value !is LoadState.Content) return
        reload(showSpinner = false)
        loadRecent()
    }

    private fun reload(showSpinner: Boolean) {
        statsJob?.cancel()
        statsJob = viewModelScope.launch {
            _refreshing.value = showSpinner
            _switching.value = false
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

        // Enough songs that the album row still has ten different albums after skipping the song picks' own.
        const val GUEST_PAGE = 60
    }
}
