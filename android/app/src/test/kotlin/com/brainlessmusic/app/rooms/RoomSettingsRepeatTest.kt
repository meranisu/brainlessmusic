package com.brainlessmusic.app.rooms

import com.brainlessmusic.app.playback.Repeat
import org.junit.Assert.assertEquals
import org.junit.Test

class RoomSettingsRepeatTest {

    @Test
    fun `repeat cycles off, all, one, off like the phone's own`() {
        assertEquals("all", RoomSettings(repeat = "off").nextRepeat())
        assertEquals("one", RoomSettings(repeat = "all").nextRepeat())
        assertEquals("off", RoomSettings(repeat = "one").nextRepeat())
    }

    @Test
    fun `a missing or unknown repeat counts as off`() {
        assertEquals("all", RoomSettings(repeat = null).nextRepeat())
        assertEquals(Repeat.OFF, RoomSettings(repeat = null).repeatMode)
        assertEquals(Repeat.OFF, RoomSettings(repeat = "sometimes").repeatMode)
    }

    @Test
    fun `wire values map to the player's repeat`() {
        assertEquals(Repeat.ALL, RoomSettings(repeat = "all").repeatMode)
        assertEquals(Repeat.ONE, RoomSettings(repeat = "one").repeatMode)
    }
}
