package com.brainlessmusic.app.ui.downloads

import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.remote.NetworkMonitor
import com.brainlessmusic.app.downloads.DownloadDao
import com.brainlessmusic.app.downloads.DownloadGroup
import com.brainlessmusic.app.downloads.DownloadRepository
import com.brainlessmusic.app.downloads.DownloadedTrackWithCover
import com.brainlessmusic.app.downloads.GroupDownload
import com.brainlessmusic.app.downloads.KIND_ALBUM
import com.brainlessmusic.app.downloads.KIND_PLAYLIST
import com.brainlessmusic.app.downloads.KIND_SONGS
import com.brainlessmusic.app.downloads.SONGS_GROUP
import com.brainlessmusic.app.downloads.TrackDownload
import com.brainlessmusic.app.downloads.groupDownload
import com.brainlessmusic.app.downloads.toQueueItem
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.ui.common.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import java.io.File
import javax.inject.Inject

/** One tile: a downloaded album or playlist (or the single-songs group) and how much of it is on the phone. */
data class DownloadRow(
    val group: DownloadGroup,
    val trackIds: List<Int>,
    val doneCount: Int,
    val state: GroupDownload,
    /** Covers for the tile: the group's own, or for "Songs" its newest songs' (four make a mosaic). */
    val covers: List<String?> = listOf(group.coverPath?.let { File(it).toUri().toString() }),
)

/** One downloaded song, for the Songs filter and the in-progress list. */
data class DownloadSongRow(val song: DownloadedTrackWithCover, val download: TrackDownload?, val coverUri: String?)

enum class DownloadFilter(val label: String) { ALL("All"), ALBUMS("Albums"), PLAYLISTS("Playlists"), SONGS("Songs") }

/** Everything the tab shows; only real counts from the phone's own records. */
data class DownloadsUi(
    val groups: List<DownloadRow>,
    val songs: List<DownloadSongRow>,
    val active: List<DownloadSongRow>,
    val albumCount: Int,
    val playlistCount: Int,
    /** Songs whose file is fully on the phone. */
    val doneSongCount: Int,
    val spaceUsed: Long,
    val limitGb: Int,
    val paused: Boolean,
    val needsSignIn: Boolean,
) {
    val isEmpty: Boolean get() = groups.isEmpty()
}

private data class Stored(
    val groups: List<DownloadGroup>,
    val links: Map<String, List<Int>>,
    val songs: List<DownloadedTrackWithCover>,
    /** The saved cover of each song downloaded on its own, by track id. */
    val songCovers: Map<Int, String?>,
) {
    /** The Songs tile's mosaic from [ids]' own covers. */
    fun songCovers(ids: List<Int>): List<String?> {
        val albums = songs.associate { it.track.trackId to it.track.albumId }
        return mosaicCovers(ids.asReversed().map { albums[it] to songCovers[it] })
    }
}

/** The most covers a mosaic shows. */
internal const val MOSAIC_MAX = 6

/**
 * Up to [MOSAIC_MAX] covers, newest first, from (album id, cover) pairs. One per album: two songs off the same album
 * share a picture, so a second copy would waste a cell. Songs with no saved cover are skipped.
 */
internal fun mosaicCovers(newestFirst: List<Pair<Int?, String?>>): List<String> {
    val seen = mutableSetOf<Int>()
    return newestFirst.mapNotNull { (album, cover) -> cover?.takeIf { album == null || seen.add(album) } }.take(MOSAIC_MAX)
}

private data class Live(
    val downloads: Map<Int, TrackDownload>,
    val spaceUsed: Long,
    val limitGb: Int,
    val paused: Boolean,
    val needsSignIn: Boolean,
)

