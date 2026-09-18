package com.brainlessmusic.app.ui.artists

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.toMessage
import com.brainlessmusic.app.ui.common.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ArtistsListViewModel @Inject constructor(
    private val libraryRepository: LibraryRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<LoadState<List<ArtistSummaryDto>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<ArtistSummaryDto>>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            libraryRepository.getArtists().fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = {
                    _state.value = LoadState.Error(
                        (it as? ConnectionException)?.error?.toMessage() ?: "Something went wrong.",
                    )
                },
            )
        }
    }

    fun logout(onLoggedOut: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            onLoggedOut()
        }
    }
}
