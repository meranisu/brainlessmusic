package com.brainlessmusic.app.playback

import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
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
import okhttp3.OkHttpClient
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "PlaybackController"
private const val TICK_MS = 500L

/**
 * The one ExoPlayer in the app, held in-process. Phase 2 of
 * `.docs/process/android-phased-plan.md`: playback works while the app is in
 * the foreground; Phase 3 moves this behind a `MediaSessionService` for
 * background and lock-screen control.
 *
 * Streams through the same authenticated [OkHttpClient] as Retrofit, so the
 * bearer header rides along on every range request and there is no
 * media-token exchange (the web app needs one because `<audio>` cannot set
 * headers; ExoPlayer can). Main-thread only, like ExoPlayer itself — callers
 * are ViewModels.
 */
@OptIn(UnstableApi::class)
@Singleton
class PlaybackController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
    private val libraryRepository: LibraryRepository,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val player: ExoPlayer by lazy { buildPlayer() }

    private val queue = mutableListOf<QueueItem>()
    private val _state = MutableStateFlow(PlaybackUiState())
    val state: StateFlow<PlaybackUiState> = _state.asStateFlow()

    private var tracker: ListenTracker? = null
    private var trackerItem: QueueItem? = null
    private var lastTickAt = 0L
    private var tickerJob: Job? = null
    private var errorMessage: String? = null

    /** Replaces the queue and starts playing [startIndex]. */
    fun playQueue(items: List<QueueItem>, startIndex: Int) {
        if (items.isEmpty()) return
        val mediaItems = items.map { toMediaItem(it) ?: return }
        val index = startIndex.coerceIn(0, items.lastIndex)

        queue.clear()
        queue.addAll(items)
        errorMessage = null
        player.setMediaItems(mediaItems, index, 0L)
        player.prepare()
        player.play()
        beginTrack()
        publish()
    }

    /** Inserts right after the current track; starts playing if nothing is queued. */
    fun playNext(item: QueueItem) {
        if (queue.isEmpty()) {
            playQueue(listOf(item), 0)
            return
        }
        val mediaItem = toMediaItem(item) ?: return
        val at = (player.currentMediaItemIndex + 1).coerceAtMost(queue.size)
        queue.add(at, item)
        player.addMediaItem(at, mediaItem)
        publish()
    }

    fun togglePlayPause() {
        if (queue.isEmpty()) return
        if (player.isPlaying) {
            player.pause()
            return
        }
        when (player.playbackState) {
            // A failed track leaves the player idle; prepare() retries it.
            Player.STATE_IDLE -> {
                errorMessage = null
                player.prepare()
            }
            Player.STATE_ENDED -> player.seekToDefaultPosition(0)
            else -> Unit // READY / BUFFERING: play() alone resumes
        }
        player.play()
    }

    fun seekTo(positionMs: Long) {
        if (queue.isEmpty()) return
        player.seekTo(positionMs.coerceAtLeast(0))
        publish()
    }

    fun skipToNext() {
        if (player.hasNextMediaItem()) player.seekToNextMediaItem()
    }

    /** Past the first few seconds this restarts the track, matching what every player does. */
    fun skipToPrevious() {
        if (queue.isEmpty()) return
        if (player.currentPosition > RESTART_THRESHOLD_MS || !player.hasPreviousMediaItem()) {
            player.seekTo(0)
            publish()
        } else {
            player.seekToPreviousMediaItem()
        }
    }

    fun skipToIndex(index: Int) {
        if (index !in queue.indices) return
        player.seekToDefaultPosition(index)
        if (!player.isPlaying) player.play()
    }

    /** Ends playback and empties the queue — logout must not leave the previous account's music running. */
    fun stop() {
        if (queue.isEmpty()) return
        player.stop()
        player.clearMediaItems()
        queue.clear()
        tracker = null
        trackerItem = null
        errorMessage = null
        tickerJob?.cancel()
        publish()
    }

    private fun buildPlayer(): ExoPlayer =
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(OkHttpDataSource.Factory(okHttpClient)))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
            .also { it.addListener(listener) }

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
                lastTickAt = SystemClock.elapsedRealtime()
                startTicker()
            }
            publish()
        }

        override fun onPlaybackStateChanged(playbackState: Int) = publish()

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            beginTrack()
            publish()
        }

        override fun onPlayerError(error: PlaybackException) {
            Log.w(TAG, "Playback failed for track ${queue.getOrNull(player.currentMediaItemIndex)?.trackId}", error)
            if (player.hasNextMediaItem()) {
                // One bad file shouldn't end the whole listen.
                player.seekToNextMediaItem()
                player.prepare()
                player.play()
                return
            }
            errorMessage = when (error.errorCode) {
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
                -> "Network problem — check your connection."
                PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> "The server refused this track."
                else -> "Couldn't play this track."
            }
            publish()
        }
    }

    private fun beginTrack() {
        val item = queue.getOrNull(player.currentMediaItemIndex)
        trackerItem = item
        tracker = item?.let { ListenTracker(it.durationSec) }
        lastTickAt = SystemClock.elapsedRealtime()
        errorMessage = null
    }

    private fun startTicker() {
        if (tickerJob?.isActive == true) return
        tickerJob = scope.launch {
            while (isActive && player.isPlaying) {
                delay(TICK_MS)
                val now = SystemClock.elapsedRealtime()
                val crossed = tracker?.onTick(now - lastTickAt, player.isPlaying) == true
                lastTickAt = now
                if (crossed) scrobble()
                publish()
            }
        }
    }

    private fun scrobble() {
        val item = trackerItem ?: return
        val listened = tracker?.listenedMs ?: return
        // A missed scrobble costs a statistic, not the music — never surface it.
        scope.launch { libraryRepository.scrobble(item.trackId, listened) }
    }

    private fun publish() {
        val duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 }
            ?: queue.getOrNull(player.currentMediaItemIndex)?.durationSec?.let { (it * 1000).toLong() }
            ?: 0L
        _state.value = PlaybackUiState(
            queue = queue.toList(),
            currentIndex = if (queue.isEmpty()) -1 else player.currentMediaItemIndex,
            isPlaying = player.isPlaying,
            isBuffering = player.playbackState == Player.STATE_BUFFERING,
            positionMs = player.currentPosition.coerceAtLeast(0),
            durationMs = duration,
            error = errorMessage,
        )
    }

    private fun toMediaItem(item: QueueItem): MediaItem? {
        val url = libraryRepository.streamUrl(item.trackId) ?: return null
        return MediaItem.Builder()
            .setMediaId(item.trackId.toString())
            .setUri(url)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(item.title)
                    .setArtist(item.artist)
                    .setAlbumTitle(item.album)
                    .setArtworkUri(item.coverUrl?.toUri())
                    .build(),
            )
            .build()
    }

    private companion object {
        const val RESTART_THRESHOLD_MS = 3_000L
    }
}
