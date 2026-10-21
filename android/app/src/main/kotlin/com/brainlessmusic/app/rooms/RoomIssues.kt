package com.brainlessmusic.app.rooms

import android.os.SystemClock
import android.util.Log
import com.brainlessmusic.app.BuildConfig
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.dto.RoomIssueReport
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import retrofit2.HttpException

/** What went wrong; [wire] matches `ROOM_ISSUE_KINDS` in `backend/src/db/roomIssues.ts`. */
enum class RoomIssueKind(val wire: String) {
    PARSE_FAILED("parse-failed"),
    SOCKET_FAILED("socket-failed"),
    SOCKET_CLOSED("socket-closed"),
    SERVER_ERROR("server-error"),
    SERVER_CLOSED("server-closed"),
    REQUEST_FAILED("request-failed"),
}

/**
 * The room issue log: Listen together problems the app would otherwise swallow (a room message that didn't parse, a
 * socket that kept dropping, a request that failed) go to `POST /rooms/issues`, for the admin Logs page. v0.4.27's rooms
 * broke on phones with nothing to show why; this is the trail. Every report is also a `Log.w`, so `adb logcat` has it
 * when the network doesn't. Best effort: a report that fails is dropped, never a toast.
 */
@Singleton
class RoomIssues @Inject constructor(
    private val apiServiceFactory: ApiServiceFactory,
    private val serverConfig: ServerConfig,
    private val tokenProvider: TokenProvider,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val sentAt = mutableMapOf<String, Long>()

    fun report(
        kind: RoomIssueKind,
        message: String,
        detail: String? = null,
        httpStatus: Int? = null,
        roomCode: String? = null,
    ) {
        Log.w(TAG, "${kind.wire}: $message" + (detail?.let { " ($it)" } ?: "") + (httpStatus?.let { " HTTP $it" } ?: ""))
        // Same kind and message again within a minute is dropped, so a reconnect loop leaves one row, not hundreds.
        val key = "${kind.wire}|$message"
        val now = SystemClock.elapsedRealtime()
        synchronized(sentAt) {
            val last = sentAt[key]
            if (last != null && now - last < REPEAT_MS) return
            sentAt[key] = now
        }
        if (tokenProvider.current == null) return
        val body = RoomIssueReport(
            source = "android",
            kind = kind.wire,
            message = message,
            detail = detail,
            httpStatus = httpStatus,
            roomCode = roomCode,
            appVersion = BuildConfig.VERSION_NAME,
        )
        scope.launch { runCatching { apiServiceFactory.get(serverConfig.url).reportRoomIssue(body) } }
    }

    /** [report] for a caught exception: an HTTP status when there is one, else the exception's class and text. */
    fun report(kind: RoomIssueKind, message: String, error: Throwable, roomCode: String? = null) =
        report(kind, message, describe(error), (error as? HttpException)?.code(), roomCode)

    /** Runs a room request, reporting a failure (not a cancellation) as `request-failed` before passing it on. */
    suspend fun <T> tracked(message: String, roomCode: String? = null, block: suspend () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            report(RoomIssueKind.REQUEST_FAILED, message, e, roomCode)
            throw e
        }

    private companion object {
        const val TAG = "RoomIssues"
        const val REPEAT_MS = 60_000L

        fun describe(error: Throwable): String =
            "${error.javaClass.simpleName}: ${error.message}" + (error.cause?.let { " <- ${it.javaClass.simpleName}: ${it.message}" } ?: "")
    }
}
