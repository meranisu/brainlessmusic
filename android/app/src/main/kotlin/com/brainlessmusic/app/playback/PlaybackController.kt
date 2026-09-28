package com.brainlessmusic.app.playback

import android.content.ComponentName
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
import androidx.media3.exoplayer.source.ShuffleOrder.DefaultShuffleOrder
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.google.common.util.concurrent.ListenableFuture
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "PlaybackController"
private const val TICK_MS = 500L

/**
 * The one ExoPlayer in the app, held in-process. [PlaybackService] (Phase 3 of
 * `.docs/process/android-phased-plan.md`) wraps it in a MediaSession for the
 * notification, lock screen, headset buttons and background playback.
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
    private val settings: PlaybackSettings,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val player: ExoPlayer by lazy { buildPlayer() }

    /**
     * The player [PlaybackService] wraps in a MediaSession. It stays owned here — the UI and the
     * service drive the same instance — so the service being killed never loses the queue.
     */
    val sessionPlayer: Player get() = player

    // Held for the life of the process: a connected controller is what keeps PlaybackService bound,
    // and Media3 moves the bound service to the foreground while audio is playing.
    private var sessionController: ListenableFuture<MediaController>? = null

    private val queue = mutableListOf<QueueItem>()
    private val _state = MutableStateFlow(PlaybackUiState())
    val state: StateFlow<PlaybackUiState> = _state.asStateFlow()

    private var tracker: ListenTracker? = null
    private var trackerItem: QueueItem? = null
    private var lastTickAt = 0L
    private var tickerJob: Job? = null
    private var errorMessage: String? = null

    // The listener's shuffle/repeat choice, applied to the player whenever a queue is loaded.
    private var wantShuffle = false
    private var wantRepeat = Player.REPEAT_MODE_OFF

    // Tracks added with "Play next" that have not started yet, so a second one lands after the first, not before it.
    private var playNextPending = 0

    init {
        scope.launch {
            wantShuffle = settings.shuffle.first()
            wantRepeat = settings.repeatMode.first()
        }
    }

    /** Replaces the queue and starts playing [startIndex]. */
    fun playQueue(items: List<QueueItem>, startIndex: Int) = loadQueue(items, startIndex, 0L, play = true)

    /**
     * Puts a saved queue back at [positionMs] — paused unless [autoPlay]. A no-op
     * if something is already queued: a listener who tapped a track while the
     * saved state was still downloading must not have it replaced underneath them.
     */
    fun restoreQueue(items: List<QueueItem>, startIndex: Int, positionMs: Long, autoPlay: Boolean) {
        if (queue.isNotEmpty()) return
        loadQueue(items, startIndex, positionMs, play = autoPlay)
    }

    private fun loadQueue(items: List<QueueItem>, startIndex: Int, positionMs: Long, play: Boolean) {
        if (items.isEmpty()) return
        val mediaItems = items.map { toMediaItem(it) ?: return }
        val index = startIndex.coerceIn(0, items.lastIndex)

        queue.clear()
        queue.addAll(items)
        errorMessage = null
        connectSession()
        player.shuffleModeEnabled = wantShuffle
        player.repeatMode = wantRepeat
        playNextPending = 0
        player.setMediaItems(mediaItems, index, positionMs.coerceAtLeast(0))
        if (wantShuffle) applySmartShuffle(first = index)
        player.prepare()
        if (play) player.play()
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
        // After the current track and after anything already queued with "Play next".
        val at = (player.currentMediaItemIndex + 1 + playNextPending).coerceAtMost(queue.size)
        queue.add(at, item)
        player.addMediaItem(at, mediaItem)
        if (player.shuffleModeEnabled) placeNextInShuffleOrder(at)
        playNextPending++
        publish()
    }

    /**
     * ExoPlayer slots an inserted track into its shuffle order at random. To make it really play next,
     * take the order as it now stands, move [inserted] to just after the current track (and after any
     * earlier "Play next" tracks), and hand it back.
     */
    private fun placeNextInShuffleOrder(inserted: Int) {
        val sequence = shuffledSequence().toMutableList()
        sequence.remove(inserted)
        val currentPosition = sequence.indexOf(player.currentMediaItemIndex).coerceAtLeast(0)
        sequence.add((currentPosition + playNextPending + 1).coerceAtMost(sequence.size), inserted)
        player.setShuffleOrder(DefaultShuffleOrder(sequence.toIntArray(), System.nanoTime()))
    }

    /** Every queue index in the order shuffle will play them, from the first to the last. */
    private fun shuffledSequence(): List<Int> {
        val timeline = player.currentTimeline
        val sequence = ArrayList<Int>(queue.size)
        var i = timeline.getFirstWindowIndex(/* shuffleModeEnabled = */ true)
        while (i != C.INDEX_UNSET) {
            sequence.add(i)
            i = timeline.getNextWindowIndex(i, Player.REPEAT_MODE_OFF, /* shuffleModeEnabled = */ true)
        }
        return sequence
    }

    /** Replaces ExoPlayer's random shuffle with [SmartShuffle]'s artist-spread order, starting from [first]. */
    private fun applySmartShuffle(first: Int) {
        if (queue.size < 2) return
        val keys = queue.map { it.artist?.trim()?.lowercase()?.takeIf(String::isNotEmpty) }
        player.setShuffleOrder(DefaultShuffleOrder(SmartShuffle.order(keys, first), System.nanoTime()))
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
        playNextPending = 0
        player.seekToDefaultPosition(index)
        if (!player.isPlaying) player.play()
    }

    fun toggleShuffle() {
        wantShuffle = !wantShuffle
        player.shuffleModeEnabled = wantShuffle
        if (wantShuffle) applySmartShuffle(first = player.currentMediaItemIndex)
        scope.launch { settings.setShuffle(wantShuffle) }
        publish()
    }

    /** Off, then repeat the whole queue, then repeat the current track. */
    fun cycleRepeat() {
        wantRepeat = when (wantRepeat) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
        player.repeatMode = wantRepeat
        scope.launch { settings.setRepeatMode(wantRepeat) }
        publish()
    }

    /** Ends playback and empties the queue — logout must not leave the previous account's music running. */
    fun stop() {
        if (queue.isEmpty()) return
        player.stop()
        player.clearMediaItems()
        queue.clear()
        playNextPending = 0
        tracker = null
        trackerItem = null
        errorMessage = null
        tickerJob?.cancel()
        publish()
    }

    private fun connectSession() {
        if (sessionController != null) return
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        sessionController = MediaController.Builder(context, token).buildAsync()
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

        override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) = publish()

        override fun onRepeatModeChanged(repeatMode: Int) = publish()

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            if (playNextPending > 0) playNextPending--
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
            hasNext = player.hasNextMediaItem(),
            hasPrevious = player.hasPreviousMediaItem(),
            nextIndex = player.nextMediaItemIndex.takeIf { it != C.INDEX_UNSET } ?: -1,
            playOrder = if (player.shuffleModeEnabled && queue.isNotEmpty()) shuffledSequence() else emptyList(),
            shuffle = player.shuffleModeEnabled,
            repeat = when (player.repeatMode) {
                Player.REPEAT_MODE_ALL -> Repeat.ALL
                Player.REPEAT_MODE_ONE -> Repeat.ONE
                else -> Repeat.OFF
            },
            stream = if (queue.isEmpty()) null else streamInfo(),
        )
    }

    private fun streamInfo(): StreamInfo {
        val format = player.audioFormat
        val estimate = DefaultBandwidthMeter.getSingletonInstance(context).bitrateEstimate
        return StreamInfo(
            // The server's name for the container beats a MIME type ("flac" over "audio/flac").
            codec = queue.getOrNull(player.currentMediaItemIndex)?.format?.takeIf { it.isNotBlank() }?.let(::prettyFormat)
                ?: format?.sampleMimeType?.let(::codecName),
            sampleRateHz = format?.sampleRate?.takeIf { it > 0 },
            channels = format?.channelCount?.takeIf { it > 0 },
            bitrateKbps = format?.bitrate?.takeIf { it > 0 }?.let { it / 1000 },
            bufferedAheadMs = (player.bufferedPosition - player.currentPosition).coerceAtLeast(0),
            networkKbps = estimate.takeIf { it > 0 }?.let { it / 1000 },
        )
    }

    /**
     * The server stores whatever the tag reader called the codec ("MPEG 1 Layer 3", "flac", "Opus"); shown
     * as the short names people know. Anything unrecognised is shown as it is.
     */
    private fun prettyFormat(raw: String): String {
        val f = raw.trim().lowercase()
        return when {
            "layer 3" in f || f == "mp3" -> "MP3"
            "flac" in f -> "FLAC"
            "opus" in f -> "Opus"
            "vorbis" in f -> "Vorbis"
            "alac" in f -> "ALAC"
            "aac" in f || "mpeg-4" in f || f == "m4a" -> "AAC"
            f in setOf("wav", "wave", "pcm") -> "WAV"
            else -> raw.trim()
        }
    }

    private fun codecName(mime: String): String = when (mime.lowercase().removePrefix("audio/")) {
        "flac" -> "FLAC"
        "opus" -> "Opus"
        "vorbis" -> "Vorbis"
        "mpeg" -> "MP3"
        "mp4a-latm" -> "AAC"
        "raw" -> "PCM"
        else -> mime.substringAfter('/').uppercase()
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
