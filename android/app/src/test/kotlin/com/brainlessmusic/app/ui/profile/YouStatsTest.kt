package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.data.remote.dto.ProfileCountsDto
import com.brainlessmusic.app.data.remote.dto.StatsTotalsDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.StatsRange
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class YouStatsTest {

    private fun stats(ms: Long, previousMs: Long?, previousPlays: Int = 3) = UserStatsDto(
        range = "week",
        since = null,
        memberSince = "2026-01-01 00:00:00",
        totals = StatsTotalsDto(plays = 5, msListened = ms, tracks = 2, artists = 1),
        previousTotals = previousMs?.let { StatsTotalsDto(plays = previousPlays, msListened = it, tracks = 1, artists = 1) },
        topTracks = emptyList(),
        topArtists = emptyList(),
        topAlbums = emptyList(),
        counts = ProfileCountsDto(0, 0, 0),
    )

    @Test
    fun `movement reads the previous rank, and says nothing without a comparison`() {
        assertEquals(Movement.Up(3), movement(rank = 2, previousRank = 5, compared = true))
        assertEquals(Movement.Down(1), movement(rank = 4, previousRank = 3, compared = true))
        assertEquals(Movement.New, movement(rank = 1, previousRank = null, compared = true))
        assertNull(movement(rank = 2, previousRank = 2, compared = true))
        // All time, or a server that doesn't compare: a null rank there is not "new".
        assertNull(movement(rank = 1, previousRank = null, compared = false))
    }

    @Test
    fun `the big number is minutes under an hour, then hours`() {
        assertEquals("0" to "mins listened", listenedHeadline(0))
        assertEquals("1" to "min listened", listenedHeadline(60_000))
        assertEquals("45" to "mins listened", listenedHeadline(45 * 60_000L))
        assertEquals("1" to "hour listened", listenedHeadline(3_600_000))
        assertEquals("1.5" to "hours listened", listenedHeadline(5_400_000))
        assertEquals("12" to "hours listened", listenedHeadline(12 * 3_600_000L + 1_800_000))
    }

    @Test
    fun `the delta names the window before, and is left out when there is nothing to compare`() {
        assertEquals("1 h more than the 7 days before", listenedDelta(stats(2 * 3_600_000L, 3_600_000), StatsRange.WEEK))
        assertEquals("30 min less than the 30 days before", listenedDelta(stats(1_800_000, 3_600_000), StatsRange.MONTH))
        assertEquals("About the same as the year before", listenedDelta(stats(3_600_000, 3_590_000), StatsRange.YEAR))
        assertNull(listenedDelta(stats(3_600_000, null), StatsRange.WEEK))
        assertNull(listenedDelta(stats(3_600_000, 0, previousPlays = 0), StatsRange.WEEK))
    }

    @Test
    fun `a big jump is shortened to fit the rank column`() {
        assertEquals("99", shortPlaces(99))
        assertEquals("99+", shortPlaces(145))
    }

    @Test
    fun `the Home greeting follows the clock and leaves out a missing name`() {
        assertEquals("Good morning, imran", greeting(5, "imran"))
        assertEquals("Good afternoon, imran", greeting(12, "imran"))
        assertEquals("Good evening, imran", greeting(18, "imran"))
        assertEquals("Good evening", greeting(2, null))
        assertEquals("Good morning", greeting(11, " "))
    }
}
