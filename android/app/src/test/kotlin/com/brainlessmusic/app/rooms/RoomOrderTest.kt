package com.brainlessmusic.app.rooms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Shuffle, repeat and Next on Now Playing while in a room (A268, A269). */
class RoomOrderTest {
    private val host = 1
    private val guest = 2

    private fun entry(id: Int) =
        RoomEntry(entryId = id, trackId = id, title = "t$id", artist = null, albumId = null, durationMs = 1000, addedBy = host)

    private fun room(size: Int, current: Int, settings: RoomSettings? = RoomSettings()) = RoomState(
        code = "ABCDEF",
        version = 1,
        hostUserId = host,
        members = emptyList(),
        queue = (1..size).map(::entry),
        current = current,
        playback = RoomPlayback(playing = true, positionMs = 0, anchorMs = 0),
        settings = settings,
    )

    @Test
    fun `Next goes on before the last song`() {
        assertTrue(room(size = 3, current = 1).hasNext)
    }

    @Test
    fun `Next stops at the last song unless repeat all goes round`() {
        assertFalse(room(size = 3, current = 2).hasNext)
        assertFalse(room(size = 3, current = 2, RoomSettings(repeat = "one")).hasNext)
        assertTrue(room(size = 3, current = 2, RoomSettings(repeat = "all")).hasNext)
    }

    @Test
    fun `an empty queue has no Next, even with repeat all`() {
        assertFalse(room(size = 0, current = -1, RoomSettings(repeat = "all")).hasNext)
    }

    @Test
    fun `only the host, connected, with settings known, changes the order`() {
        assertTrue(room(3, 0).canChangeOrder(host, live = true))
        assertFalse(room(3, 0).canChangeOrder(guest, live = true))
        assertFalse(room(3, 0).canChangeOrder(host, live = false))
        assertFalse(room(3, 0, settings = null).canChangeOrder(host, live = true))
        assertFalse(room(3, 0).canChangeOrder(null, live = true))
    }

    @Test
    fun `a tap sends only the field it changed`() {
        val now = RoomSettings(shuffle = false, repeat = "all")
        assertEquals(mapOf("shuffle" to true), now.orderChangesTo(now.copy(shuffle = true)))
        assertEquals(mapOf("repeat" to "one"), now.orderChangesTo(now.copy(repeat = now.nextRepeat())))
        assertEquals(emptyMap<String, Any>(), now.orderChangesTo(now))
    }
}
