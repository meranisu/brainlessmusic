package com.brainlessmusic.app.downloads

import android.content.Context
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import com.brainlessmusic.app.data.repository.LibraryRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _downloads = MutableStateFlow<Map<Int, TrackDownload>>(emptyMap())
    val downloads: StateFlow<Map<Int, TrackDownload>> = _downloads.asStateFlow()

    private var progressPoll: Job? = null

    init {
        manager.addListener(object : DownloadManager.Listener {
            override fun onDownloadChanged(manager: DownloadManager, download: Download, finalException: Exception?) {
                put(download)
            }

            override fun onDownloadRemoved(manager: DownloadManager, download: Download) {
                trackIdOf(download.request.id)?.let { _downloads.value -= it }
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
        for (id in trackIds) {
            if (isDownloaded(id)) continue
            val url = libraryRepository.streamUrl(id) ?: return
            val request = DownloadRequest.Builder(downloadId(id), url.toUri()).build()
            DownloadService.sendAddDownload(context, MusicDownloadService::class.java, request, false)
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
                delay(500)
            }
        }
    }

    private fun Download.toTrackDownload() =
        TrackDownload(state, if (state == Download.STATE_COMPLETED) 100f else percentDownloaded.coerceAtLeast(0f))
}
