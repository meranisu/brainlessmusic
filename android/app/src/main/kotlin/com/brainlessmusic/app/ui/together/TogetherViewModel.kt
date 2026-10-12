package com.brainlessmusic.app.ui.together

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.dto.RoomLookupDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.rooms.RoomLinks
import com.brainlessmusic.app.rooms.RoomSession
import com.brainlessmusic.app.rooms.RoomUiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch
import javax.inject.Inject

/** What the code typed so far turned up. */
sealed interface RoomLookup {
    data object Idle : RoomLookup
    data object Looking : RoomLookup
    data object Missing : RoomLookup
    data object Failed : RoomLookup
    data class Found(val room: RoomLookupDto) : RoomLookup
}

@HiltViewModel
class TogetherViewModel @Inject constructor(
    private val session: RoomSession,
    controller: PlaybackController,
    tokenProvider: TokenProvider,
    links: RoomLinks,
    private val library: LibraryRepository,
) : ViewModel() {
    val room: StateFlow<RoomUiState> = session.state
    val playback: StateFlow<PlaybackUiState> = controller.state
    val isGuest: Boolean = tokenProvider.isGuest

    private val _code = MutableStateFlow("")
    val code: StateFlow<String> = _code.asStateFlow()

    private val _lookup = MutableStateFlow<RoomLookup>(RoomLookup.Idle)
    val lookup: StateFlow<RoomLookup> = _lookup.asStateFlow()

    private val _starting = MutableStateFlow(false)
    val starting: StateFlow<Boolean> = _starting.asStateFlow()

    private val _startError = MutableStateFlow<String?>(null)
    val startError: StateFlow<String?> = _startError.asStateFlow()

    private var lookupJob: Job? = null

    private val _switchTo = MutableStateFlow<String?>(null)

    /** A room link's code while already in another room: offered as a switch instead of dropping the room unasked. */
    val switchTo: StateFlow<String?> = _switchTo.asStateFlow()

    init {
        // A link fills the code in and looks it up, so Join shows who's in before the tap that changes the music.
        viewModelScope.launch {
            links.pending.filterNotNull().collect {
                val code = links.take() ?: return@collect
                val current = session.state.value.room?.code
                when {
                    current == code -> Unit
                    current != null -> _switchTo.value = code
                    else -> onCodeChange(code)
                }
            }
        }
    }

    /** Leaves this room for the one the link named. */
    fun switchRooms() {
        val code = _switchTo.value ?: return
        _switchTo.value = null
        session.leave()
        session.join(code)
    }

    fun keepRoom() {
        _switchTo.value = null
    }

    /** Capitals only, from the letters a room code can hold (no I or O), six at most; looked up once complete. */
    fun onCodeChange(raw: String) {
        val clean = raw.uppercase().filter { it in RoomLinks.CODE_ALPHABET }.take(RoomLinks.CODE_LENGTH)
        if (clean == _code.value) return
        _code.value = clean
        lookupJob?.cancel()
        if (clean.length < RoomLinks.CODE_LENGTH) {
            _lookup.value = RoomLookup.Idle
            return
        }
        _lookup.value = RoomLookup.Looking
        lookupJob = viewModelScope.launch {
            delay(LOOKUP_DEBOUNCE_MS)
            _lookup.value = session.lookup(clean).fold(
                onSuccess = { found -> found?.let { RoomLookup.Found(it) } ?: RoomLookup.Missing },
                onFailure = { RoomLookup.Failed },
            )
        }
    }

    fun start() {
        if (_starting.value) return
        _starting.value = true
        _startError.value = null
        viewModelScope.launch {
            session.create().onFailure { _startError.value = it.message ?: "Couldn't start a room." }
            _starting.value = false
        }
    }

    fun join() {
        if (_lookup.value is RoomLookup.Found) session.join(_code.value)
    }

    fun coverUrl(trackId: Int): String? = library.trackCoverUrl(trackId)

    /** Leave, or stop trying to join. */
    fun leave() = session.leave()

    fun end() = session.end()

    fun kick(userId: Int) = session.kick(userId)

    private companion object {
        const val LOOKUP_DEBOUNCE_MS = 250L
    }
}
