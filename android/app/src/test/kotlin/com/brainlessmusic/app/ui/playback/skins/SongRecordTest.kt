package com.brainlessmusic.app.ui.playback.skins

import org.junit.Assert.assertEquals
import org.junit.Test

/** The clear lamp rule written down in A115. */
class SongRecordTest {

    @Test
    fun `nothing yet is new`() = assertEquals(Clear.NEW, clearFor(plays = 0, skips = 0))

    @Test
    fun `skipped at least as often as finished is failed`() {
        assertEquals(Clear.FAILED, clearFor(plays = 0, skips = 1))
        assertEquals(Clear.FAILED, clearFor(plays = 4, skips = 4))
    }

    @Test
    fun `three finishes and no skip is a full combo, fewer is a clear`() {
        assertEquals(Clear.FULL_COMBO, clearFor(plays = 3, skips = 0))
        assertEquals(Clear.CLEAR, clearFor(plays = 2, skips = 0))
        assertEquals(Clear.CLEAR, clearFor(plays = 9, skips = 1))
    }

    @Test
    fun `the numbers line reads naturally`() {
        assertEquals("1 play · 3 min", recordLine(1, 200_000))
        assertEquals("14 plays · 1 h 5 min", recordLine(14, 65 * 60_000L))
    }
}
