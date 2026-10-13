package com.brainlessmusic.app.ui.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaylistNameTest {

    @Test
    fun `a blank name can't be saved but isn't an error`() {
        val check = checkPlaylistName("   ", emptyList())
        assertFalse(check.canSave)
        assertNull(check.error)
    }

    @Test
    fun `trims and saves an ordinary name`() {
        val check = checkPlaylistName("  Late night  ", emptyList())
        assertEquals("Late night", check.trimmed)
        assertTrue(check.canSave)
    }

    @Test
    fun `counts emoji as one character each, like the server`() {
        val check = checkPlaylistName("🎵".repeat(PLAYLIST_NAME_MAX), emptyList())
        assertEquals(PLAYLIST_NAME_MAX, check.length)
        assertTrue(check.canSave)
    }

    @Test
    fun `says how far over the limit a name is`() {
        val check = checkPlaylistName("x".repeat(PLAYLIST_NAME_MAX + 3), emptyList())
        assertEquals("3 characters too long. Names fit $PLAYLIST_NAME_MAX.", check.error)
        assertFalse(check.canSave)
        assertTrue(check.showCounter)
    }

    @Test
    fun `refuses a tab`() {
        assertNotNull(checkPlaylistName("a\tb", emptyList()).error)
    }

    @Test
    fun `warns about a duplicate in any case, but still allows it`() {
        val check = checkPlaylistName("gym", listOf("Road trip", "Gym"))
        assertEquals("You already have a playlist called “Gym”. Saving makes a second one.", check.warning)
        assertTrue(check.canSave)
    }

    @Test
    fun `keeping your own name on a rename isn't a duplicate`() {
        assertNull(checkPlaylistName("Gym", listOf("Gym"), ownName = "Gym").warning)
    }
}
