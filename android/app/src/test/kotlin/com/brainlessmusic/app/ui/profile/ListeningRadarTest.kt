package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.data.remote.dto.ProfileCountsDto
import com.brainlessmusic.app.data.remote.dto.StatsTotalsDto
import com.brainlessmusic.app.data.remote.dto.TopArtistDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.StatsRange
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Gear's listening radar: the range's length in days, and the six readings. */
class ListeningRadarTest {

    private fun stats(plays: Int, ms: Long, tracks: Int, artists: Int, topArtistPlays: Int?, liked: Int) = UserStatsDto(
        range = "month",
        since = null,
        memberSince = "2026-01-01 00:00:00",
        totals = StatsTotalsDto(plays, ms, tracks, artists),
        topTracks = emptyList(),
        topArtists = listOfNotNull(topArtistPlays?.let { TopArtistDto(1, "A", it, 0) }),
        topAlbums = emptyList(),
        counts = ProfileCountsDto(liked, 0, 0),
    )

    @Test
    fun `fixed ranges have their own length`() {
        assertEquals(7L, rangeDays(StatsRange.WEEK, "2026-01-01"))
        assertEquals(30L, rangeDays(StatsRange.MONTH, "2026-01-01"))
        assertEquals(365L, rangeDays(StatsRange.YEAR, "2026-01-01"))
    }

    @Test
    fun `all time counts the days since the account began, at least one`() {
        assertEquals(10L, rangeDays(StatsRange.ALL, "2026-01-01 12:00:00", today = LocalDate.of(2026, 1, 10)))
        assertEquals(1L, rangeDays(StatsRange.ALL, "not a date", today = LocalDate.of(2026, 1, 10)))
    }

    @Test
    fun `nothing played reads zero, without dividing by zero`() {
        val v = radarValues(stats(0, 0, 0, 0, null, 0), 30)
        assertEquals(List(6) { 0f }, v)
    }

    @Test
    fun `shares and rates read as described`() {
        val v = radarValues(stats(plays = 360, ms = 30 * 3_600_000L, tracks = 90, artists = 45, topArtistPlays = 72, liked = 50), 30)
        assertEquals(1 - kotlin.math.exp(-1.0).toFloat(), v[0], 0.001f) // 12 plays a day
        assertEquals(1 - kotlin.math.exp(-1.0).toFloat(), v[1], 0.001f) // an hour a day
        assertEquals(0.25f, v[2], 0.001f)
        assertEquals(0.5f, v[3], 0.001f)
        assertEquals(0.2f, v[4], 0.001f)
        assertEquals(0.5f, v[5], 0.001f)
        assertTrue(v.all { it in 0f..1f })
    }

    @Test
    fun `the overall reading is the mean, and potential runs 0 to 13`() {
        assertEquals(0.5f, listeningOverall(listOf(0f, 1f, 0.5f, 0.5f, 0.25f, 0.75f)), 0.001f)
        assertEquals(0f, listeningOverall(emptyList()), 0f)
        assertEquals(0f, potential(0f), 0f)
        assertEquals(6.5f, potential(0.5f), 0.001f)
        assertEquals(13f, potential(1.4f), 0f)
    }
}
