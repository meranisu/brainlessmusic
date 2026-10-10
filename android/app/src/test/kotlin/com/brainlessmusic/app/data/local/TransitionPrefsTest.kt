package com.brainlessmusic.app.data.local

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** A72's rule: only the next track of the same album counts, so only that join stays gapless under a fade. */
class TransitionPrefsTest {

    @Test
    fun nextTrackOfTheSameAlbumCounts() {
        assertTrue(isNextOnAlbum(albumId = 7, trackNumber = 3, nextAlbumId = 7, nextTrack = 4))
    }

    @Test
    fun anotherAlbumOrASkippedTrackDoesNot() {
        assertFalse(isNextOnAlbum(7, 3, 8, 4))
        assertFalse(isNextOnAlbum(7, 3, 7, 5))
        assertFalse(isNextOnAlbum(7, 3, 7, 3))
        assertFalse(isNextOnAlbum(7, 4, 7, 3))
    }

    @Test
    fun missingAlbumOrTrackNumberNeverCounts() {
        assertFalse(isNextOnAlbum(null, 3, null, 4))
        assertFalse(isNextOnAlbum(7, null, 7, null))
        assertFalse(isNextOnAlbum(7, 3, 7, null))
    }

    @Test
    fun defaultsAreGaplessWithThePauseFadeAndTheAlbumRuleOn() {
        val defaults = TransitionPrefs()
        assertTrue(defaults.betweenSongs == BetweenSongs.GAPLESS)
        assertTrue(defaults.fadeOnPause)
        assertTrue(defaults.keepAlbumsGapless)
        assertTrue(defaults.fadeSeconds in FADE_LENGTHS)
    }
}
