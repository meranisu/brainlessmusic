package com.brainlessmusic.app.playback

import com.brainlessmusic.app.playback.ShuffleMode.OFF
import com.brainlessmusic.app.playback.ShuffleMode.REDISCOVER
import com.brainlessmusic.app.playback.ShuffleMode.SHUFFLE
import org.junit.Assert.assertEquals
import org.junit.Test

/** A tapped song turns shuffle off; "Keep shuffle" keeps it; the shuffle buttons come back to the last mode. */
class ShuffleModeForPlayTest {

    @Test
    fun aTappedSongTurnsShuffleOff() {
        assertEquals(OFF, shuffleModeForPlay(shuffle = null, keepShuffle = false, current = REDISCOVER, lastOn = REDISCOVER))
    }

    @Test
    fun keepShuffleKeepsWhatWasOn() {
        assertEquals(REDISCOVER, shuffleModeForPlay(shuffle = null, keepShuffle = true, current = REDISCOVER, lastOn = REDISCOVER))
        assertEquals(OFF, shuffleModeForPlay(shuffle = null, keepShuffle = true, current = OFF, lastOn = REDISCOVER))
    }

    @Test
    fun aShuffleButtonComesBackToTheLastMode() {
        assertEquals(REDISCOVER, shuffleModeForPlay(shuffle = true, keepShuffle = false, current = OFF, lastOn = REDISCOVER))
    }

    @Test
    fun aShuffleButtonKeepsTheModeThatIsOn() {
        assertEquals(SHUFFLE, shuffleModeForPlay(shuffle = true, keepShuffle = false, current = SHUFFLE, lastOn = REDISCOVER))
    }

    @Test
    fun falseAlwaysTurnsItOff() {
        assertEquals(OFF, shuffleModeForPlay(shuffle = false, keepShuffle = true, current = SHUFFLE, lastOn = SHUFFLE))
    }
}
