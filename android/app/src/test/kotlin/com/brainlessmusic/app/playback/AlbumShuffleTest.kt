package com.brainlessmusic.app.playback

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.random.Random

class AlbumShuffleTest {

    // Two albums given out of track order, plus a single with no album.
    private val albums = listOf(1, 1, 2, null, 1, 2)
    private val numbers = listOf(3, 1, 2, null, 2, 1)

    private fun albumRun(order: IntArray, run: List<Int>) {
        val at = order.indexOf(run.first())
        assertEquals(run, order.toList().subList(at, at + run.size))
    }

    @Test
    fun everyTrackOnceWithAlbumsInTrackOrder() {
        repeat(20) { seed ->
            val order = AlbumShuffle.order(albums, numbers, random = Random(seed))
            assertArrayEquals((0 until 6).toList().toIntArray(), order.sortedArray())
            albumRun(order, listOf(1, 4, 0))
            albumRun(order, listOf(5, 2))
        }
    }

    @Test
    fun theRequestedTrackLeadsAndItsAlbumCarriesOn() {
        repeat(20) { seed ->
            val order = AlbumShuffle.order(albums, numbers, first = 4, random = Random(seed))
            assertEquals(listOf(4, 0), order.toList().take(2))
            // Track 1 of that album came before the tapped one, so it goes last.
            assertEquals(1, order.last())
        }
    }
}
