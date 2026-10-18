package com.brainlessmusic.app.rooms

import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.dto.CreateRoomRequest
import com.brainlessmusic.app.data.remote.dto.RoomLookupDto
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.apiResult
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.RoomLink
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import retrofit2.HttpException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

data class RoomUiState(
    /** The joined room, or null. Kept through a reconnect, so the music and the room screen carry on. */
    val room: RoomState? = null,
    /** Our user id in the room. */
    val you: Int? = null,
    val connection: RoomConnection = RoomConnection.CONNECTING,
    /** Waiting for the first state after starting or joining a room. */
    val joining: Boolean = false,
) {
    val isHost: Boolean get() = room != null && room.hostUserId == you
}

/**
 * "Listen together" (A102): which room this phone is in, live. Owns the [RoomSocket] and puts [PlaybackController] in
 * room mode while a room is joined. A singleton next to the player, so it lives as long as the playback service keeps
 * the process: a locked phone stays in the room. Spec: `.docs/specs/room-sync.md`.
 */
@Singleton
class RoomSession @Inject constructor(
    private val controller: PlaybackController,
    okHttpClient: OkHttpClient,
    private val apiServiceFactory: ApiServiceFactory,
    private val serverConfig: ServerConfig,
    private val tokenProvider: TokenProvider,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // The shared client, with no read timeout: the socket can sit quiet between pings, and the pings watch it.
    private val socketClient = okHttpClient.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()

    private val _state = MutableStateFlow(RoomUiState())
    val state: StateFlow<RoomUiState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)

    /** One-line notices (the room ended, a rejected command), shown as a toast wherever the user is. */
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    private var socket: RoomSocket? = null

    private val link = object : RoomLink {
        override val live: Boolean
            get() = _state.value.connection == RoomConnection.LIVE && socket?.synced == true
        override val you: Int? get() = _state.value.you
        override fun send(command: RoomCommand) {
            socket?.send(command)
        }
        override fun serverNow(): Long = socket?.serverNow() ?: 0L
        override fun status(driftMs: Long?, buffering: Boolean) {
            socket?.status(driftMs, buffering)
        }
    }

    init {
        // Signed in (app start or a new sign-in): back into the room this account was in, if any. Signed out: stop the
        // socket; the server keeps us as away for its grace period, then drops us.
        scope.launch {
            tokenProvider.token.collect { token ->
                if (token == null) dropForSignOut() else rejoin()
            }
        }
    }

    private suspend fun rejoin() {
        if (socket != null) return
        val code = runCatching { apiServiceFactory.get(serverConfig.url).myRoom().code }.getOrNull() ?: return
        if (socket == null && tokenProvider.current != null) connect(code, quietIfGone = true)
    }

    private fun dropForSignOut() {
        socket?.stop()
        socket = null
        _state.value = RoomUiState()
        controller.exitRoom()
    }

    /**
     * Starts a room from what's playing. A queue past the room's 500 songs starts at the current one. Failure comes back
     * as a [ConnectionException]'s message.
     */
    suspend fun create(): Result<Unit> {
        val playing = controller.state.value
        val ids = playing.queue.map { it.trackId }
        val from = if (ids.size > MAX_QUEUE) playing.currentIndex.coerceAtLeast(0) else 0
        val request = CreateRoomRequest(
            trackIds = ids.drop(from).take(MAX_QUEUE),
            current = (playing.currentIndex - from).coerceAtLeast(0),
            positionMs = playing.positionMs,
            playing = playing.isPlaying,
        )
        return apiResult {
            val code = apiServiceFactory.get(serverConfig.url).createRoom(request).code ?: error("No room code came back")
            connect(code, quietIfGone = false)
        }
    }

    /** Who's in the room with this code, for the join screen. Success(null): no such room. */
    suspend fun lookup(code: String): Result<RoomLookupDto?> = apiResult {
        try {
            apiServiceFactory.get(serverConfig.url).lookupRoom(code)
        } catch (e: HttpException) {
            if (e.code() == 404) null else throw e
        }
    }

    fun join(code: String) = connect(code.trim().uppercase(), quietIfGone = false)

    /** Leaves for good. The music carries on here from where the room was. */
    fun leave() {
        val leaving = socket
        socket = null
        if (leaving?.leave() == false) {
            // Reconnecting: the socket couldn't carry it, so the leave goes over REST.
            scope.launch { runCatching { apiServiceFactory.get(serverConfig.url).leaveRoom() } }
        }
        _state.value = RoomUiState()
        controller.exitRoom()
    }

    /** Host only: ends the room for everyone. */
    fun end() = socket?.send(RoomCommand.End)

    /** Host only: takes someone out of the room. */
    fun kick(userId: Int) = socket?.send(RoomCommand.Kick(userId))

    private fun connect(code: String, quietIfGone: Boolean) {
        socket?.stop()
        _state.value = RoomUiState(joining = true)
        lateinit var created: RoomSocket
        created = RoomSocket(
            code = code,
            url = ApiServiceFactory.normalize(serverConfig.url) + "rooms/ws",
            client = socketClient,
            token = { tokenProvider.current },
            scope = scope,
            events = object : RoomSocket.Events {
                override fun onState(room: RoomState, you: Int?) {
                    if (socket !== created) return
                    val first = _state.value.room == null
                    _state.value = _state.value.copy(room = room, you = you ?: _state.value.you, joining = false)
                    if (first) controller.enterRoom(link)
                    controller.followRoom(room)
                }

                override fun onConnection(connection: RoomConnection) {
                    if (socket !== created) return
                    _state.value = _state.value.copy(connection = connection)
                    _state.value.room?.let(controller::followRoom)
                }

                override fun onClosed(reason: RoomClosedReason) {
                    if (socket !== created) return
                    socket = null
                    _state.value = RoomUiState()
                    controller.exitRoom()
                    if (reason == RoomClosedReason.NOT_FOUND && quietIfGone) return
                    reason.message?.let(_messages::tryEmit)
                }

                override fun onRejected(op: String, reason: String) {
                    rejectionMessage(reason)?.let(_messages::tryEmit)
                }
            },
        )
        socket = created
        created.connect()
    }

    private companion object {
        /** The server's queue cap (`MAX_QUEUE` in `backend/src/services/rooms.ts`). */
        const val MAX_QUEUE = 500
    }
}
