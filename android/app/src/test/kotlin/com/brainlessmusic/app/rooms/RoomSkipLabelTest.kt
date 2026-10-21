package com.brainlessmusic.app.rooms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What Next does in a room since A263: the host votes too, and the starting queue is nobody's. */
class RoomSkipLabelTest {
    private val host = 1
    private val guest = 2

    private fun entry(id: Int, addedBy: Int, seed: Boolean? = null) =
        RoomEntry(entryId = id, trackId = id, title = "t$id", artist = null, albumId = null, durationMs = 1000, addedBy = addedBy, seed = seed)

    private fun room(current: RoomEntry, skip: String = "vote", votedOff: Int? = null) = RoomState(
        code = "ABCDEF",
        version = 1,
        hostUserId = host,
        members = emptyList(),
        queue = listOf(current, entry(99, host)),
        current = 0,
        playback = RoomPlayback(playing = true, positionMs = 0, anchorMs = 0),
        settings = RoomSettings(skip = skip),
        votedOff = votedOff,
    )

    @Test
    fun `the host votes on a song the room started with`() {
        val state = room(entry(1, host, seed = true))
        assertTrue(state.nextIsVote(host))
        assertEquals("Vote to skip", state.nextLabel(host))
    }

    @Test
    fun `whoever added a song skips it, host or not`() {
        assertFalse(room(entry(1, host)).nextIsVote(host))
        assertFalse(room(entry(1, guest)).nextIsVote(guest))
        assertTrue(room(entry(1, guest)).nextIsVote(host))
    }

    @Test
    fun `host-only skipping leaves the host a plain Next`() {
        val state = room(entry(1, guest, seed = true), skip = "host")
        assertEquals("Next", state.nextLabel(host))
        assertEquals("Only the host can skip", state.nextLabel(guest))
    }

    @Test
    fun `a skip by vote is said once`() {
        val before = room(entry(1, host, seed = true))
        val after = room(entry(2, host), votedOff = 1)
        assertEquals("Skipped by vote.", voteMessage(before, after, guest))
        assertNull(voteMessage(after, after, guest))
    }
}
