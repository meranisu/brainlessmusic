package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.data.remote.dto.PlaylistTrackDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaylistSortTest {

    private fun track(id: Int, title: String, artist: String?, album: String?, duration: Double?, addedAt: String?, trackNumber: Int? = null) =
        PlaylistTrackDto(
            id = id, title = title, artist = artist, album = album, duration = duration, format = null, position = id,
            trackNumber = trackNumber, addedAt = addedAt,
        )

    private val tracks = listOf(
        track(1, "beta", "Zed", "B side", 200.0, "2026-10-01 10:00:00", trackNumber = 2),
        track(2, "Alpha", null, null, null, "2026-10-03 10:00:00"),
        track(3, "gamma", "abba", "B side", 100.0, "2026-10-02 10:00:00", trackNumber = 1),
    )

    private fun ids(sort: PlaylistSort) = sortTracks(tracks, sort).map { it.id }

    @Test
    fun `playlist order is left alone`() = assertEquals(listOf(1, 2, 3), ids(PlaylistSort.CUSTOM))

    @Test
    fun `recently added is newest first`() = assertEquals(listOf(2, 3, 1), ids(PlaylistSort.RECENT))

    @Test
    fun `title ignores case`() = assertEquals(listOf(2, 1, 3), ids(PlaylistSort.TITLE))

    @Test
    fun `artist ignores case and puts unknown last`() = assertEquals(listOf(3, 1, 2), ids(PlaylistSort.ARTIST))

    @Test
    fun `album goes by track number inside an album, unknown last`() = assertEquals(listOf(3, 1, 2), ids(PlaylistSort.ALBUM))

    @Test
    fun `length is shortest first, unknown last`() = assertEquals(listOf(3, 1, 2), ids(PlaylistSort.LENGTH))

    @Test
    fun `search matches title, artist or album, ignoring case and spaces`() {
        assertTrue(matchesQuery(tracks[0], "  ZED "))
        assertTrue(matchesQuery(tracks[2], "b SIDE"))
        assertTrue(matchesQuery(tracks[1], ""))
        assertFalse(matchesQuery(tracks[1], "zed"))
    }

    @Test
    fun `totals give the count and the length`() {
        assertEquals("3 songs · 5 min", playlistTotals(tracks))
        assertEquals("1 song", playlistTotals(listOf(tracks[1])))
    }
}
