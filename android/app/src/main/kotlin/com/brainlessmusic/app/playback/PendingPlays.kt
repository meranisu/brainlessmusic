package com.brainlessmusic.app.playback

import com.brainlessmusic.app.data.remote.NetworkMonitor
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.repository.ConnectionError
import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.downloads.PendingPlay
import com.brainlessmusic.app.downloads.PendingPlayDao
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** Where a play was recorded: on the server, or on the phone waiting for signal. */
sealed interface PlayRef {
    data class Server(val playId: Int) : PlayRef
    data class Local(val rowId: Long) : PlayRef
}

/**
 * Plays the server couldn't take when they happened (A87): no signal, or smol down. Each is kept with the time it
 * happened and sent, oldest first, once the server answers again; the server dates it from that time. Guests' plays
 * aren't counted at all (A37), so none are kept.
 */
@Singleton
class PendingPlays @Inject constructor(
    private val dao: PendingPlayDao,
    private val libraryRepository: LibraryRepository,
    private val tokenProvider: TokenProvider,
    private val networkMonitor: NetworkMonitor,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val sending = Mutex()
    private var retry: Job? = null

    /** The play still going on. Its length isn't final, so it waits until [close]: sent early, the rest would be lost. */
    @Volatile
    private var openRow: Long? = null

    init {
        // Also at start, since the flow begins with the current value.
        scope.launch { networkMonitor.online.collect { if (it) flush() } }
    }

    /** Records a play now, or `null` for a guest. */
    suspend fun add(trackId: Int, msPlayed: Long): PlayRef? {
        if (tokenProvider.isGuest) return null
        val id = dao.add(PendingPlay(trackId = trackId, msPlayed = msPlayed, playedAt = Instant.now().toString()))
        openRow = id
        return PlayRef.Local(id)
    }

    /** The play's real length so far (A62). */
    suspend fun setMsPlayed(ref: PlayRef.Local, msPlayed: Long) = dao.setMsPlayed(ref.rowId, msPlayed)

    /** The play has ended: it can go with the next send, which starts now if there's signal. */
    fun close(ref: PlayRef.Local) {
        if (openRow == ref.rowId) openRow = null
        flush()
    }

    fun flush() {
        scope.launch { send() }
    }

    /**
     * For logout: one last try to send, then forget the rest. They were this account's plays, and the next person to
     * sign in on this phone mustn't be credited with them.
     */
    suspend fun sendThenClear() {
        openRow = null
        withTimeoutOrNull(SEND_BEFORE_LOGOUT_MS) { send() }
        retry?.cancel()
        dao.clear()
    }

    /**
     * Sends what is waiting, in order. Stops at the first one the server can't take yet (no signal, signed out, a server
     * error) and keeps it, trying again in a few minutes while the phone is online; drops one the server refuses for
     * good (too old, or the song is gone).
     */
    private suspend fun send() = sending.withLock {
        // A guest's session would answer "sent" without sending (LibraryRepository.scrobble), losing the rows.
        if (tokenProvider.isGuest || tokenProvider.current == null) return@withLock
        for (play in dao.all()) {
            if (play.id == openRow) break
            val result = libraryRepository.scrobble(play.trackId, play.msPlayed, play.playedAt)
            if (result.isSuccess || result.exceptionOrNull().isRefusedForGood()) {
                dao.delete(play.id)
            } else {
                scheduleRetry()
                return@withLock
            }
        }
    }

    /** Staying on the same Wi-Fi while smol restarts changes nothing the network monitor sees, so retry on a timer. */
    private fun scheduleRetry() {
        if (retry?.isActive == true || !networkMonitor.online.value) return
        retry = scope.launch {
            delay(RETRY_MS)
            send()
        }
    }

    private companion object {
        const val RETRY_MS = 5 * 60 * 1000L
        const val SEND_BEFORE_LOGOUT_MS = 3_000L
    }
}

/**
 * The server looked at this play and said no (400: too old or malformed; 404: the song is gone), so sending it again
 * gets the same answer. Anything else, including Cloudflare's 403/429 and timeouts, may pass later.
 */
internal fun Throwable?.isRefusedForGood(): Boolean {
    val error = (this as? ConnectionException)?.error as? ConnectionError.Unknown ?: return false
    return error.detail == "HTTP 400" || error.detail == "HTTP 404"
}
