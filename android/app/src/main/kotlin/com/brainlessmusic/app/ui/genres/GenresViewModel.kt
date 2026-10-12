package com.brainlessmusic.app.ui.genres

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.GenreDetailDto
import com.brainlessmusic.app.data.remote.dto.GenreSummaryDto
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

/** Every genre from the files' genre tags (v0.4), biggest first: a few hundred names A-Z bury the ones people play. */
@HiltViewModel
class GenresViewModel @Inject constructor(
    private val libraryRepository: LibraryRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<LoadState<List<GenreSummaryDto>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<GenreSummaryDto>>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            libraryRepository.getGenres().fold(
                onSuccess = { dto ->
                    _state.value = LoadState.Content(
                        dto.genres.sortedWith(compareByDescending<GenreSummaryDto> { it.trackCount }.thenBy { it.name.lowercase() }),
                    )
                },
                onFailure = {
                    _state.value = LoadState.Error(
                        (it as? ConnectionException)?.error?.toMessage() ?: "Something went wrong.",
                    )
                },
            )
        }
    }
}

/** One genre's albums. */
@HiltViewModel
class GenreDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val libraryRepository: LibraryRepository,
) : ViewModel() {

    private val genreId: Int = checkNotNull(savedStateHandle[Routes.ARG_GENRE_ID])

    private val _state = MutableStateFlow<LoadState<GenreDetailDto>>(LoadState.Loading)
    val state: StateFlow<LoadState<GenreDetailDto>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            libraryRepository.getGenreDetail(genreId).fold(
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
