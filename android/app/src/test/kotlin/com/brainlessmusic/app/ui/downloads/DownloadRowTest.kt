package com.brainlessmusic.app.ui.downloads

import com.brainlessmusic.app.downloads.DownloadGroup
import com.brainlessmusic.app.downloads.GroupDownload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadRowTest {

    private fun row(done: Int, total: Int, state: GroupDownload, subtitle: String? = "Artist") = DownloadRow(
        DownloadGroup("album:1", "album", "Album", subtitle, null, 0),
        List(total) { it },
        done,
        state,
    )

    @Test
    fun `song count says how many are on the phone`() {
        assertEquals("1 song", songCount(1, 1))
        assertEquals("12 songs", songCount(12, 12))
        assertEquals("8 of 12 songs", songCount(8, 12))
    }

    @Test
    fun `status follows the download`() {
        assertEquals("3 songs", row(3, 3, GroupDownload.Done).status())
        assertEquals("2 of 3 songs", row(2, 3, GroupDownload.None).status())
        assertEquals("Downloading, 40%", row(1, 3, GroupDownload.Running(40)).status())
        assertEquals("Some songs failed", row(2, 3, GroupDownload.Failed).status())
        assertEquals("Paused", row(2, 3, GroupDownload.Paused).status())
    }

    @Test
    fun `tile detail adds the space once a song has any`() {
        val size: (Long) -> String = { "${it / 1_000_000} MB" }
        assertEquals("Artist · 3 songs", row(3, 3, GroupDownload.Done).detail(size))
        assertEquals("Artist · 3 songs · 84 MB", row(3, 3, GroupDownload.Done).copy(bytes = 84_000_000).detail(size))
        assertEquals("3 songs · 5 MB", row(3, 3, GroupDownload.Done, subtitle = null).copy(bytes = 5_000_000).detail(size))
    }

    @Test
    fun `retry is offered only when something is missing and nothing runs`() {
        assertTrue(row(2, 3, GroupDownload.Failed).canRetry)
        assertTrue(row(2, 3, GroupDownload.None).canRetry)
        assertFalse(row(3, 3, GroupDownload.Done).canRetry)
        assertFalse(row(1, 3, GroupDownload.Running(40)).canRetry)
    }

    @Test
    fun `filters pick tiles by kind, and Songs shows no tiles`() {
        fun group(id: String, kind: String) = DownloadRow(DownloadGroup(id, kind, id, null, null, 0), emptyList(), 0, GroupDownload.None)
        val album = group("album:1", "album")
        val playlist = group("playlist:2", "playlist")
        val songs = group("songs", "songs")
        val ui = DownloadsUi(listOf(album, playlist, songs), emptyList(), emptyList(), 1, 1, 0, 0, 0, false, false)
        assertEquals(listOf(album, playlist, songs), ui.tilesFor(DownloadFilter.ALL))
        assertEquals(listOf(album), ui.tilesFor(DownloadFilter.ALBUMS))
        assertEquals(listOf(playlist), ui.tilesFor(DownloadFilter.PLAYLISTS))
        assertEquals(emptyList<DownloadRow>(), ui.tilesFor(DownloadFilter.SONGS))
    }
}
