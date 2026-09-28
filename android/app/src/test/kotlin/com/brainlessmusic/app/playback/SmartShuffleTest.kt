package com.brainlessmusic.app.playback

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class SmartShuffleTest {

    private fun adjacentRepeats(keys: List<String?>, order: IntArray): Int =
        order.toList().zipWithNext().count { (a, b) -> keys[a] != null && keys[a] == keys[b] }

    @Test
    fun everyTrackAppearsExactlyOnce() {
        val keys = List(200) { "artist${it % 13}" }
        val order = SmartShuffle.order(keys, random = Random(1))
        assertArrayEquals((0 until 200).toList().toIntArray(), order.sortedArray())
    }

    @Test
    fun theRequestedTrackGoesFirst() {
        val keys = listOf("a", "a", "b", "b", "c")
        repeat(20) { seed ->
            assertEquals(3, SmartShuffle.order(keys, first = 3, random = Random(seed))[0])
        }
    }

    @Test
    fun neverPlaysTheSameArtistTwiceInARowWhenItCanBeAvoided() {
        // Many shapes of library, none where one artist holds more than half.
        repeat(300) { seed ->
            val random = Random(seed)
            val artists = 3 + random.nextInt(8)
            val keys = List(20 + random.nextInt(80)) { "artist${random.nextInt(artists)}" }
            val biggest = keys.groupingBy { it }.eachCount().values.max()
            if (biggest * 2 > keys.size) return@repeat
            val order = SmartShuffle.order(keys, first = random.nextInt(keys.size), random = random)
            assertEquals("seed $seed", 0, adjacentRepeats(keys, order))
        }
    }

    @Test
    fun aDominantArtistIsSpreadAsThinlyAsPossible() {
        // 6 of 10 by one artist: at least 1 repeat is forced, and the algorithm must not add more than that.
        val keys = List(6) { "big" } + List(4) { "small$it" }
        repeat(50) { seed ->
            val order = SmartShuffle.order(keys, random = Random(seed))
            assertTrue("seed $seed", adjacentRepeats(keys, order) <= 1)
        }
    }

    @Test
    fun unknownArtistsDoNotConstrainEachOther() {
        val keys: List<String?> = List(10) { null }
        val order = SmartShuffle.order(keys, random = Random(7))
        assertEquals(10, order.toSet().size)
    }

    @Test
    fun aSingleArtistStillProducesAFullOrder() {
        val keys = List(8) { "only" }
        val order = SmartShuffle.order(keys, first = 2, random = Random(3))
        assertEquals(2, order[0])
        assertEquals(8, order.toSet().size)
    }

    @Test
    fun emptyAndSingleQueuesAreFine() {
        assertEquals(0, SmartShuffle.order(emptyList()).size)
        assertArrayEquals(intArrayOf(0), SmartShuffle.order(listOf("x")))
    }

    @Test
    fun differentSeedsGiveDifferentOrders() {
        val keys = List(30) { "artist${it % 6}" }
        val orders = (0 until 10).map { SmartShuffle.order(keys, random = Random(it)).toList() }.toSet()
        assertFalse("shuffle should not be deterministic", orders.size == 1)
    }
}
