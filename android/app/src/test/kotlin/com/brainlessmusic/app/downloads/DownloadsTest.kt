package com.brainlessmusic.app.downloads

import androidx.media3.exoplayer.offline.Download
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DownloadsTest {

    @Test
    fun `original and data-saver copies get different keys`() {
        assertEquals("track:42:orig", trackCacheKey("/api/tracks/42/stream", null))
        assertEquals("track:42:low", trackCacheKey("/api/tracks/42/stream", "low"))
    }

    @Test
    fun `non-stream paths keep their URL as the key`() {
        assertNull(trackCacheKey("/api/albums/3/cover", null))
        assertNull(trackCacheKey("/api/tracks/42/stream/extra", null))
        assertNull(trackCacheKey(null, null))
    }

    @Test
    fun `download ids round-trip`() {
        assertEquals(7, trackIdOf(downloadId(7)))
        assertNull(trackIdOf("something-else"))
    }

    private fun d(state: Int, percent: Float = 0f) = TrackDownload(state, percent)

    @Test
    fun `album button sums its songs`() {
        val ids = listOf(1, 2)
        assertEquals(GroupDownload.None, groupDownload(ids, emptyMap()))
        assertEquals(GroupDownload.None, groupDownload(emptyList(), emptyMap()))
        assertEquals(GroupDownload.Done, groupDownload(ids, mapOf(1 to d(Download.STATE_COMPLETED, 100f), 2 to d(Download.STATE_COMPLETED, 100f))))
        assertEquals(
            GroupDownload.Running(75),
            groupDownload(ids, mapOf(1 to d(Download.STATE_COMPLETED, 100f), 2 to d(Download.STATE_DOWNLOADING, 50f))),
        )
        // A song still running wins over one that failed; the failure shows once the rest finish.
        assertEquals(
            GroupDownload.Running(25),
            groupDownload(ids, mapOf(1 to d(Download.STATE_FAILED), 2 to d(Download.STATE_DOWNLOADING, 50f))),
        )
        assertEquals(GroupDownload.Failed, groupDownload(ids, mapOf(1 to d(Download.STATE_COMPLETED, 100f), 2 to d(Download.STATE_FAILED))))
        // Half on the phone, half never asked for: offer the rest.
        assertEquals(GroupDownload.None, groupDownload(ids, mapOf(1 to d(Download.STATE_COMPLETED, 100f))))
    }
}
