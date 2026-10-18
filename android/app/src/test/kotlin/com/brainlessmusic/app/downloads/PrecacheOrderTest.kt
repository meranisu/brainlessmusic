package com.brainlessmusic.app.downloads

import org.junit.Assert.assertEquals
import org.junit.Test

class PrecacheOrderTest {
    private val order = listOf(0, 1, 2, 3, 4)

    @Test
    fun `current song first, then the next count`() {
        assertEquals(listOf(1, 2, 3, 4), precacheOrder(order, 1, 3, wrap = false))
    }

    @Test
    fun `stops at the end of the queue`() {
        assertEquals(listOf(3, 4), precacheOrder(order, 3, 10, wrap = false))
    }

    @Test
    fun `wraps to the start when repeating all, without repeating a song`() {
        assertEquals(listOf(3, 4, 0, 1), precacheOrder(order, 3, 3, wrap = true))
        assertEquals(listOf(3, 4, 0, 1, 2), precacheOrder(order, 3, 10, wrap = true))
    }

    @Test
    fun `count 0 holds only the current song`() {
        assertEquals(listOf(2), precacheOrder(order, 2, 0, wrap = false))
    }

    @Test
    fun `follows a shuffled play order, not queue order`() {
        assertEquals(listOf(4, 0, 2), precacheOrder(listOf(3, 4, 0, 2, 1), 1, 2, wrap = false))
    }

    @Test
    fun `nothing for an unknown position or an empty queue`() {
        assertEquals(emptyList<Int>(), precacheOrder(order, -1, 3, wrap = false))
        assertEquals(emptyList<Int>(), precacheOrder(emptyList(), 0, 3, wrap = true))
    }
}
