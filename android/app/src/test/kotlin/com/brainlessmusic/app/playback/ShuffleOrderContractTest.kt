package com.brainlessmusic.app.playback

import androidx.media3.exoplayer.source.ShuffleOrder.DefaultShuffleOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import kotlin.random.Random

/** Pins that [DefaultShuffleOrder]'s array means "shuffled position -> queue index", the reading the controller relies on. */
class ShuffleOrderContractTest {

    @Test
    fun walkingTheShuffleOrderVisitsTheSmartShuffleSequenceInOrder() {
        val keys = List(60) { "artist${it % 7}" }
        val sequence = SmartShuffle.order(keys, first = 5, random = Random(11))
        val order = DefaultShuffleOrder(sequence, 1L)

        assertEquals(60, order.length)
        assertEquals(sequence[0], order.firstIndex)
        assertEquals(sequence[59], order.lastIndex)
        for (i in 0 until 59) assertEquals(sequence[i + 1], order.getNextIndex(sequence[i]))
    }

    @Test
    fun theSequenceIsNotJustTheQueueOrder() {
        val keys = List(60) { "artist${it % 7}" }
        val sequence = SmartShuffle.order(keys, first = 0, random = Random(3))
        assertNotEquals((0 until 60).toList(), sequence.toList())
        // Starting on the current track, the next one is not simply current + 1.
        val order = DefaultShuffleOrder(sequence, 1L)
        assertNotEquals(1, order.getNextIndex(0))
    }
}
