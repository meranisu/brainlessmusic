package com.brainlessmusic.app.ui.search

import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import org.junit.Assert.assertEquals
import org.junit.Test

class SearchHighlightTest {
    private val bold = SpanStyle(fontWeight = FontWeight.Bold)

    private fun marked(text: String, query: String): List<String> {
        val s = highlight(text, query, bold)
        return s.spanStyles.map { s.text.substring(it.start, it.end) }
    }

    @Test
    fun `marks each word of the query, ignoring case`() =
        assertEquals(listOf("Rain", "rain"), marked("Rain on the rainbow", "RAIN"))

    @Test
    fun `ignores accents both ways`() {
        assertEquals(listOf("Beyoncé"), marked("Beyoncé", "beyonce"))
        assertEquals(listOf("Zoe"), marked("Zoe", "zoë"))
    }

    @Test
    fun `marks several words and leaves the rest`() =
        assertEquals(listOf("Abbey", "Road"), marked("Abbey Road (Remastered)", "road abbey"))

    @Test
    fun `no match leaves the text plain`() {
        val s = highlight("Help", "zzz", bold)
        assertEquals("Help", s.text)
        assertEquals(0, s.spanStyles.size)
    }
}
