package com.brainlessmusic.app.rooms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RoomClockTest {
    @Test
    fun `offset is null until the first pong`() {
        assertNull(ClockEstimator().offset)
    }

    @Test
    fun `one sample puts the server time halfway through the round trip`() {
        val clock = ClockEstimator()
        // Sent at 1000, answered with 51_050 server time, back at 1100: the server is 50_000 ahead.
        clock.add(t0 = 1_000, serverTs = 51_050, t1 = 1_100)
        assertEquals(50_000L, clock.offset)
    }

    @Test
    fun `a slow round trip does not move the offset`() {
        val clock = ClockEstimator()
        clock.add(0, 50_010, 20)
        clock.add(1_000, 51_010, 1_020)
        clock.add(2_000, 52_010, 2_020)
        // 2 s round trip, answered late: its own estimate would be 1 s off.
        clock.add(3_000, 55_000, 5_000)
        assertEquals(50_000L, clock.offset)
    }

    @Test
    fun `the offset is the median of the three quickest samples`() {
        val clock = ClockEstimator()
        clock.add(0, 50_005, 10) // offset 50_000, rtt 10
        clock.add(100, 50_125, 130) // offset 50_010, rtt 30
        clock.add(200, 50_190, 220) // offset 49_980, rtt 20
        clock.add(300, 50_900, 700) // rtt 400: ignored
        assertEquals(50_000L, clock.offset)
    }

    @Test
    fun `samples older than two minutes stop counting`() {
        val clock = ClockEstimator()
        clock.add(0, 50_005, 10) // quick, but from long ago
        clock.add(200_000, 250_100, 200_100) // the server moved: offset 50_050 now
        assertEquals(50_050L, clock.offset)
    }

    private fun room(playing: Boolean, positionMs: Long, anchorMs: Long) = RoomState(
        code = "ABCDEF", version = 1, hostUserId = 1, members = emptyList(), queue = emptyList(), current = -1,
        playback = RoomPlayback(playing, positionMs, anchorMs),
    )

    @Test
    fun `a playing room moves on with the server clock`() {
        assertEquals(12_500L, room(true, 10_000, 100_000).expectedPositionMs(102_500))
    }

    @Test
    fun `a paused room stays put`() {
        assertEquals(10_000L, room(false, 10_000, 100_000).expectedPositionMs(150_000))
    }

    @Test
    fun `a new song is negative until its start time`() {
        assertEquals(-1_500L, room(true, 0, 101_500).expectedPositionMs(100_000))
    }

    @Test
    fun `unknown close reasons read as a plain leave`() {
        assertEquals(RoomClosedReason.KICKED, RoomClosedReason.from("kicked"))
        assertEquals(RoomClosedReason.UNKNOWN, RoomClosedReason.from("something-new"))
        assertNull(RoomClosedReason.LEFT.message)
    }
}
