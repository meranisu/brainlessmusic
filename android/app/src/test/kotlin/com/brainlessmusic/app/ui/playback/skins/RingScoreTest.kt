package com.brainlessmusic.app.ui.playback.skins

import com.brainlessmusic.app.ui.profile.listeningRating
import org.junit.Assert.assertEquals
import org.junit.Test

/** Ring's achievement from plays and skips, maimai's ranks for it (A132), and the difficulty from the play count. */
class RingScoreTest {

    @Test
    fun `no record is zero`() = assertEquals("0.0000%", achievementText(achievement(plays = 0, skips = 0)))

    @Test
    fun `a full combo earns the extra one percent`() {
        // Three or more plays with no skip is a full combo (clearFor), so 100% plus maimai's BREAK bonus.
        assertEquals(1_010_000, achievement(plays = 7, skips = 0))
        assertEquals("101.0000%", achievementText(achievement(plays = 7, skips = 0)))
    }

    @Test
    fun `played through but not yet a full combo stops at 100`() = assertEquals(1_000_000, achievement(plays = 2, skips = 0))

    @Test
    fun `each skip takes its share`() {
        assertEquals("75.0000%", achievementText(achievement(plays = 3, skips = 1)))
        assertEquals(0, achievement(plays = 0, skips = 5))
        assertEquals("99.5000%", achievementText(achievement(plays = 199, skips = 1)))
    }

    @Test
    fun `no overflow on large counts`() = assertEquals(999_900, achievement(plays = 9_999, skips = 1))

    @Test
    fun `ranks follow maimai DX's thresholds`() {
        assertEquals("SSS+", ringRank(1_010_000))
        assertEquals("SSS+", ringRank(1_005_000))
        assertEquals("SSS", ringRank(1_004_999))
        assertEquals("SSS", ringRank(1_000_000))
        assertEquals("SS+", ringRank(995_000))
        assertEquals("SS", ringRank(990_000))
        assertEquals("S+", ringRank(980_000))
        assertEquals("S", ringRank(970_000))
        assertEquals("AAA", ringRank(940_000))
        assertEquals("AA", ringRank(900_000))
        assertEquals("A", ringRank(800_000))
        assertEquals("BBB", ringRank(750_000))
        assertEquals("BB", ringRank(700_000))
        assertEquals("B", ringRank(600_000))
        assertEquals("C", ringRank(500_000))
        assertEquals("D", ringRank(499_999))
    }

    @Test
    fun `difficulty climbs with plays`() {
        assertEquals("BASIC", ringDifficulty(0).name)
        assertEquals("BASIC", ringDifficulty(2).name)
        assertEquals("ADVANCED", ringDifficulty(3).name)
        assertEquals("EXPERT", ringDifficulty(10).name)
        assertEquals("EXPERT", ringDifficulty(19).name)
        assertEquals("MASTER", ringDifficulty(20).name)
        assertEquals("Re:MASTER", ringDifficulty(50).name)
    }

    @Test
    fun `listening rating spans maimai's scale`() {
        assertEquals(0, listeningRating(0f))
        assertEquals(16_750, listeningRating(1f))
        assertEquals(16_750, listeningRating(2f))
    }
}
