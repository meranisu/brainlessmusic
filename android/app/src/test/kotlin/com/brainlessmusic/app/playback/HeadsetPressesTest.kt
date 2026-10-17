package com.brainlessmusic.app.playback

import org.junit.Assert.assertEquals
import org.junit.Test

class HeadsetPressesTest {

    private var prefs = HeadsetButtonPrefs()
    private val fired = mutableListOf<HeadsetAction>()
    private var now = 0L
    private val pending = mutableListOf<Pair<Long, () -> Unit>>()

    private val presses = HeadsetPresses(
        prefs = { prefs },
        schedule = { delay, task ->
            val entry = (now + delay) to task
            pending += entry
            val cancel: () -> Unit = { pending.remove(entry) }
            cancel
        },
        fire = { fired += it },
    )

    private fun advance(ms: Long) {
        now += ms
        pending.filter { it.first <= now }.forEach { entry ->
            pending.remove(entry)
            entry.second()
        }
    }

    @Test
    fun onePressWaitsForTheWindowThenFires() {
        presses.press()
        assertEquals(emptyList<HeadsetAction>(), fired)
        advance(HeadsetPresses.WINDOW_MS)
        assertEquals(listOf(HeadsetAction.PLAY_PAUSE), fired)
    }

    @Test
    fun twoPressesInsideTheWindowFireTheDoubleAction() {
        presses.press()
        advance(200)
        presses.press()
        advance(HeadsetPresses.WINDOW_MS)
        assertEquals(listOf(HeadsetAction.NEXT), fired)
    }

    @Test
    fun threePressesFireAtOnceWithoutWaiting() {
        presses.press()
        presses.press()
        presses.press()
        assertEquals(listOf(HeadsetAction.PREVIOUS), fired)
    }

    @Test
    fun slowPressesAreSeparateSingles() {
        presses.press()
        advance(HeadsetPresses.WINDOW_MS)
        presses.press()
        advance(HeadsetPresses.WINDOW_MS)
        assertEquals(listOf(HeadsetAction.PLAY_PAUSE, HeadsetAction.PLAY_PAUSE), fired)
    }

    @Test
    fun withTwoAndThreeUnmappedASinglePressFiresAtOnce() {
        prefs = HeadsetButtonPrefs(double = HeadsetAction.NONE, triple = HeadsetAction.NONE)
        presses.press()
        assertEquals(listOf(HeadsetAction.PLAY_PAUSE), fired)
    }

    @Test
    fun withOnlyTwoMappedTheSecondPressFiresAtOnce() {
        prefs = HeadsetButtonPrefs(triple = HeadsetAction.NONE)
        presses.press()
        presses.press()
        assertEquals(listOf(HeadsetAction.NEXT), fired)
    }

    @Test
    fun aCancelledPressNeverFires() {
        presses.press()
        presses.cancel()
        advance(HeadsetPresses.WINDOW_MS)
        assertEquals(emptyList<HeadsetAction>(), fired)
    }
}