@OptIn(UnstableApi::class)
@HiltViewModel
class DownloadsViewModel @Inject constructor(
    dao: DownloadDao,
    private val downloads: DownloadRepository,
    private val playbackController: PlaybackController,
    settings: PlaybackSettings,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val reload = MutableStateFlow(0)

    private val _filter = MutableStateFlow(DownloadFilter.ALL)
    val filter: StateFlow<DownloadFilter> = _filter

    val online: StateFlow<Boolean> = networkMonitor.online

    private val stored = combine(dao.groups(), dao.groupTracks(), dao.allTracks()) { groups, links, songs ->
        val byGroup = links.groupBy({ it.groupId }, { it.trackId })
        Stored(groups, byGroup, songs, byGroup[SONGS_GROUP].orEmpty().associateWith { downloads.songCoverUri(it) })
    }.flowOn(Dispatchers.IO)

    private val live = combine(
        downloads.downloads,
        downloads.spaceUsed,
        settings.downloadLimitGb,
        downloads.paused,
        downloads.needsSignIn,
    ) { states, used, limit, paused, signIn -> Live(states, used, limit, paused, signIn) }

    @kotlin.OptIn(ExperimentalCoroutinesApi::class)
    val ui: StateFlow<LoadState<DownloadsUi>> = reload.flatMapLatest {
        combine(stored, live) { s, l ->
            val rows = s.groups.map { g ->
                val ids = s.links[g.id].orEmpty()
                val row = DownloadRow(g, ids, ids.count { l.downloads[it]?.isDone == true }, groupDownload(ids, l.downloads))
                if (g.kind == KIND_SONGS) row.copy(covers = s.songCovers(ids)) else row
            }
            val songs = s.songs.map { song ->
                // A song downloaded on its own has no group cover; it has its own.
                val cover = song.coverPath?.let { File(it).toUri().toString() } ?: s.songCovers[song.track.trackId]
                DownloadSongRow(song, l.downloads[song.track.trackId], cover)
            }
            LoadState.Content(
                DownloadsUi(
                    groups = rows,
                    songs = songs,
                    active = songs.filter { it.download?.isActive == true },
                    albumCount = s.groups.count { it.kind == KIND_ALBUM },
                    playlistCount = s.groups.count { it.kind == KIND_PLAYLIST },
                    doneSongCount = songs.count { it.download?.isDone == true },
                    spaceUsed = l.spaceUsed,
                    limitGb = l.limitGb,
                    paused = l.paused,
                    needsSignIn = l.needsSignIn,
                ),
            )
        }.catch<LoadState<DownloadsUi>> { emit(LoadState.Error("Couldn't read your downloads.")) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LoadState.Loading)

    fun setFilter(filter: DownloadFilter) {
        _filter.value = filter
    }

    fun retryLoad() {
        reload.value++
    }

    /** Every song fully on the phone, in the tab's order. [onNothingToPlay] says why nothing started. */
    fun playAll(ui: DownloadsUi, shuffle: Boolean, onNothingToPlay: (String) -> Unit) {
        val items = ui.songs.filter { it.download?.isDone == true }.map { it.toQueueItem() }
        if (items.isEmpty()) {
            onNothingToPlay("Nothing has finished downloading yet.")
            return
        }
        playbackController.playQueue(items, if (shuffle) items.indices.random() else 0, shuffle = shuffle)
    }

    /** A song from the Songs filter: plays the downloaded songs from that one on. */
    fun playSong(ui: DownloadsUi, row: DownloadSongRow, onNothingToPlay: (String) -> Unit) {
        val ready = ui.songs.filter { it.download?.isDone == true || (online.value && it == row) }
        val index = ready.indexOf(row)
        if (index < 0) {
            onNothingToPlay("This song isn't on the phone yet.")
            return
        }
        playbackController.playQueue(ready.map { it.toQueueItem() }, index)
    }

    fun pauseAll() = downloads.pauseAll()

    fun resumeAll() = downloads.resumeAll()

    fun removeSong(row: DownloadSongRow) = downloads.removeSong(row.song.track.trackId)
}

internal fun DownloadSongRow.toQueueItem() = song.track.toQueueItem(coverUri)

/** "12 songs", or "8 of 12 songs" while some aren't on the phone. */
internal fun songCount(done: Int, total: Int): String {
    val songs = if (total == 1) "1 song" else "$total songs"
    return if (done == total) songs else "$done of $songs"
}

/** The line under a tile's name. */
internal fun DownloadRow.status(): String = when (state) {
    is GroupDownload.Running -> "Downloading, ${state.percent}%"
    GroupDownload.Failed -> "Some songs failed"
    else -> songCount(doneCount, trackIds.size)
}

internal val DownloadRow.canRetry: Boolean
    get() = state == GroupDownload.Failed || (state == GroupDownload.None && doneCount < trackIds.size)

/** The filter's tiles; Songs shows songs instead, so it has none. */
internal fun DownloadsUi.tilesFor(filter: DownloadFilter): List<DownloadRow> = when (filter) {
    DownloadFilter.ALL -> groups
    DownloadFilter.ALBUMS -> groups.filter { it.group.kind == KIND_ALBUM }
    DownloadFilter.PLAYLISTS -> groups.filter { it.group.kind == KIND_PLAYLIST }
    DownloadFilter.SONGS -> emptyList()
}
