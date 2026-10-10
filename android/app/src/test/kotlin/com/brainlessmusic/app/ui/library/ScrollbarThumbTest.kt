package com.brainlessmusic.app.ui.library

import org.junit.Assert.assertEquals
import org.junit.Test

class ScrollbarThumbTest {

    @Test
    fun unmeasuredTrackDoesNotThrow() {
        // The first frame, before onSizeChanged: v0.3.1 crashed here on an empty coerceIn range.
        assertEquals(1f, thumbHeight(trackPx = 1f, visible = 10, total = 5000, minPx = 105f))
    }

    @Test
    fun longListGetsTheMinimumThumb() {
        assertEquals(105f, thumbHeight(trackPx = 1500f, visible = 10, total = 5000, minPx = 105f))
    }

    @Test
    fun shortListGetsItsShareOfTheTrack() {
        assertEquals(500f, thumbHeight(trackPx = 1500f, visible = 10, total = 30, minPx = 105f))
    }
}
