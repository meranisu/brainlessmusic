package com.brainlessmusic.app.playback

import android.content.ComponentName
import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.ShuffleOrder.DefaultShuffleOrder
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.brainlessmusic.app.data.local.BetweenSongs
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.local.TransitionPrefs
import com.brainlessmusic.app.data.local.isNextOnAlbum
import com.brainlessmusic.app.data.remote.NetworkMonitor
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.downloads.DownloadRepository
import com.brainlessmusic.app.downloads.TrackCacheKey
import com.google.common.util.concurrent.ListenableFuture
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
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
 * The app's one ExoPlayer, wrapped in a MediaSession by [PlaybackService]. It streams through the authenticated
 * [OkHttpClient], so range requests carry the bearer header. Main thread only.
 */
@OptIn(UnstableApi::class)
@Singleton
class PlaybackController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
    private val libraryRepository: LibraryRepository,
    private val settings: PlaybackSettings,
    private val downloads: DownloadRepository,
    private val networkMonitor: NetworkMonitor,
    // Lazy: opening the download folder is disk work, and waits until the player is first built.
    private val downloadCache: dagger.Lazy<Cache>,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val player: ExoPlayer by lazy { buildPlayer() }

    /**
     * Owned here and lent to [PlaybackService], so the service being killed never loses the queue. The notification,
     * lock screen and headset buttons go through this wrapper, so their play, pause and skip fade like the app's (A71).
     */
    val sessionPlayer: Player by lazy {
        object : ForwardingPlayer(player) {
            override fun play() = playWithFade()
            override fun pause() = pauseWithFade()
            override fun setPlayWhenReady(playWhenReady: Boolean) = if (playWhenReady) playWithFade() else pauseWithFade()
            override fun seekToNext() = skipWithFade { player.seekToNext() }
            override fun seekToNextMediaItem() = skipWithFade { player.seekToNextMediaItem() }
            override fun seekToPrevious() = skipWithFade { player.seekToPrevious() }
            override fun seekToPreviousMediaItem() = skipWithFade { player.seekToPreviousMediaItem() }

            // Seeks from the lock screen, notification or Bluetooth: a song end planned from the old position no longer
            // fits (a fade-out would leave the rest silent, a crossfade tail would play the wrong part).
            override fun setShuffleModeEnabled(shuffleModeEnabled: Boolean) = setShuffleFromSession(shuffleModeEnabled)

            // A STOP from a headset or another app: nothing scheduled (a skip's jump, a pause fade, a crossfade tail)
            // may act after it.
            override fun stop() {
                fadeAction++
                pendingJump = null
                pausing = false
                resetFades()
                super.stop()
            }

            override fun seekTo(positionMs: Long) {
                resetFades()
                super.seekTo(positionMs)
            }
            override fun seekTo(mediaItemIndex: Int, positionMs: Long) {
                resetFades()
                super.seekTo(mediaItemIndex, positionMs)
            }
            override fun seekBack() {
                resetFades()
                super.seekBack()
            }
            override fun seekForward() {
                resetFades()
                super.seekForward()
            }
        }
    }

    // Fades (A71, A72). `transitions` mirrors the setting; `boundary` is the song end already being handled, so the
    // ticker starts it once; `tail` is the second player that carries the old song through a crossfade.
    private val ramps = VolumeRamps(CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))
    private var transitions = TransitionPrefs()
    private var boundary: Boundary? = null
    private var tail: ExoPlayer? = null
    private var crossfadeJob: Job? = null
    // Bumped by every pause, play and skip, so a fade that lands late can tell it was overtaken.
    private var fadeAction = 0
    // A skip still fading out the old song. A second skip, a pause or a play runs it at once rather than dropping it.
    private var pendingJump: (() -> Unit)? = null
    // A pause fading out: the player still plays until the fade ends, and a PLAY then must bring it back.
    private var pausing = false

    // Held for the life of the process: a connected controller is what keeps PlaybackService bound,
    // and Media3 moves the bound service to the foreground while audio is playing.
    private var sessionController: ListenableFuture<MediaController>? = null

    private val queue = mutableListOf<QueueItem>()

    // One key per queue entry, kept in step with [queue], so the same song queued twice is still two rows to the UI.
    private val keys = mutableListOf<Long>()
    private var nextKey = 0L
    private val _state = MutableStateFlow(PlaybackUiState())
    val state: StateFlow<PlaybackUiState> = _state.asStateFlow()

    private var tracker: ListenTracker? = null
    private var trackerItem: QueueItem? = null
    // The current play's id once its scrobble answers; the final listening time goes to it (A62).
    private var playId: Deferred<Int?>? = null
    private var lastTickAt = 0L
    // The newest final-listening-time report, so logout can wait for it.
    private var lastFinish: Job? = null
    private var tickerJob: Job? = null
    private var errorMessage: String? = null

    /** [errorMessage] is only the offline skip notice, which clears itself when the next song starts. */
    private var skipNotice = false

    // The listener's shuffle/repeat choice, applied to the player whenever a queue is loaded.
    private var wantMode = ShuffleMode.OFF
    private val wantShuffle get() = wantMode != ShuffleMode.OFF
    // The last mode shuffle was on in, kept while it is off: the shuffle buttons turn it back on in this one (Q86).
    private var lastOnMode = ShuffleMode.SHUFFLE
    // Off: a tapped song turns shuffle off (see `playQueue`).
    private var keepShuffle = false
    private var wantRepeat = Player.REPEAT_MODE_OFF
    // Mirrors the data saver setting; read by `toMediaItem`.
    private var dataSaver = false

    // Where the queue is topped up from as it runs low (see QueueSource). `generation` changes whenever the queue is
    // replaced, so a top-up that was in flight for the old queue is dropped instead of landing on the new one.
    private var source: QueueSource? = null
    private var refilling = false
    private var generation = 0

    // Tracks added with "Play next" that have not started yet, so a second one lands after the first, not before it.
    private var playNextPending = 0

    // A library re-source waiting for the shuffle mode to settle (see `setShuffleMode`).
    private var resourceJob: Job? = null

    init {
        scope.launch {
            wantMode = settings.shuffleMode.first()
            lastOnMode = settings.lastShuffleMode.first()
            wantRepeat = settings.repeatMode.first()
        }
        scope.launch { settings.transitions.collect { transitions = it } }
        scope.launch { settings.keepShuffle.collect { keepShuffle = it } }
        scope.launch { settings.dataSaver.collect(::applyDataSaver) }
    }

    /**
     * Switches every queued song but the playing one to the data-saver copy or back. The playing one keeps its file:
     * a seek re-requests bytes by offset, and they must come from the same copy.
     */
    private fun applyDataSaver(enabled: Boolean) {
        if (enabled == dataSaver) return
        dataSaver = enabled
        // Before touching the player: with nothing queued it may not be built yet, and this is no reason to build it.
        if (queue.isEmpty()) return
        val current = player.currentMediaItemIndex
        if (current !in queue.indices) return
        // A changed URI makes ExoPlayer add-and-remove rather than update, which reshuffles; put the order back after.
        val order = if (player.shuffleModeEnabled) shuffledSequence() else null
        val before = queue.subList(0, current).mapNotNull(::toMediaItem)
        val after = queue.subList(current + 1, queue.size).mapNotNull(::toMediaItem)
        if (before.size != current || after.size != queue.size - current - 1) return
        if (after.isNotEmpty()) player.replaceMediaItems(current + 1, queue.size, after)
        if (before.isNotEmpty()) player.replaceMediaItems(0, current, before)
        order?.let { player.setShuffleOrder(DefaultShuffleOrder(it.toIntArray(), System.nanoTime())) }
    }

    /**
     * Replaces the queue and starts playing [startIndex]. [shuffle] true turns shuffle on (keeping its mode), false off;
     * `null` is a tapped song, which turns it off unless "Keep shuffle" is on.
     */
    fun playQueue(items: List<QueueItem>, startIndex: Int, source: QueueSource? = null, shuffle: Boolean? = null) {
        val mode = shuffleModeForPlay(shuffle, keepShuffle, wantMode, lastOnMode)
        if (mode != wantMode) {
            wantMode = mode
            if (mode != ShuffleMode.OFF) lastOnMode = mode
            scope.launch { settings.setShuffleMode(mode) }
        }
        loadQueue(items, startIndex, 0L, play = true, source)
    }

    /** Restores a saved queue, paused unless [autoPlay]. A no-op if something is already queued. */
    fun restoreQueue(items: List<QueueItem>, startIndex: Int, positionMs: Long, autoPlay: Boolean) {
        if (queue.isNotEmpty()) return
        loadQueue(items, startIndex, positionMs, play = autoPlay)
    }

    private fun loadQueue(items: List<QueueItem>, startIndex: Int, positionMs: Long, play: Boolean, source: QueueSource? = null) {
        if (items.isEmpty()) return
        if (wantShuffle && source.isLibraryInTitleOrder) {
            // Shuffle would only mix this first title-order batch (one letter's songs): play the tapped song, then the
            // whole library shuffled.
            val tapped = items[startIndex.coerceIn(0, items.lastIndex)]
            loadQueue(listOf(tapped), 0, positionMs, play, librarySource(tapped))
            return
        }
        val mediaItems = items.map { toMediaItem(it) ?: return }
        val index = startIndex.coerceIn(0, items.lastIndex)

        queue.clear()
        queue.addAll(items)
        keys.clear()
        repeat(items.size) { keys.add(nextKey++) }
        this.source = source
        generation++
        errorMessage = null
        connectSession()
        player.shuffleModeEnabled = wantShuffle
        player.repeatMode = wantRepeat
        playNextPending = 0
        resetFades()
        player.setMediaItems(mediaItems, index, positionMs.coerceAtLeast(0))
        if (wantShuffle) applyShuffleOrder(first = index)
        player.prepare()
        if (play) playWithFade()
        beginTrack()
        publish()
        maybeRefill()
    }

    /** Inserts right after the current track; starts playing if nothing is queued. */
    fun playNext(item: QueueItem) {
        if (queue.isEmpty()) {
            playQueue(listOf(item), 0, shuffle = wantShuffle)
            return
        }
        val mediaItem = toMediaItem(item) ?: return
        // After the current track and after anything already queued with "Play next".
        val at = (player.currentMediaItemIndex + 1 + playNextPending).coerceAtMost(queue.size)
        queue.add(at, item)
        keys.add(at, nextKey++)
        player.addMediaItem(at, mediaItem)
        if (player.shuffleModeEnabled) placeNextInShuffleOrder(at)
        playNextPending++
        publish()
    }

    /** ExoPlayer shuffles an inserted track in at random; this moves it to play next, after earlier "Play next" tracks. */
    private fun placeNextInShuffleOrder(inserted: Int) {
        val sequence = shuffledSequence().toMutableList()
        sequence.remove(inserted)
        val currentPosition = sequence.indexOf(player.currentMediaItemIndex).coerceAtLeast(0)
        sequence.add((currentPosition + playNextPending + 1).coerceAtMost(sequence.size), inserted)
        player.setShuffleOrder(DefaultShuffleOrder(sequence.toIntArray(), System.nanoTime()))
    }

    /** Tracks left to play after the current one, in play order. */
    private fun tracksRemaining(): Int =
        if (player.shuffleModeEnabled) {
            val sequence = shuffledSequence()
            sequence.size - 1 - sequence.indexOf(player.currentMediaItemIndex)
        } else {
            queue.size - 1 - player.currentMediaItemIndex
        }

    /** When the queue is running low and has a [source], fetch the next batch and add it to the end. */
    private fun maybeRefill() {
        val from = source
        if (from == null || refilling || queue.isEmpty() || tracksRemaining() > REFILL_WHEN_REMAINING) return
        refilling = true
        val startedFor = generation
        scope.launch {
            var appended = false
            try {
                val chunk = nextChunk(from)
                // The queue was replaced or stopped while this was on its way: its items and its next source belong to
                // nothing now, and must not overwrite the new queue's source (or bring back a cleared one).
                if (chunk != null && startedFor == generation) {
                    source = chunk.next
                    if (chunk.items.isNotEmpty()) {
                        appendItems(chunk.items)
                        appended = true
                    }
                }
            } finally {
                refilling = false
            }
            // A chunk can arrive already short of the threshold (a tiny library); keep going until it is not. A fetch
            // for a replaced queue or source may have blocked the new one's first top-up, so that gets its turn too.
            // A failed fetch does not loop: the next track change tries again.
            if (appended || startedFor != generation) maybeRefill()
        }
    }

    /** A batch from a [QueueSource], and where the next one comes from (`null`: the source is spent). */
    private class Chunk(val items: List<QueueItem>, val next: QueueSource?)

    /** The next batch from [current]; `null` when the request failed. Pure: the caller decides whether to keep it. */
    private suspend fun nextChunk(current: QueueSource): Chunk? {
        when (current) {
            is QueueSource.Songs -> {
                val page = libraryRepository.getTracksPage(current.nextOffset, REFILL_CHUNK, current.search).getOrNull() ?: return null
                val next = current.nextOffset + page.tracks.size
                return Chunk(
                    page.tracks.map(libraryRepository::queueItem),
                    if (page.tracks.isEmpty() || next >= page.total) null else current.copy(nextOffset = next),
                )
            }
            is QueueSource.Shuffled -> {
                current.albumRest?.let { rest ->
                    // The album the queue started in comes first, then the pass. With nothing left of it (the last
                    // track, or a failed fetch), the pass starts now.
                    val pass = current.copy(albumRest = null)
                    val album = libraryRepository.getAlbumDetail(rest.albumId).getOrNull()
                    val after = album?.tracks?.indexOfFirst { it.id == rest.afterTrackId } ?: -1
                    val items = album?.tracks?.drop(after + 1)?.map { libraryRepository.queueItem(album, it) }.orEmpty()
                    return if (items.isEmpty()) nextChunk(pass) else Chunk(items, pass)
                }
                val page = libraryRepository
                    .getShuffledPage(current.seed, current.mode.apiName ?: "shuffle", current.asOf, current.nextOffset, REFILL_CHUNK)
                    .getOrNull() ?: return null
                val next = current.nextOffset + page.tracks.size
                return Chunk(
                    page.tracks.filter { it.id != current.skipTrackId }.map(libraryRepository::queueItem),
                    // End of this pass: start another with a fresh seed rather than stopping.
                    if (page.tracks.isEmpty() || next >= page.total) QueueSource.Shuffled.fresh(current.mode) else current.copy(nextOffset = next),
                )
            }
        }
    }

    /** Adds [items] to the end of the queue; with shuffle on, they play after everything already queued, artist-spread among themselves. */
    private fun appendItems(items: List<QueueItem>) {
        val mediaItems = items.map { toMediaItem(it) ?: return }
        val firstNew = queue.size
        queue.addAll(items)
        repeat(items.size) { keys.add(nextKey++) }
        player.addMediaItems(mediaItems)
        if (player.shuffleModeEnabled) {
            // ExoPlayer scatters new items through the shuffle order; put them back at the end instead. A library
            // album shuffle arrives in album order from the server already.
            val existing = shuffledSequence().filter { it < firstNew }
            val chunkOrder = when {
                wantMode == ShuffleMode.ALBUMS && source is QueueSource.Shuffled -> items.indices.toList().toIntArray()
                wantMode == ShuffleMode.ALBUMS -> AlbumShuffle.order(items.map { it.albumId }, items.map { it.trackNumber })
                else -> SmartShuffle.order(items.map(::artistKey))
            }
            val chunk = chunkOrder.map { firstNew + it }
            player.setShuffleOrder(DefaultShuffleOrder((existing + chunk).toIntArray(), System.nanoTime()))
        }
        publish()
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

    /**
     * Replaces ExoPlayer's random shuffle with the order [wantMode] asks for, starting from [first]: albums in track
     * order, or [SmartShuffle]'s artist spread. A library album shuffle is in album order already, so it stays as is.
     */
    private fun applyShuffleOrder(first: Int) {
        if (queue.size < 2) return
        val order = when {
            wantMode == ShuffleMode.ALBUMS && source is QueueSource.Shuffled -> IntArray(queue.size) { it }
            wantMode == ShuffleMode.ALBUMS -> AlbumShuffle.order(queue.map { it.albumId }, queue.map { it.trackNumber }, first)
            else -> SmartShuffle.order(queue.map(::artistKey), first)
        }
        player.setShuffleOrder(DefaultShuffleOrder(order, System.nanoTime()))
    }

    private fun artistKey(item: QueueItem): String? = item.artist?.trim()?.lowercase()?.takeIf(String::isNotEmpty)

    /** Whether a song tapped now plays shuffled: only with "Keep shuffle" on and shuffle already on. */
    fun shufflesOnTap(): Boolean = keepShuffle && wantShuffle

    /** The mode the shuffle buttons turn on: the one picked now, or while shuffle is off, the last one it was on in. */
    fun libraryShuffleMode(): ShuffleMode = if (wantMode == ShuffleMode.OFF) lastOnMode else wantMode

    fun togglePlayPause() {
        if (queue.isEmpty()) return
        if (player.isPlaying) {
            pauseWithFade()
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
        playWithFade()
    }

    fun seekTo(positionMs: Long) {
        if (queue.isEmpty()) return
        // A song end planned from the old position no longer fits; the ticker plans it again.
        resetFades()
        player.seekTo(positionMs.coerceAtLeast(0))
        publish()
    }

    fun skipToNext() {
        if (player.hasNextMediaItem()) skipWithFade { player.seekToNextMediaItem() }
    }

    /** Past the first few seconds this restarts the track, matching what every player does. */
    fun skipToPrevious() {
        if (queue.isEmpty()) return
        if (player.currentPosition > RESTART_THRESHOLD_MS || !player.hasPreviousMediaItem()) {
            skipWithFade {
                player.seekTo(0)
                publish()
            }
        } else {
            skipWithFade { player.seekToPreviousMediaItem() }
        }
    }

    /** A swipe back: the track before, however far into this one it is. The first track restarts. */
    fun skipToPreviousTrack() {
        if (queue.isEmpty()) return
        if (player.hasPreviousMediaItem()) {
            skipWithFade { player.seekToPreviousMediaItem() }
        } else {
            skipWithFade {
                player.seekTo(0)
                publish()
            }
        }
    }

    fun skipToIndex(index: Int) {
        if (index !in queue.indices) return
        playNextPending = 0
        if (player.isPlaying) {
            skipWithFade { player.seekToDefaultPosition(index) }
        } else {
            player.seekToDefaultPosition(index)
            playWithFade()
        }
    }

    /** Queue indices in the order they play: the shuffle order with shuffle on, else the list order. */
    private fun playOrder(): List<Int> = if (player.shuffleModeEnabled) shuffledSequence() else queue.indices.toList()

    /**
     * Takes the entry at queue [index] out. Not the playing one: that is skipped, not removed. Returns what [restore]
     * needs to put it back for Undo, or `null` if nothing was removed.
     */
    fun removeAt(index: Int): RemovedEntry? {
        if (index !in queue.indices || index == player.currentMediaItemIndex) return null
        val position = playOrder().indexOf(index)
        val item = queue.removeAt(index)
        keys.removeAt(index)
        player.removeMediaItem(index)
        // Hand edits make the "Play next" run meaningless; the next one goes straight after the current track.
        playNextPending = 0
        publish()
        maybeRefill()
        return RemovedEntry(item, position)
    }

    /**
     * Puts a [removeAt] entry back where it was in play order, as near as the queue now allows. Never at or before the
     * current track: after a late Undo, songs have played since, and a spot behind the current one would never play.
     */
    fun restore(entry: RemovedEntry) {
        val mediaItem = toMediaItem(entry.item) ?: return
        if (queue.isEmpty()) {
            playQueue(listOf(entry.item), 0, shuffle = wantShuffle)
            return
        }
        if (player.shuffleModeEnabled) {
            val at = queue.size
            queue.add(entry.item)
            keys.add(nextKey++)
            player.addMediaItem(mediaItem)
            // ExoPlayer shuffles the new item in at random; put it back at its old spot in the play order.
            val sequence = shuffledSequence().toMutableList()
            sequence.remove(at)
            val earliest = sequence.indexOf(player.currentMediaItemIndex) + 1
            sequence.add(entry.playPosition.coerceIn(earliest, sequence.size), at)
            player.setShuffleOrder(DefaultShuffleOrder(sequence.toIntArray(), System.nanoTime()))
        } else {
            val at = entry.playPosition.coerceIn(player.currentMediaItemIndex + 1, queue.size)
            queue.add(at, entry.item)
            keys.add(at, nextKey++)
            player.addMediaItem(at, mediaItem)
        }
        publish()
    }

    /** Moves the entry at play-order position [from] to [to]: the list order, or the shuffle order with shuffle on. */
    fun move(from: Int, to: Int) {
        if (from == to || from !in queue.indices || to !in queue.indices) return
        if (player.shuffleModeEnabled) {
            val sequence = shuffledSequence().toMutableList()
            sequence.add(to, sequence.removeAt(from))
            player.setShuffleOrder(DefaultShuffleOrder(sequence.toIntArray(), System.nanoTime()))
        } else {
            queue.add(to, queue.removeAt(from))
            keys.add(to, keys.removeAt(from))
            player.moveMediaItem(from, to)
        }
        playNextPending = 0
        publish()
    }

    /** Off, then Shuffle, Rediscover and Albums (A77). */
    fun cycleShuffle() = setShuffleMode(wantMode.next())

    /**
     * Shuffle turned on or off from outside the app (notification, lock screen, Bluetooth). On means the mode last
     * picked, not ExoPlayer's own random order.
     */
    private fun setShuffleFromSession(enabled: Boolean) {
        if (enabled == wantShuffle) return
        setShuffleMode(if (enabled) libraryShuffleMode() else ShuffleMode.OFF)
    }

    private fun setShuffleMode(mode: ShuffleMode) {
        wantMode = mode
        if (mode != ShuffleMode.OFF) lastOnMode = mode
        player.shuffleModeEnabled = wantShuffle
        resourceJob?.cancel()
        if (needsLibraryResource()) {
            // Cycling Off → Albums passes two other modes; re-sourcing on each press would drop and fetch a batch every
            // time. Only the mode that is still chosen after a short pause gets its batch.
            resourceJob = scope.launch {
                delay(RESOURCE_DEBOUNCE_MS)
                if (needsLibraryResource()) continueWithLibraryShuffle()
            }
        } else if (wantShuffle) {
            applyShuffleOrder(first = player.currentMediaItemIndex)
        }
        scope.launch { settings.setShuffleMode(mode) }
        publish()
    }

    /** The library is what's playing, but not in the order [wantMode] asks for. */
    private fun needsLibraryResource(): Boolean {
        val current = source
        return queue.isNotEmpty() && wantShuffle &&
            (current.isLibraryInTitleOrder || (current is QueueSource.Shuffled && current.mode != wantMode))
    }

    /** The whole library shuffled the way [wantMode] says, without [from] in its first pass. */
    /**
     * The library pass that follows [from]. In Albums mode the rest of [from]'s album plays first and [from] stays in
     * the pass, so its album later plays whole; leaving it out would leave a hole in that album.
     */
    private fun librarySource(from: QueueItem): QueueSource.Shuffled {
        val albumId = from.albumId
        return if (wantMode == ShuffleMode.ALBUMS && albumId != null) {
            QueueSource.Shuffled.fresh(wantMode).copy(albumRest = AlbumRest(albumId, from.trackId))
        } else {
            QueueSource.Shuffled.fresh(wantMode, skipTrackId = from.trackId)
        }
    }

    /**
     * Shuffle turned on mid-way through the songs list in title order (the rest of that batch would only mix songs
     * sharing a letter), or switched to another mode during a library shuffle: what was coming from the library goes,
     * and the whole library in the new mode follows the current song and any "Play next" ones.
     */
    private fun continueWithLibraryShuffle() {
        val current = player.currentMediaItemIndex
        val keep = (current + 1 + playNextPending).coerceAtMost(queue.size)
        if (keep < queue.size) {
            player.removeMediaItems(keep, queue.size)
            queue.subList(keep, queue.size).clear()
            keys.subList(keep, keys.size).clear()
        }
        // Played songs before the current one, so "previous" still walks back through them; new batches go after.
        player.setShuffleOrder(DefaultShuffleOrder(IntArray(queue.size) { it }, System.nanoTime()))
        source = librarySource(queue[current])
        generation++
        maybeRefill()
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

    /** Ends playback and empties the queue, so a logout doesn't leave the last account's music playing. */
    fun stop() {
        if (queue.isEmpty()) return
        fadeAction++
        pendingJump = null
        pausing = false
        resetFades()
        player.stop()
        player.clearMediaItems()
        queue.clear()
        keys.clear()
        source = null
        generation++
        playNextPending = 0
        reportListened(final = true)
        tracker = null
        trackerItem = null
        errorMessage = null
        tickerJob?.cancel()
        publish()
    }

    /** Play, with the short fade in when it's on (A71). */
    private fun playWithFade() {
        // Car and Bluetooth devices send PLAY on connect: while already playing, with nothing fading out, it is a no-op
        // (a dip in the volume, or a skip or fade-out cancelled, otherwise).
        if (player.isPlaying && pendingJump == null && !pausing) return
        fadeAction++
        pausing = false
        runPendingJump()
        if (transitions.fadeOnPause) {
            ramps.set(player, 0f)
            player.play()
            ramps.rampTo(player, 1f, SHORT_FADE_MS)
        } else {
            ramps.set(player, 1f)
            player.play()
        }
    }

    /** Pause, after the short fade out when it's on. A song still fading out in the tail stops at once. */
    private fun pauseWithFade() {
        val action = ++fadeAction
        // Mid-skip: land on the new song, then pause.
        runPendingJump()
        resetFades(keepVolume = true)
        if (!transitions.fadeOnPause || !player.isPlaying) {
            pausing = false
            player.pause()
            ramps.set(player, 1f)
            return
        }
        pausing = true
        ramps.rampTo(player, 0f, SHORT_FADE_MS) {
            if (action != fadeAction) return@rampTo
            pausing = false
            player.pause()
        }
    }

    /** A skip the user asked for: fade out, [jump], fade back in. Auto-advance never comes through here. */
    private fun skipWithFade(jump: () -> Unit) {
        val action = ++fadeAction
        pausing = false
        // A second Next while the first is still fading: the first jump happens now, so both count.
        runPendingJump()
        resetFades(keepVolume = true)
        if (!transitions.fadeOnPause || !player.isPlaying) {
            ramps.set(player, 1f)
            jump()
            return
        }
        pendingJump = jump
        ramps.rampTo(player, 0f, SHORT_FADE_MS) {
            if (action != fadeAction) return@rampTo
            pendingJump = null
            jump()
            ramps.rampTo(player, 1f, SHORT_FADE_MS)
        }
    }

    private fun runPendingJump() {
        val jump = pendingJump ?: return
        pendingJump = null
        jump()
    }

    /**
     * Drops any planned song end, any crossfade and any ramp, and puts the volume back to full, unless the caller is
     * about to fade from wherever it is now ([keepVolume]), which avoids a jump to full mid-fade.
     */
    private fun resetFades(keepVolume: Boolean = false) {
        boundary = null
        cancelCrossfade()
        if (keepVolume) ramps.cancel(player) else ramps.set(player, 1f)
    }

    private fun cancelCrossfade() {
        crossfadeJob?.cancel()
        crossfadeJob = null
        tail?.let {
            ramps.cancel(it)
            it.release()
        }
        tail = null
    }

    /**
     * Gapless unless a fade is set and allowed: not on repeat-one, not inside an album with the switch on (A72). Media3's
     * playlist is already gapless, so that case needs nothing here.
     */
    private fun transitionKind(current: QueueItem, next: QueueItem): BetweenSongs {
        if (transitions.betweenSongs == BetweenSongs.GAPLESS || player.repeatMode == Player.REPEAT_MODE_ONE) {
            return BetweenSongs.GAPLESS
        }
        if (transitions.keepAlbumsGapless &&
            isNextOnAlbum(current.albumId, current.trackNumber, next.albumId, next.trackNumber)
        ) {
            return BetweenSongs.GAPLESS
        }
        return transitions.betweenSongs
    }

    /** Every tick while playing: starts the song end once, the way the settings ask. */
    private fun checkBoundary() {
        if (boundary != null || !player.isPlaying) return
        val duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: return
        val nextIndex = player.nextMediaItemIndex.takeIf { it != C.INDEX_UNSET } ?: return
        val current = queue.getOrNull(player.currentMediaItemIndex) ?: return
        val next = queue.getOrNull(nextIndex) ?: return
        val kind = transitionKind(current, next)
        if (kind == BetweenSongs.GAPLESS) return

        val remaining = duration - player.currentPosition
        // Never a fade longer than a third of either song.
        val nextMs = next.durationSec?.let { (it * 1000).toLong() } ?: duration
        val fadeMs = minOf(transitions.fadeSeconds * 1000L, duration / 3, nextMs / 3)
        when (kind) {
            BetweenSongs.FADE_OUT_IN -> {
                if (remaining > fadeMs) return
                boundary = Boundary.FadeOutIn(fadeMs)
                // This song fades over what's left; the transition fades the next one in.
                ramps.rampTo(player, 0f, remaining)
            }
            BetweenSongs.CROSSFADE -> {
                if (remaining > fadeMs + TAIL_PREPARE_MS) return
                boundary = Boundary.Crossfade
                startCrossfade(duration - fadeMs, fadeMs)
            }
            BetweenSongs.GAPLESS -> Unit
        }
    }

    /**
     * Crossfade: a second player is readied on this song at [handOffAtMs]. When the main player reaches that point the
     * tail takes the old song over, and the main player moves to the next song and fades in while the tail fades out.
     * The notification shows the new song from that moment. If anything doesn't line up (a seek, the tail not ready
     * in time, a pause), it gives up and the songs join gaplessly instead.
     */
    private fun startCrossfade(handOffAtMs: Long, fadeMs: Long) {
        val item = player.currentMediaItem ?: return
        val outgoingIndex = player.currentMediaItemIndex
        if (player.currentPosition > handOffAtMs - TAIL_START_LEAD_MS) return // too late to line up; stays gapless
        cancelCrossfade()
        val t = newExoPlayer(handleAudioFocus = false)
        tail = t
        t.volume = player.volume
        t.setMediaItem(item, handOffAtMs + TAIL_START_LEAD_MS)
        t.prepare()
        crossfadeJob = scope.launch {
            val stillOn = { player.isPlaying && player.currentMediaItemIndex == outgoingIndex }
            // Ready (buffered at the hand-off point) well before it, or no crossfade this time.
            while (t.playbackState != Player.STATE_READY) {
                if (!stillOn() || player.currentPosition >= handOffAtMs) return@launch cancelCrossfade()
                delay(POLL_MS)
            }
            while (player.currentPosition < handOffAtMs) {
                if (!stillOn()) return@launch cancelCrossfade()
                delay(POLL_MS)
            }
            // The tail starts slightly ahead of where the main player is, to cover its own start-up time.
            t.play()
            while (!t.isPlaying) {
                if (!stillOn() || player.currentPosition > handOffAtMs + HAND_OFF_TIMEOUT_MS) return@launch cancelCrossfade()
                delay(POLL_MS)
            }
            ramps.set(player, 0f)
            player.seekToNextMediaItem()
            ramps.rampTo(player, 1f, fadeMs)
            ramps.rampTo(t, 0f, fadeMs) { if (tail === t) cancelCrossfade() }
        }
    }

    private fun connectSession() {
        if (sessionController != null) return
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        sessionController = MediaController.Builder(context, token).buildAsync()
    }

    private fun buildPlayer(): ExoPlayer =
        newExoPlayer(handleAudioFocus = true)
            .also { it.addListener(listener) }

    /**
     * The crossfade's tail player is built the same way but takes no audio focus (it would take it from the main player)
     * and isn't wired to the session or the listener: it only plays out the old song while it fades.
     */
    /**
     * A downloaded song is read from the phone, with or without signal; anything else comes from the server. Read-only:
     * streaming never writes into the download folder, which nothing ever evicts.
     */
    private val dataSourceFactory by lazy {
        CacheDataSource.Factory()
            .setCache(downloadCache.get())
            .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(okHttpClient))
            .setCacheWriteDataSinkFactory(null)
            .setCacheKeyFactory(TrackCacheKey)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    private fun newExoPlayer(handleAudioFocus: Boolean): ExoPlayer =
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                handleAudioFocus,
            )
            .setHandleAudioBecomingNoisy(handleAudioFocus)
            .build()

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
                lastTickAt = SystemClock.elapsedRealtime()
                startTicker()
            } else {
                reportListened(final = false)
                // Paused by something outside the app (a call, unplugged headphones): the old song must not play on in the
                // tail. Buffering through the crossfade's own skip keeps `playWhenReady`, so that doesn't count.
                if (!player.playWhenReady || player.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
                    cancelCrossfade()
                }
            }
            publish()
        }

        override fun onPlaybackStateChanged(playbackState: Int) = publish()

        // Unplugged headphones, a call or another app's audio. `onIsPlayingChanged` alone misses these right after a
        // crossfade's hand-off, while the main player buffers. Ramps run on wall-clock time, so a song-end fade-out
        // would also finish during the call and leave the rest silent; the ticker plans it again after.
        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (!playWhenReady && !pausing) resetFades()
        }

        override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
            if (playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) resetFades()
        }

        override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) = publish()

        override fun onRepeatModeChanged(repeatMode: Int) = publish()

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            // The skip notice lasts until the next song starts on its own.
            if (skipNotice && reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                skipNotice = false
                errorMessage = null
            }
            if (skipToDownloaded(skipCurrent = false)) return
            val ended = boundary
            boundary = null
            if (ended is Boundary.FadeOutIn) {
                // The old song faded out to its end: the new one fades in. Any other transition (a skip mid-fade) just
                // puts the volume back.
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                    ramps.set(player, 0f)
                    ramps.rampTo(player, 1f, ended.fadeMs)
                } else {
                    ramps.set(player, 1f)
                }
            }
            if (playNextPending > 0) playNextPending--
            beginTrack()
            maybeRefill()
            publish()
        }

        override fun onPlayerError(error: PlaybackException) {
            Log.w(TAG, "Playback failed for track ${queue.getOrNull(player.currentMediaItemIndex)?.trackId}", error)
            // The signal went mid-song: carry on with what's on the phone instead of trying each song in turn.
            if (skipToDownloaded(skipCurrent = true)) return
            if (player.hasNextMediaItem()) {
                // One bad file shouldn't end the whole listen.
                resetFades()
                player.seekToNextMediaItem()
                player.prepare()
                player.play()
                return
            }
            errorMessage = when (error.errorCode) {
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
                -> "Network problem. Check your connection."
                PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> "The server refused this track."
                else -> "Couldn't play this track."
            }
            publish()
        }
    }

    /**
     * With no signal, moves from a song that isn't downloaded ([skipCurrent]: or one that just failed) to the next
     * downloaded one in play order, with one line saying how many were passed over; pauses when none is left. Returns
     * whether it acted, so the caller leaves this song alone.
     */
    private fun skipToDownloaded(skipCurrent: Boolean): Boolean {
        if (networkMonitor.online.value || queue.isEmpty()) return false
        val from = player.currentMediaItemIndex
        val current = queue.getOrNull(from) ?: return false
        if (!skipCurrent && downloads.isDownloaded(current.trackId)) return false
        val timeline = player.currentTimeline
        var index = from
        var skipped = 1
        while (true) {
            index = timeline.getNextWindowIndex(index, Player.REPEAT_MODE_OFF, player.shuffleModeEnabled)
            if (index == C.INDEX_UNSET) {
                player.pause()
                errorMessage = "You're offline, and no downloaded songs are left in the queue."
                skipNotice = false
                publish()
                return true
            }
            if (downloads.isDownloaded(queue[index].trackId)) break
            skipped++
        }
        resetFades()
        player.seekTo(index, 0)
        player.prepare()
        if (!skipCurrent || skipped > 1) {
            errorMessage = if (skipped == 1) "Skipped a song that isn't downloaded." else "Skipped $skipped songs that aren't downloaded."
            skipNotice = true
        }
        publish()
        return true
    }

    private fun beginTrack() {
        reportListened(final = true)
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
                checkBoundary()
                publish()
            }
        }
    }

    private fun scrobble() {
        val item = trackerItem ?: return
        val listened = tracker?.listenedMs ?: return
        // A missed scrobble costs a statistic, so it is never surfaced.
        playId = scope.async { libraryRepository.scrobble(item.trackId, listened).getOrNull() }
    }

    /**
     * Sends how long the current play has really lasted (A62), once it has been scrobbled. On pause too, not only at the
     * end, so a play cut short by the app being killed still has a close number; [final] lets go of it.
     */
    private fun reportListened(final: Boolean) {
        val pending = playId ?: return
        val listened = tracker?.listenedMs ?: return
        if (final) playId = null
        lastFinish = scope.launch { pending.await()?.let { libraryRepository.finishPlay(it, listened) } }
    }

    /**
     * [stop], then waits (briefly) for the last play's final listening time to reach the server. Logout calls this
     * before forgetting the token; otherwise that report would go out with no auth and be lost.
     */
    suspend fun stopAndFlush() {
        stop()
        withTimeoutOrNull(FLUSH_TIMEOUT_MS) { lastFinish?.join() }
    }

    private fun publish() {
        val duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 }
            ?: queue.getOrNull(player.currentMediaItemIndex)?.durationSec?.let { (it * 1000).toLong() }
            ?: 0L
        _state.value = PlaybackUiState(
            queue = queue.toList(),
            keys = keys.toList(),
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
            shuffleMode = if (player.shuffleModeEnabled) libraryShuffleMode() else ShuffleMode.OFF,
            fromLibrary = source is QueueSource.Shuffled,
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
        val saver = player.currentMediaItem?.localConfiguration?.uri?.getQueryParameter("quality") == "low"
        return StreamInfo(
            // The server's name for the container beats a MIME type ("flac" over "audio/flac"), but names the file, not
            // a data-saver copy, so that one goes by what the player decoded.
            codec = queue.getOrNull(player.currentMediaItemIndex)?.format?.takeIf { it.isNotBlank() && !saver }?.let(::prettyFormat)
                ?: format?.sampleMimeType?.let(::codecName),
            sampleRateHz = format?.sampleRate?.takeIf { it > 0 },
            channels = format?.channelCount?.takeIf { it > 0 },
            bitrateKbps = format?.bitrate?.takeIf { it > 0 }?.let { it / 1000 },
            bufferedAheadMs = (player.bufferedPosition - player.currentPosition).coerceAtLeast(0),
            networkKbps = estimate.takeIf { it > 0 }?.let { it / 1000 },
            dataSaver = saver,
        )
    }

    /** Short names for the codec strings the tag reader stores ("MPEG 1 Layer 3" → "MP3"); unknown ones pass through. */
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
        // A downloaded song plays its original from the phone: the smaller copy would only cost data.
        val url = libraryRepository.streamUrl(item.trackId, dataSaver && !downloads.isDownloaded(item.trackId)) ?: return null
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

    /** A song end already being handled. */
    private sealed interface Boundary {
        data class FadeOutIn(val fadeMs: Long) : Boundary
        data object Crossfade : Boundary
    }

    private companion object {
        const val RESTART_THRESHOLD_MS = 3_000L

        /** The longest logout waits for the last listening-time report. */
        const val FLUSH_TIMEOUT_MS = 3_000L

        /** How long the shuffle mode must stay put before a library shuffle is re-sourced for it. */
        const val RESOURCE_DEBOUNCE_MS = 600L

        /** The pause, play and skip fade (A71). */
        const val SHORT_FADE_MS = 150L

        /** A crossfade's tail player is readied this long before the fade, so it has buffered by then. */
        const val TAIL_PREPARE_MS = 3_000L

        /** The tail starts this far ahead of the main player, to cover its start-up. Not tuned on a device yet. */
        const val TAIL_START_LEAD_MS = 60L

        /** How long the tail may take to start before the crossfade is dropped. */
        const val HAND_OFF_TIMEOUT_MS = 500L

        const val POLL_MS = 5L

        /** Top the queue up when this few tracks are left to play... */
        const val REFILL_WHEN_REMAINING = 30

        /** ...with this many at a time (the server's page cap). */
        const val REFILL_CHUNK = 200
    }
}

/**
 * The mode a new queue plays in. A tapped song (`shuffle` null) turns shuffle off unless "Keep shuffle" is on; a shuffle
 * button (`true`) keeps the mode that is on, or comes back to the last one when shuffle is off.
 */
internal fun shuffleModeForPlay(shuffle: Boolean?, keepShuffle: Boolean, current: ShuffleMode, lastOn: ShuffleMode) =
    when (shuffle) {
        null -> if (keepShuffle) current else ShuffleMode.OFF
        true -> if (current == ShuffleMode.OFF) lastOn else current
        false -> ShuffleMode.OFF
    }
