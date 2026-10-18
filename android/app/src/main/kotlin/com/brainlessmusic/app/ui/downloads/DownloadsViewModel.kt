package com.brainlessmusic.app.ui.downloads

import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.remote.NetworkMonitor
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.downloads.CachedTrack
import com.brainlessmusic.app.downloads.DownloadDao
import com.brainlessmusic.app.downloads.SongCache
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
import kotlinx.coroutines.launch
import java.io.File
import java.text.Normalizer
import java.util.Locale
import javax.inject.Inject

/** One tile: a downloaded album or playlist (or the single-songs group) and how much of it is on the phone. */
data class DownloadRow(
    val group: DownloadGroup,
    val trackIds: List<Int>,
    val doneCount: Int,
    val state: GroupDownload,
    /** Covers for the tile: the group's own, or for "Songs" its newest songs' (four make a mosaic). */
    val covers: List<String?> = listOf(group.coverPath?.let { File(it).toUri().toString() }),
    /** What its songs take on the phone, finished or not. A song in two groups counts in both. */
    val bytes: Long = 0L,
)

/** One downloaded song, for the Songs filter and the in-progress list. */
data class DownloadSongRow(val song: DownloadedTrackWithCover, val download: TrackDownload?, val coverUri: String?)

enum class DownloadFilter(val label: String) {
    ALL("All"), ALBUMS("Albums"), PLAYLISTS("Playlists"), SONGS("Songs"),

    /** Songs kept from streaming (A199); the chip shows only when there are some. */
    CACHED("Cached"),
}

/** One whole song in the cache of played songs. Its cover is the server's, which Coil may have kept for offline. */
data class CachedSongRow(val track: CachedTrack, val coverUri: String?)

enum class DownloadSort(val label: String) { RECENT("Recently added"), NAME("Name"), ARTIST("Artist") }

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
    val waitingForWifi: Boolean = false,
    /** Played and kept whole, played most recently first; downloaded songs are left out. */
    val cached: List<CachedSongRow> = emptyList(),
    /** Everything in the queue: running, waiting, paused and failed songs, in the order they were added. */
    val queue: List<DownloadSongRow> = active,
) {
    val isEmpty: Boolean get() = groups.isEmpty() && cached.isEmpty()
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
    val waitingForWifi: Boolean,
)

