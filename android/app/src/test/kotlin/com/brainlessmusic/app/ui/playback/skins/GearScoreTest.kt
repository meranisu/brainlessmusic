package com.brainlessmusic.app.ui.playback.skins

import org.junit.Assert.assertEquals
import org.junit.Test

/** Gear's score from plays and skips, and SOUND VOLTEX's grades for it (A128). */
class GearScoreTest {

    @Test
    fun `no record scores zero`() = assertEquals(0, listeningScore(plays = 0, skips = 0))

    @Test
    fun `always played through is the full ten million`() = assertEquals(10_000_000, listeningScore(plays = 7, skips = 0))

    @Test
    fun `each skip takes its share`() {
        assertEquals(7_500_000, listeningScore(plays = 3, skips = 1))
        assertEquals(0, listeningScore(plays = 0, skips = 5))
    }

    @Test
    fun `no overflow on large counts`() = assertEquals(9_999_000, listeningScore(plays = 9_999, skips = 1))

    @Test
    fun `grades follow the game's thresholds`() {
        assertEquals("S", gearGrade(10_000_000))
        assertEquals("S", gearGrade(9_900_000))
        assertEquals("AAA+", gearGrade(9_899_999))
        assertEquals("AAA", gearGrade(9_700_000))
        assertEquals("AA+", gearGrade(9_500_000))
        assertEquals("AA", gearGrade(9_300_000))
        assertEquals("A+", gearGrade(9_000_000))
        assertEquals("A", gearGrade(8_700_000))
        assertEquals("B", gearGrade(7_500_000))
        assertEquals("C", gearGrade(6_500_000))
        assertEquals("D", gearGrade(6_499_999))
    }
}
