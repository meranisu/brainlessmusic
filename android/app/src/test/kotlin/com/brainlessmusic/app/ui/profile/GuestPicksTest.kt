package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import org.junit.Assert.assertEquals
import org.junit.Test

class GuestPicksTest {

    private fun track(id: Int, albumId: Int?, hidden: Boolean = false, missing: Boolean = false) = TrackSummaryDto(
        id = id,
        title = "Song $id",
        artist = "Artist",
        album = albumId?.let { "Album $it" },
        albumId = albumId,
        duration = null,
        format = null,
        hidden = hidden,
        notRecommended = false,
        missing = missing,
        hasStreamError = false,
        playCount = 0,
        dateAdded = "2026-10-11",
    )

    @Test
    fun `picks skip hidden and missing songs and stop at twelve`() {
        val page = listOf(track(1, 1, hidden = true), track(2, 1, missing = true)) + (3..20).map { track(it, it) }
        val picks = guestPicks(page)
        assertEquals((3..14).toList(), picks.map { it.id })
    }

    @Test
    fun `albums come once each and avoid the song picks' albums first`() {
        val page = listOf(track(1, 10), track(2, 20), track(3, 30), track(4, 30), track(5, null), track(6, 40))
        val picks = page.take(2)
        assertEquals(listOf(30, 40, 10, 20), guestAlbumPicks(page, picks).map { it.id })
    }

    @Test
    fun `albums stop at ten`() {
        val page = (1..30).map { track(it, it) }
        assertEquals(GUEST_ALBUM_PICKS, guestAlbumPicks(page, emptyList()).size)
    }
}
