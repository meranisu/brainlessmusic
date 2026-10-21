package com.brainlessmusic.app.ui.together

import com.brainlessmusic.app.data.remote.dto.SocialPersonDto
import com.brainlessmusic.app.rooms.RoomInvites
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
import com.brainlessmusic.app.rooms.RoomMember
import com.brainlessmusic.app.data.repository.ProfileRepository

/** What the code typed so far turned up. */
sealed interface RoomLookup {
    data object Idle : RoomLookup
    data object Looking : RoomLookup
    data object Missing : RoomLookup
    data object Failed : RoomLookup
    data class Found(val room: RoomLookupDto) : RoomLookup
}

/** The invite picker's list (A255). */
sealed interface InviteList {
    data object Closed : InviteList
    data object Loading : InviteList
    data object Failed : InviteList
    data class Ready(val people: List<SocialPersonDto>) : InviteList
}

@HiltViewModel
class TogetherViewModel @Inject constructor(
    private val session: RoomSession,
    controller: PlaybackController,
    tokenProvider: TokenProvider,
    links: RoomLinks,
    private val library: LibraryRepository,
    private val profiles: ProfileRepository,
    private val invites: RoomInvites,
) : ViewModel() {
    val room: StateFlow<RoomUiState> = session.state
    val playback: StateFlow<PlaybackUiState> = controller.state
    val isGuest: Boolean = tokenProvider.isGuest

    /** A member's picture for the members list, or null to show their initial. */
    fun avatarUrl(member: RoomMember): String? = profiles.avatarUrl(member.userId, member.avatarId)

    /** Anyone's picture by id, for whoever added a song (A256); they may have left the room since. */
    fun avatarUrl(userId: Int, avatarId: String?): String? = profiles.avatarUrl(userId, avatarId)

    /** Host only: one room setting (A253). */
    fun updateSetting(key: String, value: Any) {
        session.updateSettings(mapOf(key to value))
    }

    private val _invitable = MutableStateFlow<InviteList>(InviteList.Closed)

    /** The invite picker (A255): closed, loading, failed, or the accounts that can be invited. */
    val invitable: StateFlow<InviteList> = _invitable.asStateFlow()

    fun openInvites() {
        _invitable.value = InviteList.Loading
        viewModelScope.launch {
            _invitable.value = invites.invitable().fold(
                onSuccess = { InviteList.Ready(it) },
                onFailure = { InviteList.Failed },
            )
        }
    }

    fun closeInvites() {
        _invitable.value = InviteList.Closed
    }

    private val _inviteMessage = MutableStateFlow<String?>(null)
    val inviteMessage: StateFlow<String?> = _inviteMessage.asStateFlow()

    fun sendInvites(userIds: List<Int>) {
        viewModelScope.launch {
            invites.send(userIds).fold(
                onSuccess = { sent ->
                    _inviteMessage.value = when {
                        sent == 0 -> "They already have an invite."
                        sent == 1 && userIds.size == 1 -> "Invite sent."
                        else -> "Invite sent to $sent people."
                    }
                    _invitable.value = InviteList.Closed
                },
                onFailure = { _inviteMessage.value = it.message ?: "Couldn't send the invite." },
            )
        }
    }

    fun inviteMessageShown() {
        _inviteMessage.value = null
    }

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
