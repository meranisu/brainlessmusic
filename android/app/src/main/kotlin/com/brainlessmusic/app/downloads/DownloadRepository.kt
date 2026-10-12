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
import com.brainlessmusic.app.data.remote.TokenProvider
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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
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
    private val tokenProvider: TokenProvider,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _downloads = MutableStateFlow<Map<Int, TrackDownload>>(emptyMap())
    val downloads: StateFlow<Map<Int, TrackDownload>> = _downloads.asStateFlow()

    private val _spaceUsed = MutableStateFlow(0L)

    /** Bytes the downloads take on the phone, finished or not. */
    val spaceUsed: StateFlow<Long> = _spaceUsed.asStateFlow()

    private val _paused = MutableStateFlow(manager.downloadsPaused)

    /** Pause all from the Downloads tab, or a 401 (see [needsSignIn]). */
    val paused: StateFlow<Boolean> = _paused.asStateFlow()

    private val _needsSignIn = MutableStateFlow(false)

    /** The server answered 401 to a download: the session ran out, and the queue is paused until a sign-in. */
    val needsSignIn: StateFlow<Boolean> = _needsSignIn.asStateFlow()

    private var progressPoll: Job? = null

    /** One storage check at a time, so two downloads started together can't both count the same free room. */
    private val roomCheck = Mutex()

    /**
     * Sizes of songs let past the storage limit that aren't finished yet. `cacheSpace` only counts bytes already written,
     * so without these, downloads still in the queue were invisible to the next check (C20). Main thread only.
     */
    private val reserved = mutableMapOf<Int, Long>()

    private val _loaded = MutableStateFlow(false)

    /**
     * Whether the stored downloads have been read. Until then [isDownloaded] is false for everything, so offline
     * decisions must wait for it rather than conclude nothing is on the phone. A flow so that waiting code hears about
     * it even when nothing is downloaded (the downloads map then doesn't change).
     */
    val loaded: StateFlow<Boolean> = _loaded.asStateFlow()

    val isLoaded: Boolean get() = _loaded.value

    init {
        manager.addListener(object : DownloadManager.Listener {
            override fun onDownloadChanged(manager: DownloadManager, download: Download, finalException: Exception?) {
                put(download)
                if (download.state == Download.STATE_COMPLETED || download.state == Download.STATE_FAILED) {
                    trackIdOf(download.request.id)?.let { reserved -= it }
                }
                if (finalException.isUnauthorized() || finalException?.cause.isUnauthorized()) {
                    // Every other song would fail the same way; wait for a sign-in instead.
                    _needsSignIn.value = true
                    DownloadService.sendPauseDownloads(context, MusicDownloadService::class.java, false)
                }
            }

            override fun onDownloadsPausedChanged(manager: DownloadManager, downloadsPaused: Boolean) {
                _paused.value = downloadsPaused
            }

            override fun onDownloadRemoved(manager: DownloadManager, download: Download) {
                trackIdOf(download.request.id)?.let {
                    _downloads.value -= it
                    reserved -= it
                }
                refreshSpaceUsed()
                pollWhileActive()
            }
        })
        scope.launch {
            // A broken index shows as nothing downloaded rather than taking the app down.
            val stored = runCatching { withContext(Dispatchers.IO) { readIndex() } }.getOrDefault(emptyMap())
            // Loaded first: a collector woken by the map below must already see it.
            _loaded.value = true
            // A listener update that landed first is newer than the index.
            _downloads.value = stored + _downloads.value
            _spaceUsed.value = readSpaceUsed()
            // Unfinished downloads left by a closed app carry on.
            if (stored.values.any { it.isActive }) {
                runCatching { DownloadService.start(context, MusicDownloadService::class.java) }
            }
            pollWhileActive()
        }
        scope.launch {
            // Paused by a 401 (see [needsSignIn]): the next sign-in picks the queue up again, rather than it waiting for
            // someone to tap Download.
            tokenProvider.token.collect { token ->
                if (token != null && _needsSignIn.value) resumeAll()
            }
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
            DownloadedTrack(it.id, it.title, it.artistName ?: album.artistName, album.title, album.id, it.trackNumber, it.duration, it.format, it.gainDb)
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
        playlist.tracks.map { DownloadedTrack(it.id, it.title, it.artist, it.album, it.albumId, it.trackNumber, it.duration, it.format, it.gainDb) },
        onRefused,
    )

    /** One song, kept in the "Songs" group on the Downloads screen. [onDone] gets the line to show, either way. */
    fun downloadSong(item: QueueItem, onDone: (String) -> Unit) {
        scope.launch {
            roomFor(listOf(item.trackId))?.let { onDone(it); return@launch }
            // Saved first, so the row and the Songs tile have their picture when they appear.
            saveCover(songCoverKey(item.trackId), libraryRepository.trackCoverUrl(item.trackId))
            dao.addToGroup(
                DownloadGroup(SONGS_GROUP, KIND_SONGS, "Songs", "Downloaded one at a time", null, System.currentTimeMillis()),
                DownloadedTrack(
                    item.trackId, item.title, item.artist, item.album, item.albumId, item.trackNumber, item.durationSec,
                    item.format, item.gainDb,
                ),
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
            withContext(Dispatchers.IO) { songCoverFile(trackId).delete() }
        }
    }

    /**
     * The cover of a song downloaded on its own, as a file URI; the "Songs" group has none of its own. Null when it
     * couldn't be saved.
     */
    fun songCoverUri(trackId: Int): String? = songCoverFile(trackId).takeIf { it.exists() }?.toUri()?.toString()

    private fun songCoverFile(trackId: Int) = coverFile(songCoverKey(trackId))

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
    private suspend fun roomFor(trackIds: List<Int>): String? = roomCheck.withLock {
        val limitGb = settings.downloadLimitGb.first()
        if (limitGb <= 0) return@withLock null
        val limit = limitGb * BYTES_PER_GB
        val missing = trackIds.distinct().filterNot { isDownloaded(it) || it in reserved }
        // A few at a time: a 400-song playlist mustn't put 400 requests on the server at once (C28).
        val lookups = Semaphore(SIZE_LOOKUPS_AT_ONCE)
        val sizes = coroutineScope {
            missing.map { id ->
                async { lookups.withPermit { libraryRepository.getTrackDetail(id).getOrNull()?.fileSize ?: 0L } }
            }.awaitAll()
        }
        // What the queue still has to write: its reserved sizes, less what the cache already holds of them.
        val written = manager.currentDownloads.associate { trackIdOf(it.request.id) to it.bytesDownloaded }
        val stillToCome = reserved.entries.sumOf { (id, size) -> (size - (written[id] ?: 0L)).coerceAtLeast(0L) }
        if (readSpaceUsed() + stillToCome + sizes.sum() > limit) {
            return@withLock "Not enough room under your $limitGb GB download limit. Change it in Settings, Downloads."
        }
        missing.zip(sizes).forEach { (id, size) -> reserved[id] = size }
        null
    }

    /**
     * The server answered album [oldId] with [newId] (`mergedFrom`, v0.4): a download of the old album becomes the new
     * one. If both were downloaded, the old group's saved cover goes, since the new group keeps its own.
     */
    fun albumMoved(oldId: Int, newId: Int) {
        if (oldId == newId) return
        scope.launch {
            val oldCover = dao.group("album:$oldId")?.coverPath
            val newExisted = dao.group("album:$newId") != null
            dao.moveAlbum(oldId, newId)
            if (newExisted && oldCover != null) withContext(Dispatchers.IO) { File(oldCover).delete() }
        }
    }

    /**
     * Removes a group's download. Its songs that another group still holds stay on the phone. [trackIds] are the
     * group's songs as the caller knows them, so an album downloaded before groups were kept is still removed.
     */
    fun removeGroup(groupId: String, trackIds: List<Int> = emptyList()) {
        scope.launch {
            val coverPath = dao.group(groupId)?.coverPath
            remove(dao.deleteGroup(groupId, trackIds))
            withContext(Dispatchers.IO) {
                coverPath?.let { File(it).delete() }
                if (groupId == SONGS_GROUP) trackIds.forEach { songCoverFile(it).delete() }
            }
        }
    }

    /** Best effort: with no cover the group still downloads and shows a blank square. */
    private suspend fun saveCover(groupId: String, url: String?): String? {
        url ?: return null
        return withContext(Dispatchers.IO) {
            runCatching {
                okHttpClient.newCall(Request.Builder().url(url).build()).execute().use { response ->
                    val body = response.body?.takeIf { response.isSuccessful } ?: return@use null
                    val file = coverFile(groupId)
                    file.parentFile?.mkdirs()
                    file.outputStream().use { body.byteStream().copyTo(it) }
                    file.absolutePath
                }
            }.getOrNull()
        }
    }

    private fun coverFile(key: String) = File(context.filesDir, "$COVERS_DIR/${key.replace(':', '-')}")

    fun pauseAll() = DownloadService.sendPauseDownloads(context, MusicDownloadService::class.java, false)

    fun resumeAll() {
        _needsSignIn.value = false
        DownloadService.sendResumeDownloads(context, MusicDownloadService::class.java, false)
    }

    /**
     * Downloads songs already listed in a group again (from its page: one that failed, or was removed on its own),
     * checked against the storage limit like any download.
     */
    fun downloadAgain(trackIds: List<Int>, onRefused: (String) -> Unit) {
        scope.launch {
            roomFor(trackIds)?.let { onRefused(it); return@launch }
            download(trackIds)
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
        refreshSpaceUsed()
        pollWhileActive()
    }

    /**
     * `cacheSpace` waits for the cache's own start-up, which reads its index and scans every downloaded file, so it is
     * never read on the main thread: with a big offline library that froze the app at launch (C30).
     */
    private suspend fun readSpaceUsed(): Long = withContext(Dispatchers.IO) { cache.cacheSpace }

    private fun refreshSpaceUsed() {
        scope.launch { _spaceUsed.value = readSpaceUsed() }
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
                _spaceUsed.value = readSpaceUsed()
                delay(500)
            }
        }
    }

    private fun readIndex(): Map<Int, TrackDownload> = buildMap {
        manager.downloadIndex.getDownloads().use { cursor ->
            while (cursor.moveToNext()) {
                val d = cursor.download
                trackIdOf(d.request.id)?.let { put(it, d.toTrackDownload()) }
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
private fun songCoverKey(trackId: Int) = "song:$trackId"
private const val COVERS_DIR = "download-covers"
private const val BYTES_PER_GB = 1_000_000_000L

/** Size lookups in flight at once for the storage check. */
private const val SIZE_LOOKUPS_AT_ONCE = 4
