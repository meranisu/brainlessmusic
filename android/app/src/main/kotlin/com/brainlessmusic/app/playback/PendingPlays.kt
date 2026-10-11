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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** Where a play was recorded: on the server, or on the phone waiting for signal. */
sealed interface PlayRef {
    data class Server(val playId: Int) : PlayRef
    data class Local(val rowId: Long) : PlayRef
}

/**
 * Plays made with no signal (A87). Each is kept with the time it happened and sent, oldest first, once the phone is
 * back online; the server dates it from that time. Guests' plays aren't counted at all (A37), so none are kept.
 */
@Singleton
class PendingPlays @Inject constructor(
    private val dao: PendingPlayDao,
    private val libraryRepository: LibraryRepository,
    private val tokenProvider: TokenProvider,
    networkMonitor: NetworkMonitor,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val sending = Mutex()

    init {
        scope.launch { networkMonitor.online.collect { if (it) flush() } }
    }

    /** Records a play now, or `null` for a guest. */
    suspend fun add(trackId: Int, msPlayed: Long): PlayRef? {
        if (tokenProvider.isGuest) return null
        return PlayRef.Local(dao.add(PendingPlay(trackId = trackId, msPlayed = msPlayed, playedAt = Instant.now().toString())))
    }

    /** The play's real length so far (A62). A row already sent keeps the length it went with. */
    suspend fun setMsPlayed(ref: PlayRef.Local, msPlayed: Long) = dao.setMsPlayed(ref.rowId, msPlayed)

    /**
     * Sends what is waiting, in order. Stops at the first one the server can't take yet (no signal, signed out, a server
     * error) and keeps it; drops one the server refuses for good (too old, or the song is gone).
     */
    fun flush() {
        scope.launch {
            sending.withLock {
                for (play in dao.all()) {
                    val result = libraryRepository.scrobble(play.trackId, play.msPlayed, play.playedAt)
                    if (result.isSuccess || result.exceptionOrNull().isRefusedForGood()) {
                        dao.delete(play.id)
                    } else {
                        return@withLock
                    }
                }
            }
        }
    }
}

/** A 4xx other than 401: sending it again would get the same answer. */
internal fun Throwable?.isRefusedForGood(): Boolean {
    val error = (this as? ConnectionException)?.error as? ConnectionError.Unknown ?: return false
    return error.detail?.startsWith("HTTP 4") == true
}
