package com.brainlessmusic.app.playback

import android.os.SystemClock
import android.util.Log
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "PlaybackResume"

/**
 * Keeps `PUT /me/playback-state` current and restores the saved queue on launch, including one started on the web.
 * Logout keeps the saved state: it belongs to the account.
 */
@Singleton
class PlaybackResume @Inject constructor(
    private val controller: PlaybackController,
    private val libraryRepository: LibraryRepository,
    private val settings: PlaybackSettings,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val policy = ResumeSavePolicy()

    // Saves run in the order they were decided; otherwise a slow older one could land last and win.
    private val saveLock = Mutex()

    // Home and Library both ask on launch; one fetch is enough.
    private val restoreLock = Mutex()

    init {
        scope.launch {
            controller.state.collect { state ->
                val snapshot = ResumeSnapshot(state.queue.map { it.trackId }, state.currentIndex, state.isPlaying)
                if (policy.shouldSave(snapshot, SystemClock.elapsedRealtime())) save()
            }
        }
    }

    /** Fetches and queues the saved state once a session exists. Failure is silent. */
    suspend fun restore() {
        restoreLock.withLock { restoreOnce() }
    }

    private suspend fun restoreOnce() {
        if (controller.state.value.hasQueue) return
        val saved = libraryRepository.loadPlaybackState().getOrNull() ?: return
        val items = saved.queue.map(::toQueueItem)
        if (items.isEmpty()) return
        controller.restoreQueue(
            items = items,
            startIndex = saved.queueIndex,
            positionMs = (saved.positionSeconds * 1000).toLong(),
            autoPlay = settings.autoPlayOnResume.first(),
        )
    }

    /** Saves now, for when the app leaves the foreground before the next 10 s tick. */
    fun flush() = save()

    private fun save() {
        val state = controller.state.value
        val ids = state.queue.map { it.trackId }
        if (ids.isEmpty() || ids.size > MAX_SAVED_QUEUE || state.currentIndex !in ids.indices) return
        val index = state.currentIndex
        val seconds = state.positionMs / 1000.0
        val playing = state.isPlaying
        scope.launch {
            saveLock.withLock {
                libraryRepository.savePlaybackState(ids, index, seconds, playing)
                    .onFailure { Log.w(TAG, "Couldn't save playback state", it) }
            }
        }
    }

    private fun toQueueItem(track: TrackSummaryDto) = QueueItem(
        trackId = track.id,
        title = track.title,
        artist = track.artist,
        album = track.album,
        durationSec = track.duration,
        coverUrl = libraryRepository.trackCoverUrl(track.id),
        format = track.format,
        albumId = track.albumId,
        trackNumber = track.trackNumber,
        gainDb = track.gainDb,
    )
}
