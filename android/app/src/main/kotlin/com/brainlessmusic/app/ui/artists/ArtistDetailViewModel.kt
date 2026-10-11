package com.brainlessmusic.app.ui.artists

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.toMessage
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ArtistDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
) : ViewModel() {

    private val artistId: Int = checkNotNull(savedStateHandle[Routes.ARG_ARTIST_ID])

    private val _state = MutableStateFlow<LoadState<ArtistDetailDto>>(LoadState.Loading)
    val state: StateFlow<LoadState<ArtistDetailDto>> = _state.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    init {
        load()
    }

    /** Pull to refresh: what is shown stays up while it reloads, and stays if the reload fails. */
    /** [onFailed] gets a short line to show: the old content stays up, so a failure would otherwise look like success. */
    fun refresh(onFailed: (String) -> Unit) {
        viewModelScope.launch {
            _refreshing.value = true
            libraryRepository.getArtistDetail(artistId).fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { onFailed("Couldn't refresh. Check your connection.") },
            )
            _refreshing.value = false
        }
    }

    fun load() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            libraryRepository.getArtistDetail(artistId).fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = {
                    _state.value = LoadState.Error(
                        (it as? ConnectionException)?.error?.toMessage() ?: "Something went wrong.",
                    )
                },
            )
        }
    }

    fun albumCoverUrl(albumId: Int): String? = libraryRepository.albumCoverUrl(albumId)

    /**
     * The Play and Shuffle buttons: every song on the artist's albums, in album order. Shuffle turns shuffle on in the
     * last mode and starts from a random song. [onFailed] gets a short line when no album could be fetched.
     */
    fun playAll(shuffle: Boolean, onFailed: (String) -> Unit) {
        val detail = (_state.value as? LoadState.Content)?.data ?: return
        viewModelScope.launch {
            val albums = detail.albums
                .map { async { libraryRepository.getAlbumDetail(it.id).getOrNull() } }
                .awaitAll()
                .filterNotNull()
            val items = albums.flatMap { album -> album.tracks.map { libraryRepository.queueItem(album, it) } }
            if (items.isEmpty()) {
                onFailed("Couldn't load this artist's songs. Check your connection.")
                return@launch
            }
            playbackController.playQueue(
                items,
                if (shuffle) items.indices.random() else 0,
                shuffle = if (shuffle) true else null,
            )
        }
    }
}
