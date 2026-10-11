package com.brainlessmusic.app.ui.downloads

import com.brainlessmusic.app.downloads.DownloadGroup
import com.brainlessmusic.app.downloads.DownloadedTrack
import com.brainlessmusic.app.downloads.DownloadedTrackWithCover
import com.brainlessmusic.app.downloads.GroupDownload
import com.brainlessmusic.app.downloads.KIND_ALBUM
import com.brainlessmusic.app.downloads.KIND_PLAYLIST
import com.brainlessmusic.app.downloads.KIND_SONGS
import com.brainlessmusic.app.downloads.SONGS_GROUP
import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadSearchTest {

    private fun group(id: String, kind: String, name: String, subtitle: String? = null) =
        DownloadRow(DownloadGroup(id, kind, name, subtitle, null, 0), emptyList(), 0, GroupDownload.None, emptyList())

    private fun song(id: Int, title: String, artist: String?, album: String?, number: Int? = null) = DownloadSongRow(
        DownloadedTrackWithCover(DownloadedTrack(id, title, artist, album, null, number, null, null), null),
        null,
        null,
    )

    // Newest first, the order the phone keeps them in.
    private val ui = DownloadsUi(
        groups = listOf(
            group("playlist:1", KIND_PLAYLIST, "Road trip"),
            group(SONGS_GROUP, KIND_SONGS, "Songs", "Downloaded one at a time"),
            group("album:2", KIND_ALBUM, "Renaissance", "Beyoncé"),
            group("album:1", KIND_ALBUM, "Abbey Road", "The Beatles"),
        ),
        songs = listOf(
            song(1, "Something", "The Beatles", "Abbey Road", 2),
            song(2, "Cuff It", "Beyoncé", "Renaissance", 4),
            song(3, "Come Together", "The Beatles", "Abbey Road", 1),
        ),
        active = emptyList(),
        albumCount = 2,
        playlistCount = 1,
        doneSongCount = 3,
        spaceUsed = 0,
        limitGb = 0,
        paused = false,
        needsSignIn = false,
    )

    private fun List<DownloadRow>.names() = map { it.group.name }

    private fun List<DownloadSongRow>.titles() = map { it.song.track.title }

    @Test
    fun `no search keeps every tile in the order they were added`() {
        assertEquals(listOf("Road trip", "Songs", "Renaissance", "Abbey Road"), ui.tilesFor(DownloadFilter.ALL, "  ").names())
    }

    @Test
    fun `search matches names and artists, ignoring case and accents, and drops the Songs tile`() {
        assertEquals(listOf("Road trip", "Abbey Road"), ui.tilesFor(DownloadFilter.ALL, "ROAD").names())
        assertEquals(listOf("Renaissance"), ui.tilesFor(DownloadFilter.ALL, "beyonce").names())
        assertEquals(emptyList<String>(), ui.tilesFor(DownloadFilter.ALL, "songs").names())
    }

    @Test
    fun `every word has to match`() {
        assertEquals(listOf("Abbey Road"), ui.tilesFor(DownloadFilter.ALL, "beatles road").names())
        assertEquals(listOf("Come Together"), ui.songsFor("together beatles").titles())
    }

    @Test
    fun `the filter still applies while searching`() {
        assertEquals(listOf("Road trip"), ui.tilesFor(DownloadFilter.PLAYLISTS, "road").names())
        assertEquals(emptyList<String>(), ui.tilesFor(DownloadFilter.SONGS, "road").names())
    }

    @Test
    fun `songs match on title, artist or album`() {
        assertEquals(listOf("Cuff It"), ui.songsFor("renaissance").titles())
        assertEquals(listOf("Something", "Come Together"), ui.songsFor("abbey").titles())
    }

    @Test
    fun `name sort keeps the Songs tile first`() {
        assertEquals(
            listOf("Songs", "Abbey Road", "Renaissance", "Road trip"),
            ui.tilesFor(DownloadFilter.ALL, sort = DownloadSort.NAME).names(),
        )
    }

    @Test
    fun `artist sort puts albums by artist, then playlists`() {
        assertEquals(
            listOf("Songs", "Renaissance", "Abbey Road", "Road trip"),
            ui.tilesFor(DownloadFilter.ALL, sort = DownloadSort.ARTIST).names(),
        )
    }

    @Test
    fun `artist sort orders songs by album and track number`() {
        assertEquals(
            listOf("Cuff It", "Come Together", "Something"),
            ui.songsFor(sort = DownloadSort.ARTIST).titles(),
        )
    }
}
