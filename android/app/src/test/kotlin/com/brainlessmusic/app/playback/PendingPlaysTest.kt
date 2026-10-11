package com.brainlessmusic.app.playback

import com.brainlessmusic.app.data.repository.ConnectionError
import com.brainlessmusic.app.data.repository.ConnectionException
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingPlaysTest {

    @Test
    fun `a 400 or 404 is dropped, anything else is kept for later`() {
        assertTrue(ConnectionException(ConnectionError.Unknown("HTTP 400")).isRefusedForGood())
        assertTrue(ConnectionException(ConnectionError.Unknown("HTTP 404")).isRefusedForGood())
        assertFalse(ConnectionException(ConnectionError.Unauthorized).isRefusedForGood())
        assertFalse(ConnectionException(ConnectionError.Unreachable).isRefusedForGood())
        assertFalse(ConnectionException(ConnectionError.Unknown("HTTP 503")).isRefusedForGood())
        assertFalse(RuntimeException("boom").isRefusedForGood())
        assertFalse(null.isRefusedForGood())
    }
}
