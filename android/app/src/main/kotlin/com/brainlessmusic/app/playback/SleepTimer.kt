package com.brainlessmusic.app.playback

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.brainlessmusic.app.rooms.RoomSession
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface SleepTimerState {
    data object Off : SleepTimerState

    /** [endsAtMs] is in [SystemClock.elapsedRealtime] time, so a clock change doesn't move it. */
    data class Countdown(val endsAtMs: Long) : SleepTimerState

    /** Pauses when the song that plays now ends. */
    data object EndOfSong : SleepTimerState
}

/** What the timer does to the player and the room. */
interface SleepActions {
    fun fadeOutAndPause(fadeMs: Long)
    fun pauseAtEndOfSong(on: Boolean)
    fun leaveRoom()
}

/**
 * The timer's rules, with the clock, the scheduler and the player behind small seams so it is testable without a looper
 * (same approach as [HeadsetPresses]). [SleepTimer] wires it to the real player.
 */
class SleepTimerLogic(
    private val clock: () -> Long,
    private val schedule: (delayMs: Long, task: () -> Unit) -> () -> Unit,
    private val actions: SleepActions,
) {
    private val _state = MutableStateFlow<SleepTimerState>(SleepTimerState.Off)
    val state: StateFlow<SleepTimerState> = _state.asStateFlow()

    private var playback = PlaybackUiState()
    private var cancelFire: (() -> Unit)? = null

    fun start(minutes: Int) {
        if (!playback.hasQueue) return
        countdown(minutes * 60_000L)
    }

    /** Outside a room the player pauses at the song's end; in a room the server drives songs, so it is a countdown. */
    fun startEndOfSong() {
        if (!playback.hasQueue) return
        if (playback.inRoom) {
            val left = playback.durationMs - playback.positionMs
            if (playback.durationMs > 0 && left > 0) countdown(left)
            return
        }
        cancel()
        actions.pauseAtEndOfSong(true)
        _state.value = SleepTimerState.EndOfSong
    }

    fun cancel() {
        cancelFire?.invoke()
        cancelFire = null
        if (_state.value == SleepTimerState.EndOfSong) actions.pauseAtEndOfSong(false)
        _state.value = SleepTimerState.Off
    }

    /** The player paused itself at the end of the song. */
    fun songEnded() {
        if (_state.value == SleepTimerState.EndOfSong) _state.value = SleepTimerState.Off
    }

    /** Every playback state change. The timer ends with the queue, and an end-of-song timer meets a room. */
    fun onPlayback(next: PlaybackUiState) {
        playback = next
        if (_state.value == SleepTimerState.Off) return
        if (!next.hasQueue) {
            cancel()
            return
        }
        if (next.inRoom && _state.value == SleepTimerState.EndOfSong) {
            // countdown() and cancel() both disarm the player's end-of-song pause.
            val left = next.durationMs - next.positionMs
            if (next.durationMs > 0 && left > 0) countdown(left) else cancel()
        }
    }

    private fun countdown(ms: Long) {
        cancelFire?.invoke()
        cancelFire = null
        if (_state.value == SleepTimerState.EndOfSong) actions.pauseAtEndOfSong(false)
        val endsAt = clock() + ms
        _state.value = SleepTimerState.Countdown(endsAt)
        arm(endsAt)
    }

    private fun arm(endsAt: Long) {
        cancelFire = schedule((endsAt - clock()).coerceAtLeast(0)) { onDue(endsAt) }
    }

    private fun onDue(endsAt: Long) {
        cancelFire = null
        // The scheduler's clock stops while the phone sleeps deeply: ask again for what is left.
        if (clock() < endsAt) return arm(endsAt)
        _state.value = SleepTimerState.Off
        // Leaving keeps the music playing here, so the fade that follows is the one that stops it.
        if (playback.inRoom) actions.leaveRoom()
        actions.fadeOutAndPause(SLEEP_FADE_MS)
    }

    companion object {
        const val SLEEP_FADE_MS = 10_000L
    }
}

@Singleton
class SleepTimer @Inject constructor(
    private val controller: PlaybackController,
    private val room: RoomSession,
) {
    private val handler = Handler(Looper.getMainLooper())
    private val logic = SleepTimerLogic(
        clock = SystemClock::elapsedRealtime,
        schedule = { delayMs, task ->
            val run = Runnable { task() }
            handler.postDelayed(run, delayMs)
            ({ handler.removeCallbacks(run) })
        },
        actions = object : SleepActions {
            override fun fadeOutAndPause(fadeMs: Long) = controller.fadeOutAndPause(fadeMs)
            override fun pauseAtEndOfSong(on: Boolean) = controller.pauseAtEndOfSong(on)
            override fun leaveRoom() = room.leave()
        },
    )

    val state: StateFlow<SleepTimerState> = logic.state

    init {
        controller.onSleepSongEnd = logic::songEnded
        CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).launch {
            controller.state.collect(logic::onPlayback)
        }
    }

    fun start(minutes: Int) = logic.start(minutes)
    fun startEndOfSong() = logic.startEndOfSong()
    fun cancel() = logic.cancel()
}
