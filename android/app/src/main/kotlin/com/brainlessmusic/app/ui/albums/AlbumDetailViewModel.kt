package com.brainlessmusic.app.ui.albums

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.toMessage
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.data.remote.dto.AlbumTrackDto
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AlbumDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
) : ViewModel() {

    val albumId: Int = checkNotNull(savedStateHandle[Routes.ARG_ALBUM_ID])

    private val _state = MutableStateFlow<LoadState<AlbumDetailDto>>(LoadState.Loading)
    val state: StateFlow<LoadState<AlbumDetailDto>> = _state.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    init {
        load()
    }

    /** Pull to refresh: what is shown stays up while it reloads, and stays if the reload fails. */
    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            libraryRepository.getAlbumDetail(albumId).onSuccess { _state.value = LoadState.Content(it) }
            _refreshing.value = false
        }
    }

    fun load() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            libraryRepository.getAlbumDetail(albumId).fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = {
                    _state.value = LoadState.Error(
                        (it as? ConnectionException)?.error?.toMessage() ?: "Something went wrong.",
                    )
                },
            )
        }
    }

    fun coverUrl(): String? = libraryRepository.albumCoverUrl(albumId)

    val playback: StateFlow<PlaybackUiState> = playbackController.state

    /** Plays the whole album as the queue, starting at [index]. */
    fun playFrom(album: AlbumDetailDto, index: Int) {
        playbackController.playQueue(album.tracks.map { libraryRepository.queueItem(album, it) }, index)
    }

    fun playNext(album: AlbumDetailDto, track: AlbumTrackDto) {
        playbackController.playNext(libraryRepository.queueItem(album, track))
    }
}
