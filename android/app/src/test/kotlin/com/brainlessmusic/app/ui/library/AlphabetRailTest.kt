package com.brainlessmusic.app.ui.library

import com.brainlessmusic.app.data.remote.dto.LetterEntryDto
import org.junit.Assert.assertEquals
import org.junit.Test

class AlphabetRailTest {

    // "#" holds rows 0..99, "A" none, "B" rows 100..109.
    private val letters = listOf(
        LetterEntryDto(letter = "#", offset = 0, count = 100),
        LetterEntryDto(letter = "A", offset = 100, count = 0),
        LetterEntryDto(letter = "B", offset = 100, count = 10),
    )
    private val segments = railSegments(letters, total = 110)

    @Test
    fun thumbSitsOnTheCurrentLetterNotTheRowShare() {
        // Row 100 is 91% of the way down by count, but it is the first "B" row, so the thumb is at the top of B's slot.
        assertEquals(2f / 3f, railFraction(segments, 100), 0.0001f)
        assertEquals(2, segmentAt(segments, 105))
    }

    @Test
    fun dragPositionMapsBackToTheSameRow() {
        assertEquals(50, railIndex(segments, railFraction(segments, 50)))
        assertEquals(100, railIndex(segments, 2f / 3f))
        assertEquals(109, railIndex(segments, 1f))
    }

    @Test
    fun withoutLettersItIsAPlainScrollBar() {
        val plain = railSegments(emptyList(), total = 200)
        assertEquals(0.5f, railFraction(plain, 100), 0.0001f)
        assertEquals(100, railIndex(plain, 0.5f))
    }

    @Test
    fun unmeasuredTrackDoesNotThrow() {
        // The first frame, before onSizeChanged: v0.3.1 crashed here on an empty coerceIn range.
        assertEquals(1f, railThumbHeight(trackPx = 1f, segments = segments, visible = 10, minPx = 60f))
        assertEquals(1f, railThumbHeight(trackPx = 1f, segments = railSegments(emptyList(), 5000), visible = 10, minPx = 60f))
    }
}
