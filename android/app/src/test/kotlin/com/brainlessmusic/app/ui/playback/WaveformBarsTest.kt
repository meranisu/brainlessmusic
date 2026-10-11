package com.brainlessmusic.app.ui.playback

import org.junit.Assert.assertEquals
import org.junit.Test

/** The same three cases the web's `barsFromPeaks` was checked against (A8). */
class WaveformBarsTest {

    @Test
    fun `a full-scale track may fill the height`() {
        assertEquals(1f, barsFromPeaks(listOf(255, 128)).max(), 0.001f)
    }

    @Test
    fun `a quiet track is scaled up but stays under the quiet ceiling`() {
        val bars = barsFromPeaks(listOf(64, 32))
        val loudest = 64 / 255f
        assertEquals(0.55f + 0.45f * loudest, bars.max(), 0.001f)
    }

    @Test
    fun `silence draws as a stub, not a divide by zero`() {
        assertEquals(listOf(0.06f, 0.06f), barsFromPeaks(listOf(0, 0)))
    }
}
