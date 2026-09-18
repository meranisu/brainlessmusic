package com.brainlessmusic.app.ui.artists

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.toMessage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ArtistDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val libraryRepository: LibraryRepository,
) : ViewModel() {

    private val artistId: Int = checkNotNull(savedStateHandle[Routes.ARG_ARTIST_ID])

    private val _state = MutableStateFlow<LoadState<ArtistDetailDto>>(LoadState.Loading)
    val state: StateFlow<LoadState<ArtistDetailDto>> = _state.asStateFlow()

    init {
        load()
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
}
