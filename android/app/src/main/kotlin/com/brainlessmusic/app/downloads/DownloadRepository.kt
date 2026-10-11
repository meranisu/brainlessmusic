package com.brainlessmusic.app.downloads

import android.content.Context
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.cache.Cache
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.PlaylistDetailDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.playback.QueueItem
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/** One song's download, as the screens need it. */
@OptIn(UnstableApi::class)
data class TrackDownload(val state: Int, val percent: Float) {
    val isDone: Boolean get() = state == Download.STATE_COMPLETED
    val isActive: Boolean
        get() = state == Download.STATE_QUEUED || state == Download.STATE_DOWNLOADING || state == Download.STATE_RESTARTING
    val isFailed: Boolean get() = state == Download.STATE_FAILED
}

/** Downloads by track id, kept current from [DownloadManager]; every change goes through [MusicDownloadService]. */
@UnstableApi
@Singleton
class DownloadRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val manager: DownloadManager,
    private val libraryRepository: LibraryRepository,
    private val dao: DownloadDao,
    private val cache: Cache,
    private val okHttpClient: OkHttpClient,
    private val settings: PlaybackSettings,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _downloads = MutableStateFlow<Map<Int, TrackDownload>>(emptyMap())
    val downloads: StateFlow<Map<Int, TrackDownload>> = _downloads.asStateFlow()

    private val _spaceUsed = MutableStateFlow(0L)

    /** Bytes the downloads take on the phone, finished or not. */
    val spaceUsed: StateFlow<Long> = _spaceUsed.asStateFlow()

    private val _needsSignIn = MutableStateFlow(false)

    /** The server answered 401 to a download: the session ran out, and the queue is paused until a sign-in. */
    val needsSignIn: StateFlow<Boolean> = _needsSignIn.asStateFlow()

    private var progressPoll: Job? = null

    init {
        manager.addListener(object : DownloadManager.Listener {
            override fun onDownloadChanged(manager: DownloadManager, download: Download, finalException: Exception?) {
                put(download)
                if (finalException.isUnauthorized() || finalException?.cause.isUnauthorized()) {
                    // Every other song would fail the same way; wait for a sign-in instead.
                    _needsSignIn.value = true
                    DownloadService.sendPauseDownloads(context, MusicDownloadService::class.java, false)
                }
            }

            override fun onDownloadRemoved(manager: DownloadManager, download: Download) {
                trackIdOf(download.request.id)?.let { _downloads.value -= it }
                _spaceUsed.value = cache.cacheSpace
                pollWhileActive()
            }
        })
        scope.launch {
            val stored = withContext(Dispatchers.IO) {
                buildMap {
                    manager.downloadIndex.getDownloads().use { cursor ->
                        while (cursor.moveToNext()) {
                            val d = cursor.download
                            trackIdOf(d.request.id)?.let { put(it, d.toTrackDownload()) }
                        }
                    }
                }
            }
            // A listener update that landed first is newer than the index.
            _downloads.value = stored + _downloads.value
            _spaceUsed.value = cache.cacheSpace
            // Unfinished downloads left by a closed app carry on.
            if (stored.values.any { it.isActive }) {
                runCatching { DownloadService.start(context, MusicDownloadService::class.java) }
            }
            pollWhileActive()
        }
    }

    /** Whether the original-quality file is on the phone, so the player can skip data saver for it. */
    fun isDownloaded(trackId: Int): Boolean = _downloads.value[trackId]?.isDone == true

    /** Queues [trackIds] at original quality. Already-downloaded ones are left alone; failed ones start over. */
    fun download(trackIds: List<Int>) {
        if (_needsSignIn.value) {
            _needsSignIn.value = false
            DownloadService.sendResumeDownloads(context, MusicDownloadService::class.java, false)
        }
        for (id in trackIds) {
            if (isDownloaded(id)) continue
            val url = libraryRepository.streamUrl(id) ?: return
            val request = DownloadRequest.Builder(downloadId(id), url.toUri()).build()
            DownloadService.sendAddDownload(context, MusicDownloadService::class.java, request, false)
        }
    }

    /**
     * Saves what the album is called and its cover, so the Downloads screen needs no signal, then queues its songs.
     * [onRefused] gets the reason when the storage limit (A88) has no room for it.
     */
    fun downloadAlbum(album: AlbumDetailDto, onRefused: (String) -> Unit) = downloadGroup(
        DownloadGroup("album:${album.id}", KIND_ALBUM, album.title, album.artistName, null, System.currentTimeMillis()),
        libraryRepository.albumCoverUrl(album.id),
        album.tracks.map {
            DownloadedTrack(it.id, it.title, album.artistName, album.title, album.id, it.trackNumber, it.duration, it.format)
        },
        onRefused,
    )

    /**
     * A snapshot of the playlist: songs added later aren't fetched until it is downloaded again, which also lets go of
     * songs taken out of it. The cover is its first song's.
     */
    fun downloadPlaylist(playlist: PlaylistDetailDto, onRefused: (String) -> Unit) = downloadGroup(
        DownloadGroup("playlist:${playlist.id}", KIND_PLAYLIST, playlist.name, null, null, System.currentTimeMillis()),
        playlist.tracks.firstOrNull()?.let { libraryRepository.trackCoverUrl(it.id) },
        playlist.tracks.map { DownloadedTrack(it.id, it.title, it.artist, it.album, it.albumId, it.trackNumber, it.duration, it.format) },
        onRefused,
    )

    /** One song, kept in the "Songs" group on the Downloads screen. [onDone] gets the line to show, either way. */
    fun downloadSong(item: QueueItem, onDone: (String) -> Unit) {
        scope.launch {
            roomFor(listOf(item.trackId))?.let { onDone(it); return@launch }
            dao.addToGroup(
                DownloadGroup(SONGS_GROUP, KIND_SONGS, "Songs", "Downloaded one at a time", null, System.currentTimeMillis()),
                DownloadedTrack(item.trackId, item.title, item.artist, item.album, item.albumId, item.trackNumber, item.durationSec, item.format),
            )
            download(listOf(item.trackId))
            onDone("Downloading \"${item.title}\".")
        }
    }

    /**
     * Takes one song off the phone, from the song menu. It leaves the "Songs" group; an album or playlist that holds it
     * keeps it on its list, shown as not downloaded, so its download button offers it again.
     */
    fun removeSong(trackId: Int) {
        scope.launch {
            dao.removeFromGroup(SONGS_GROUP, trackId)
            remove(listOf(trackId))
        }
    }

    /** Everything off the phone: files, the list and the saved covers. */
    fun deleteAll() {
        scope.launch {
            DownloadService.sendRemoveAllDownloads(context, MusicDownloadService::class.java, false)
            dao.deleteAll()
            withContext(Dispatchers.IO) { File(context.filesDir, COVERS_DIR).deleteRecursively() }
        }
    }

    private fun downloadGroup(group: DownloadGroup, coverUrl: String?, tracks: List<DownloadedTrack>, onRefused: (String) -> Unit) {
        scope.launch {
            roomFor(tracks.map { it.trackId })?.let { onRefused(it); return@launch }
            val cover = saveCover(group.id, coverUrl)
            remove(dao.saveGroup(group.copy(coverPath = cover), tracks))
            download(tracks.map { it.trackId })
        }
    }

    /**
     * `null` when the storage limit leaves room for the songs in [trackIds] not yet on the phone, otherwise why not.
     * Sizes come from `GET /tracks/:id`; one that can't be fetched counts as nothing rather than blocking the download.
     */
    private suspend fun roomFor(trackIds: List<Int>): String? {
        val limitGb = settings.downloadLimitGb.first()
        if (limitGb <= 0) return null
        val limit = limitGb * BYTES_PER_GB
        val missing = trackIds.filterNot(::isDownloaded)
        val needed = coroutineScope {
            missing.map { id -> async { libraryRepository.getTrackDetail(id).getOrNull()?.fileSize ?: 0L } }.awaitAll().sum()
        }
        val used = cache.cacheSpace
        if (used + needed <= limit) return null
        return "Not enough room under your $limitGb GB download limit. Change it in Settings, Downloads."
    }

    /**
     * Removes a group's download. Its songs that another group still holds stay on the phone. [trackIds] are the
     * group's songs as the caller knows them, so an album downloaded before groups were kept is still removed.
     */
    fun removeGroup(groupId: String, trackIds: List<Int> = emptyList()) {
        scope.launch {
            val coverPath = dao.group(groupId)?.coverPath
            remove(dao.deleteGroup(groupId, trackIds))
            coverPath?.let { withContext(Dispatchers.IO) { File(it).delete() } }
        }
    }

    /**
     * A group's songs as a queue, artwork from the saved cover. [onlyDownloaded] leaves out songs not yet on the
     * phone, for when there is no signal to stream them.
     */
    suspend fun queueOf(groupId: String, onlyDownloaded: Boolean): List<QueueItem> {
        val cover = dao.group(groupId)?.coverPath?.let { File(it).toUri().toString() }
        return dao.tracksOf(groupId)
            .filter { !onlyDownloaded || isDownloaded(it.trackId) }
            .map {
                QueueItem(
                    trackId = it.trackId,
                    title = it.title,
                    artist = it.artist,
                    album = it.album,
                    durationSec = it.durationSec,
                    // Single songs have no saved cover: their own art, when there's signal to fetch it.
                    coverUrl = cover ?: libraryRepository.trackCoverUrl(it.trackId),
                    format = it.format,
                    albumId = it.albumId,
                    trackNumber = it.trackNumber,
                )
            }
    }

    /** Best effort: with no cover the group still downloads and shows a blank square. */
    private suspend fun saveCover(groupId: String, url: String?): String? {
        url ?: return null
        return withContext(Dispatchers.IO) {
            runCatching {
                okHttpClient.newCall(Request.Builder().url(url).build()).execute().use { response ->
                    val body = response.body?.takeIf { response.isSuccessful } ?: return@use null
                    val file = File(context.filesDir, "$COVERS_DIR/${groupId.replace(':', '-')}")
                    file.parentFile?.mkdirs()
                    file.outputStream().use { body.byteStream().copyTo(it) }
                    file.absolutePath
                }
            }.getOrNull()
        }
    }

    fun remove(trackIds: List<Int>) {
        for (id in trackIds) {
            DownloadService.sendRemoveDownload(context, MusicDownloadService::class.java, downloadId(id), false)
        }
    }

    private fun put(download: Download) {
        val id = trackIdOf(download.request.id) ?: return
        _downloads.value += id to download.toTrackDownload()
        _spaceUsed.value = cache.cacheSpace
        pollWhileActive()
    }

    /** The manager reports state changes but not progress, so progress is read twice a second while anything runs. */
    private fun pollWhileActive() {
        if (progressPoll?.isActive == true || _downloads.value.values.none { it.isActive }) return
        progressPoll = scope.launch {
            while (isActive && _downloads.value.values.any { it.isActive }) {
                val running = manager.currentDownloads
                if (running.isNotEmpty()) {
                    _downloads.value += running.mapNotNull { d -> trackIdOf(d.request.id)?.let { it to d.toTrackDownload() } }
                }
                _spaceUsed.value = cache.cacheSpace
                delay(500)
            }
        }
    }

    private fun Download.toTrackDownload() =
        TrackDownload(state, if (state == Download.STATE_COMPLETED) 100f else percentDownloaded.coerceAtLeast(0f))
}

private fun Throwable?.isUnauthorized(): Boolean =
    (this as? HttpDataSource.InvalidResponseCodeException)?.responseCode == 401

const val KIND_ALBUM = "album"
const val KIND_PLAYLIST = "playlist"
const val KIND_SONGS = "songs"
const val SONGS_GROUP = "songs"
private const val COVERS_DIR = "download-covers"
private const val BYTES_PER_GB = 1_000_000_000L
