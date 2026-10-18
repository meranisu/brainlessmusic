package com.brainlessmusic.app.playback

import org.junit.Assert.assertEquals
import org.junit.Test

class SleepTimerTest {

    private var now = 0L
    private val pending = mutableListOf<Pair<Long, () -> Unit>>()
    private val calls = mutableListOf<String>()

    private val timer = SleepTimerLogic(
        clock = { now },
        schedule = { delay, task ->
            val entry = (now + delay) to task
            pending += entry
            val cancel: () -> Unit = { pending.remove(entry) }
            cancel
        },
        actions = object : SleepActions {
            override fun fadeOutAndPause(fadeMs: Long) { calls += "fade:$fadeMs" }
            override fun pauseAtEndOfSong(on: Boolean) { calls += "endOfSong:$on" }
            override fun leaveRoom() { calls += "leave" }
        },
    )

    private fun item() = QueueItem(1, "Song", null, null, 200.0, null)

    private fun playing(inRoom: Boolean = false, positionMs: Long = 0, durationMs: Long = 200_000) =
        PlaybackUiState(queue = listOf(item()), currentIndex = 0, isPlaying = true, inRoom = inRoom,
            positionMs = positionMs, durationMs = durationMs)

    private fun advance(ms: Long) {
        now += ms
        pending.filter { it.first <= now }.forEach { entry ->
            pending.remove(entry)
            entry.second()
        }
    }

    @Test
    fun countdownFiresOnceAtZeroWithTheSlowFade() {
        timer.onPlayback(playing())
        timer.start(15)
        assertEquals(SleepTimerState.Countdown(15 * 60_000L), timer.state.value)
        advance(15 * 60_000L - 1)
        assertEquals(emptyList<String>(), calls)
        advance(1)
        assertEquals(listOf("fade:10000"), calls)
        assertEquals(SleepTimerState.Off, timer.state.value)
        advance(60 * 60_000L)
        assertEquals(listOf("fade:10000"), calls)
    }

    @Test
    fun startingAgainReplacesTheRunningTimer() {
        timer.onPlayback(playing())
        timer.start(15)
        advance(5 * 60_000L)
        timer.start(30)
        advance(15 * 60_000L)
        assertEquals(emptyList<String>(), calls)
        advance(15 * 60_000L)
        assertEquals(listOf("fade:10000"), calls)
    }

    @Test
    fun cancelStopsTheCountdown() {
        timer.onPlayback(playing())
        timer.start(15)
        timer.cancel()
        advance(60 * 60_000L)
        assertEquals(emptyList<String>(), calls)
        assertEquals(SleepTimerState.Off, timer.state.value)
    }

    @Test
    fun nothingStartsWithoutAQueue() {
        timer.start(15)
        timer.startEndOfSong()
        assertEquals(SleepTimerState.Off, timer.state.value)
        assertEquals(emptyList<String>(), calls)
    }

    @Test
    fun inARoomTheTimerLeavesThenFades() {
        timer.onPlayback(playing(inRoom = true))
        timer.start(15)
        advance(15 * 60_000L)
        assertEquals(listOf("leave", "fade:10000"), calls)
    }

    @Test
    fun endOfSongArmsThePlayerAndGoesOffWhenItPaused() {
        timer.onPlayback(playing())
        timer.startEndOfSong()
        assertEquals(SleepTimerState.EndOfSong, timer.state.value)
        assertEquals(listOf("endOfSong:true"), calls)
        timer.songEnded()
        assertEquals(SleepTimerState.Off, timer.state.value)
    }

    @Test
    fun cancellingEndOfSongDisarmsThePlayer() {
        timer.onPlayback(playing())
        timer.startEndOfSong()
        timer.cancel()
        assertEquals(listOf("endOfSong:true", "endOfSong:false"), calls)
    }

    @Test
    fun endOfSongInARoomBecomesACountdownToTheSongsEnd() {
        timer.onPlayback(playing(inRoom = true, positionMs = 50_000, durationMs = 200_000))
        timer.startEndOfSong()
        assertEquals(SleepTimerState.Countdown(150_000L), timer.state.value)
        assertEquals(emptyList<String>(), calls)
    }

    @Test
    fun endOfSongTurnsIntoACountdownWhenARoomIsJoined() {
        timer.onPlayback(playing())
        timer.startEndOfSong()
        timer.onPlayback(playing(inRoom = true, positionMs = 100_000, durationMs = 200_000))
        assertEquals(SleepTimerState.Countdown(100_000L), timer.state.value)
        assertEquals(listOf("endOfSong:true", "endOfSong:false"), calls)
    }

    @Test
    fun anEmptiedQueueCancelsTheTimer() {
        timer.onPlayback(playing())
        timer.start(15)
        timer.onPlayback(PlaybackUiState())
        assertEquals(SleepTimerState.Off, timer.state.value)
        advance(60 * 60_000L)
        assertEquals(emptyList<String>(), calls)
    }

    @Test
    fun aSchedulerThatFiresEarlyAsksAgainForWhatIsLeft() {
        timer.onPlayback(playing())
        timer.start(15)
        val early = pending.single()
        pending.clear()
        now += 5 * 60_000L
        early.second()
        assertEquals(emptyList<String>(), calls)
        advance(10 * 60_000L)
        assertEquals(listOf("fade:10000"), calls)
    }
}
