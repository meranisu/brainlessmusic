package com.brainlessmusic.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.mutablePreferencesOf
import androidx.datastore.preferences.core.stringPreferencesKey
import com.brainlessmusic.app.playback.ShuffleMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

/** The last shuffle mode the shuffle buttons come back to (Q86), including installs from before it was saved. */
class ShuffleSettingsTest {

    private class MemoryStore(start: Preferences) : DataStore<Preferences> {
        private val state = MutableStateFlow(start)
        override val data: Flow<Preferences> = state
        override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences =
            transform(state.value).also { state.value = it }
    }

    private fun settings(vararg pairs: Preferences.Pair<*>) =
        PlaybackSettings(MemoryStore(if (pairs.isEmpty()) emptyPreferences() else mutablePreferencesOf(*pairs)))

    private val shuffleMode = stringPreferencesKey("shuffle_mode")

    @Test
    fun aFreshInstallComesBackToPlainShuffle() = runBlocking {
        assertEquals(ShuffleMode.SHUFFLE, settings().lastShuffleMode.first())
    }

    @Test
    fun turningShuffleOffKeepsTheLastMode() = runBlocking {
        val s = settings()
        s.setShuffleMode(ShuffleMode.REDISCOVER)
        s.setShuffleMode(ShuffleMode.OFF)
        assertEquals(ShuffleMode.OFF, s.shuffleMode.first())
        assertEquals(ShuffleMode.REDISCOVER, s.lastShuffleMode.first())
    }

    @Test
    fun anUpgradeReadsTheModeThatWasOn() = runBlocking {
        assertEquals(ShuffleMode.REDISCOVER, settings(shuffleMode to "REDISCOVER").lastShuffleMode.first())
    }

    @Test
    fun anUpgradeKeepsTheModeWhenTheFirstTapTurnsShuffleOff() = runBlocking {
        val s = settings(shuffleMode to "REDISCOVER")
        s.setShuffleMode(ShuffleMode.OFF)
        assertEquals(ShuffleMode.REDISCOVER, s.lastShuffleMode.first())
    }

    @Test
    fun anUpgradeWithShuffleOffComesBackToPlainShuffle() = runBlocking {
        val s = settings(shuffleMode to "OFF")
        assertEquals(ShuffleMode.SHUFFLE, s.lastShuffleMode.first())
        s.setShuffleMode(ShuffleMode.OFF)
        assertEquals(ShuffleMode.SHUFFLE, s.lastShuffleMode.first())
    }

    @Test
    fun theOldOnOffKeyStillReadsAsShuffle() = runBlocking {
        assertEquals(ShuffleMode.SHUFFLE, settings(booleanPreferencesKey("shuffle") to true).shuffleMode.first())
    }
}