@OptIn(UnstableApi::class)
@HiltViewModel
class DownloadsViewModel @Inject constructor(
    dao: DownloadDao,
    private val downloads: DownloadRepository,
    private val playbackController: PlaybackController,
    settings: PlaybackSettings,
    networkMonitor: NetworkMonitor,
    private val songCache: SongCache,
    libraryRepository: LibraryRepository,
) : ViewModel() {

    private val reload = MutableStateFlow(0)

    private val _filter = MutableStateFlow(DownloadFilter.ALL)
    val filter: StateFlow<DownloadFilter> = _filter

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query

    private val _sort = MutableStateFlow(DownloadSort.RECENT)
    val sort: StateFlow<DownloadSort> = _sort

    val online: StateFlow<Boolean> = networkMonitor.online

    private val stored = combine(dao.groups(), dao.groupTracks(), dao.allTracks()) { groups, links, songs ->
        val byGroup = links.groupBy({ it.groupId }, { it.trackId })
        Stored(groups, byGroup, songs, byGroup[SONGS_GROUP].orEmpty().associateWith { downloads.songCoverUri(it) })
    }.flowOn(Dispatchers.IO)

    private val holds = combine(downloads.paused, downloads.needsSignIn, downloads.waitingForWifi) { paused, signIn, wifi ->
        Triple(paused, signIn, wifi)
    }

    private val live = combine(
        downloads.downloads,
        downloads.spaceUsed,
        settings.downloadLimitGb,
        holds,
    ) { states, used, limit, (paused, signIn, wifi) -> Live(states, used, limit, paused, signIn, wifi) }

    @kotlin.OptIn(ExperimentalCoroutinesApi::class)
    val ui: StateFlow<LoadState<DownloadsUi>> = reload.flatMapLatest {
        combine(stored, live, songCache.cachedTracks) { s, l, cachedTracks ->
            val rows = s.groups.map { g ->
                val ids = s.links[g.id].orEmpty()
                val row = DownloadRow(
                    g, ids, ids.count { l.downloads[it]?.isDone == true }, groupDownload(ids, l.downloads),
                    bytes = ids.sumOf { l.downloads[it]?.bytes ?: 0L },
                )
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
                    queue = songs.filter { it.download?.let { d -> d.isActive || d.isStopped || d.isFailed } == true },
                    albumCount = s.groups.count { it.kind == KIND_ALBUM },
                    playlistCount = s.groups.count { it.kind == KIND_PLAYLIST },
                    doneSongCount = songs.count { it.download?.isDone == true },
                    spaceUsed = l.spaceUsed,
                    limitGb = l.limitGb,
                    paused = l.paused,
                    needsSignIn = l.needsSignIn,
                    waitingForWifi = l.waitingForWifi,
                    cached = cachedTracks
                        .filter { l.downloads[it.trackId]?.isDone != true }
                        .map { CachedSongRow(it, libraryRepository.trackCoverUrl(it.trackId)) },
                ),
            )
        }.catch<LoadState<DownloadsUi>> { emit(LoadState.Error("Couldn't read your downloads.")) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LoadState.Loading)

    fun setFilter(filter: DownloadFilter) {
        _filter.value = filter
    }

    fun setQuery(query: String) {
        _query.value = query
    }

    fun setSort(sort: DownloadSort) {
        _sort.value = sort
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

    /** A song from a list on screen: plays that list's downloaded songs from that one on. */
    fun playSong(shown: List<DownloadSongRow>, row: DownloadSongRow, onNothingToPlay: (String) -> Unit) {
        val ready = shown.filter { it.download?.isDone == true || (online.value && it == row) }
        val index = ready.indexOf(row)
        if (index < 0) {
            onNothingToPlay("This song isn't on the phone yet.")
            return
        }
        playbackController.playQueue(ready.map { it.toQueueItem() }, index)
    }

    /** Every cached song, in the order shown. */
    fun playCached(shown: List<CachedSongRow>, shuffle: Boolean, onNothingToPlay: (String) -> Unit) {
        if (shown.isEmpty()) {
            onNothingToPlay("Nothing is cached yet.")
            return
        }
        playbackController.playQueue(shown.map { it.toQueueItem() }, if (shuffle) shown.indices.random() else 0, shuffle = shuffle)
    }

    /** A cached song tapped: plays the cached list from that one on. */
    fun playCachedSong(shown: List<CachedSongRow>, row: CachedSongRow) {
        val index = shown.indexOf(row)
        if (index >= 0) playbackController.playQueue(shown.map { it.toQueueItem() }, index)
    }

    fun downloadCached(row: CachedSongRow, onDone: (String) -> Unit) = downloads.downloadSong(row.toQueueItem(), onDone)

    fun removeCached(row: CachedSongRow) {
        viewModelScope.launch { songCache.remove(row.track.trackId) }
    }

    fun pauseAll() = downloads.pauseAll()

    fun resumeAll() = downloads.resumeAll()

    fun pauseSong(row: DownloadSongRow) = downloads.pause(row.song.track.trackId)

    fun resumeSong(row: DownloadSongRow) = downloads.resume(row.song.track.trackId)

    /** Takes a queued song out of the queue. Same as removing it: an album or playlist that holds it can fetch it again. */
    fun cancelSong(row: DownloadSongRow) = downloads.removeSong(row.song.track.trackId)

    /** A failed song starts over. */
    fun retrySong(row: DownloadSongRow, onRefused: (String) -> Unit) =
        downloads.downloadAgain(listOf(row.song.track.trackId), onRefused)

    fun removeSong(row: DownloadSongRow) = downloads.removeSong(row.song.track.trackId)
}

internal fun DownloadSongRow.toQueueItem() = song.track.toQueueItem(coverUri)

internal fun CachedSongRow.toQueueItem() = track.toQueueItem(coverUri)

/** "12 songs", or "8 of 12 songs" while some aren't on the phone. */
internal fun songCount(done: Int, total: Int): String {
    val songs = if (total == 1) "1 song" else "$total songs"
    return if (done == total) songs else "$done of $songs"
}

/** The line under a tile's name. */
internal fun DownloadRow.status(): String = when (state) {
    is GroupDownload.Running -> "Downloading, ${state.percent}%"
    GroupDownload.Failed -> "Some songs failed"
    GroupDownload.Paused -> "Paused"
    else -> songCount(doneCount, trackIds.size)
}

internal val DownloadRow.canRetry: Boolean
    get() = state == GroupDownload.Failed || (state == GroupDownload.None && doneCount < trackIds.size)

/** What goes under a tile's name: the artist, how far along it is, and the space it takes once it takes any. */
internal fun DownloadRow.detail(sizeText: (Long) -> String): String =
    listOfNotNull(group.subtitle, status(), bytes.takeIf { it > 0 }?.let(sizeText)).joinToString(" · ")

/**
 * The filter's tiles that match [query], in [sort] order; Songs shows songs instead, so it has none. While searching,
 * the Songs tile drops out: its songs are listed one by one below the tiles.
 */
internal fun DownloadsUi.tilesFor(
    filter: DownloadFilter,
    query: String = "",
    sort: DownloadSort = DownloadSort.RECENT,
): List<DownloadRow> {
    val kind = when (filter) {
        DownloadFilter.ALL -> null
        DownloadFilter.ALBUMS -> KIND_ALBUM
        DownloadFilter.PLAYLISTS -> KIND_PLAYLIST
        DownloadFilter.SONGS, DownloadFilter.CACHED -> return emptyList()
    }
    val words = searchWords(query)
    val shown = groups.filter { row ->
        (kind == null || row.group.kind == kind) &&
            (words.isEmpty() || (row.group.kind != KIND_SONGS && matches(words, row.group.name, row.group.subtitle)))
    }
    // The groups come newest first. The Songs tile has no name or artist to sort by, so it stays at the front.
    val byName = compareBy<DownloadRow>({ it.group.kind != KIND_SONGS }, { it.group.name.lowercase() })
    return when (sort) {
        DownloadSort.RECENT -> shown
        DownloadSort.NAME -> shown.sortedWith(byName)
        DownloadSort.ARTIST -> shown.sortedWith(
            compareBy<DownloadRow>({ it.group.kind != KIND_SONGS }, { it.artistKey == null }, { it.artistKey })
                .thenComparing(byName),
        )
    }
}

/** An album's artist, for sorting; playlists and the Songs tile have none. */
private val DownloadRow.artistKey: String? get() = group.subtitle?.takeIf { group.kind == KIND_ALBUM }?.lowercase()

/** The songs that match [query] by title, artist or album, in [sort] order. */
internal fun DownloadsUi.songsFor(query: String = "", sort: DownloadSort = DownloadSort.RECENT): List<DownloadSongRow> {
    val words = searchWords(query)
    val shown = if (words.isEmpty()) songs else songs.filter {
        matches(words, it.song.track.title, it.song.track.artist, it.song.track.album)
    }
    return when (sort) {
        DownloadSort.RECENT -> shown
        DownloadSort.NAME -> shown.sortedBy { it.song.track.title.lowercase() }
        DownloadSort.ARTIST -> shown.sortedWith(
            compareBy<DownloadSongRow>(
                { it.song.track.artist == null },
                { it.song.track.artist?.lowercase() },
                { it.song.track.album?.lowercase() },
                { it.song.track.trackNumber ?: Int.MAX_VALUE },
                { it.song.track.title.lowercase() },
            ),
        )
    }
}

/** [query] split into words, folded so "beyonce" finds "Beyoncé" and case doesn't matter. */
/** The cached songs that match [query], in [sort] order; "Recently added" is played most recently. */
internal fun DownloadsUi.cachedFor(query: String = "", sort: DownloadSort = DownloadSort.RECENT): List<CachedSongRow> {
    val words = searchWords(query)
    val shown = if (words.isEmpty()) cached else cached.filter { matches(words, it.track.title, it.track.artist, it.track.album) }
    return when (sort) {
        DownloadSort.RECENT -> shown
        DownloadSort.NAME -> shown.sortedBy { it.track.title.lowercase() }
        DownloadSort.ARTIST -> shown.sortedWith(
            compareBy<CachedSongRow>(
                { it.track.artist == null },
                { it.track.artist?.lowercase() },
                { it.track.album?.lowercase() },
                { it.track.trackNumber ?: Int.MAX_VALUE },
                { it.track.title.lowercase() },
            ),
        )
    }
}

internal fun searchWords(query: String): List<String> = fold(query).split(' ').filter { it.isNotEmpty() }

/** Every word appears somewhere in [fields]. */
private fun matches(words: List<String>, vararg fields: String?): Boolean {
    val text = fold(fields.filterNotNull().joinToString(" "))
    return words.all { it in text }
}

private val MARKS = Regex("\\p{Mn}+")
private val SPACES = Regex("\\s+")

private fun fold(text: String): String =
    MARKS.replace(Normalizer.normalize(text, Normalizer.Form.NFD), "").lowercase(Locale.ROOT).replace(SPACES, " ")
