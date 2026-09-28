package com.brainlessmusic.app.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ListenTrackerTest {

    @Test
    fun thresholdIsHalfTheTrackForShortTracks() {
        assertEquals(90_000L, scrobbleThresholdMs(180.0))
    }

    @Test
    fun thresholdCapsAtFourMinutesForLongTracks() {
        assertEquals(240_000L, scrobbleThresholdMs(1_200.0))
    }

    @Test
    fun unknownOrBogusDurationFallsBackToTheCap() {
        assertEquals(240_000L, scrobbleThresholdMs(null))
        assertEquals(240_000L, scrobbleThresholdMs(0.0))
        assertEquals(240_000L, scrobbleThresholdMs(-5.0))
        assertEquals(240_000L, scrobbleThresholdMs(Double.NaN))
    }

    @Test
    fun crossesTheThresholdExactlyOnce() {
        val tracker = ListenTracker(durationSeconds = 10.0) // 5s to count
        var fired = 0
        repeat(20) { if (tracker.onTick(500, playing = true)) fired++ }
        assertEquals(1, fired)
        assertTrue(tracker.scrobbled)
    }

    @Test
    fun pausedTimeEarnsNoCredit() {
        val tracker = ListenTracker(durationSeconds = 10.0)
        repeat(100) { tracker.onTick(500, playing = false) }
        assertEquals(0L, tracker.listenedMs)
        assertFalse(tracker.scrobbled)
    }

    @Test
    fun aStalledTickerCannotCreditMinutesOfSilence() {
        val tracker = ListenTracker(durationSeconds = 600.0) // 240s to count
        tracker.onTick(elapsedMs = 60_000, playing = true)
        assertEquals(2_000L, tracker.listenedMs)
        assertFalse(tracker.scrobbled)
    }

    @Test
    fun nonPositiveElapsedIsIgnored() {
        val tracker = ListenTracker(durationSeconds = 10.0)
        tracker.onTick(0, playing = true)
        tracker.onTick(-100, playing = true)
        assertEquals(0L, tracker.listenedMs)
    }
}
