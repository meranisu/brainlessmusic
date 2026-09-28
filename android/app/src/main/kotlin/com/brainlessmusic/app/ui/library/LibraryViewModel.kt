package com.brainlessmusic.app.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.toMessage
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.ui.common.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class LibraryTab(val label: String) {
    SONGS("Songs"),
    ALBUMS("Albums"),
    ARTISTS("Artists"),
    GENRES("Genres"),
}

/** Items loaded so far out of [total]; the rest are fetched as the list is scrolled. */
data class Paged<T>(
    val items: List<T>,
    val total: Int,
    val loadingMore: Boolean = false,
) {
    val hasMore: Boolean get() = items.size < total
}

private const val PAGE_SIZE = 200

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val libraryRepository: LibraryRepository,
    private val authRepository: AuthRepository,
    private val playbackController: PlaybackController,
    private val playbackResume: PlaybackResume,
) : ViewModel() {

    private val _tab = MutableStateFlow(LibraryTab.SONGS)
    val tab: StateFlow<LibraryTab> = _tab.asStateFlow()

    private val _songs = MutableStateFlow<LoadState<Paged<TrackSummaryDto>>>(LoadState.Loading)
    val songs: StateFlow<LoadState<Paged<TrackSummaryDto>>> = _songs.asStateFlow()

    private val _albums = MutableStateFlow<LoadState<Paged<AlbumSummaryDto>>>(LoadState.Loading)
    val albums: StateFlow<LoadState<Paged<AlbumSummaryDto>>> = _albums.asStateFlow()

    private val _artists = MutableStateFlow<LoadState<List<ArtistSummaryDto>>>(LoadState.Loading)
    val artists: StateFlow<LoadState<List<ArtistSummaryDto>>> = _artists.asStateFlow()

    // A tab is fetched the first time it is shown, not all four up front.
    private val loaded = mutableSetOf<LibraryTab>()

    init {
        selectTab(LibraryTab.SONGS)
        // First screen after a login or a restored session: the earliest point a saved queue can be fetched.
        viewModelScope.launch { playbackResume.restore() }
    }

    fun selectTab(tab: LibraryTab) {
        _tab.value = tab
        if (loaded.add(tab)) load(tab)
    }

    /** Reloads whichever tab is showing. */
    fun refresh() = load(_tab.value)

    private fun load(tab: LibraryTab) {
        when (tab) {
            LibraryTab.SONGS -> viewModelScope.launch {
                _songs.value = LoadState.Loading
                libraryRepository.getTracksPage(0, PAGE_SIZE).fold(
                    onSuccess = { _songs.value = LoadState.Content(Paged(it.tracks, it.total)) },
                    onFailure = { _songs.value = LoadState.Error(it.message()) },
                )
            }
            LibraryTab.ALBUMS -> viewModelScope.launch {
                _albums.value = LoadState.Loading
                libraryRepository.getAlbumsPage(0, PAGE_SIZE).fold(
                    onSuccess = { _albums.value = LoadState.Content(Paged(it.albums, it.total)) },
                    onFailure = { _albums.value = LoadState.Error(it.message()) },
                )
            }
            LibraryTab.ARTISTS -> viewModelScope.launch {
                _artists.value = LoadState.Loading
                libraryRepository.getArtists().fold(
                    onSuccess = { _artists.value = LoadState.Content(it) },
                    onFailure = { _artists.value = LoadState.Error(it.message()) },
                )
            }
            LibraryTab.GENRES -> Unit // nothing to fetch: the server has no genre data yet
        }
    }

    fun loadMoreSongs() {
        val current = (_songs.value as? LoadState.Content)?.data ?: return
        if (!current.hasMore || current.loadingMore) return
        _songs.value = LoadState.Content(current.copy(loadingMore = true))
        viewModelScope.launch {
            libraryRepository.getTracksPage(current.items.size, PAGE_SIZE).fold(
                onSuccess = { _songs.value = LoadState.Content(Paged(current.items + it.tracks, it.total)) },
                // Keep what is already on screen; scrolling to the end again retries.
                onFailure = { _songs.value = LoadState.Content(current.copy(loadingMore = false)) },
            )
        }
    }

    fun loadMoreAlbums() {
        val current = (_albums.value as? LoadState.Content)?.data ?: return
        if (!current.hasMore || current.loadingMore) return
        _albums.value = LoadState.Content(current.copy(loadingMore = true))
        viewModelScope.launch {
            libraryRepository.getAlbumsPage(current.items.size, PAGE_SIZE).fold(
                onSuccess = { _albums.value = LoadState.Content(Paged(current.items + it.albums, it.total)) },
                onFailure = { _albums.value = LoadState.Content(current.copy(loadingMore = false)) },
            )
        }
    }

    fun albumCoverUrl(albumId: Int): String? = libraryRepository.albumCoverUrl(albumId)

    /** Everything loaded so far becomes the queue, starting at the tapped song. */
    fun playSongs(songs: List<TrackSummaryDto>, index: Int) {
        playbackController.playQueue(
            songs.map {
                QueueItem(
                    trackId = it.id,
                    title = it.title,
                    artist = it.artist,
                    album = it.album,
                    durationSec = it.duration,
                    coverUrl = libraryRepository.trackCoverUrl(it.id),
                )
            },
            index,
        )
    }

    fun logout(onLoggedOut: () -> Unit) {
        viewModelScope.launch {
            playbackController.stop()
            authRepository.logout()
            onLoggedOut()
        }
    }

    private fun Throwable.message(): String =
        (this as? ConnectionException)?.error?.toMessage() ?: "Something went wrong."
}
