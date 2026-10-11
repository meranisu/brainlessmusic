package com.brainlessmusic.app.ui.downloads

import org.junit.Assert.assertEquals
import org.junit.Test

class MosaicCoversTest {

    @Test
    fun `one cover per album, newest first`() {
        val covers = mosaicCovers(listOf(1 to "a1", 1 to "a2", 2 to "b", null to "x", null to "y"))
        assertEquals(listOf("a1", "b", "x", "y"), covers)
    }

    @Test
    fun `songs with no cover are skipped without taking their album`() {
        assertEquals(listOf("a2"), mosaicCovers(listOf(1 to null, 1 to "a2")))
    }

    @Test
    fun `stops at six`() {
        assertEquals(MOSAIC_MAX, mosaicCovers((1..9).map { it to "c$it" }).size)
    }
}
