package com.brainlessmusic.app.playback

import android.content.ComponentName
import android.content.Context
import android.content.Intent
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
import androidx.media3.common.Timeline
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
import com.brainlessmusic.app.downloads.PrecacheWant
import com.brainlessmusic.app.downloads.Precacher
import com.brainlessmusic.app.downloads.SongCache
import com.brainlessmusic.app.downloads.precacheOrder
import com.brainlessmusic.app.downloads.DownloadRepository
import com.brainlessmusic.app.downloads.TrackCacheKey
import com.brainlessmusic.app.rooms.RoomCommand
import com.brainlessmusic.app.rooms.RoomEntry
import com.brainlessmusic.app.rooms.RoomState
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
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import java.time.Instant
import java.util.UUID
import kotlin.math.abs
import kotlin.math.pow
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "PlaybackController"
private const val TICK_MS = 500L
private const val PREPARE_NEXT_DELAY_MS = 15_000L

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
    private val pendingPlays: PendingPlays,
    private val songCache: SongCache,
    private val precacher: Precacher,
    // Lazy: opening the download folder is disk work, and waits until the player is first built.
    private val downloadCache: dagger.Lazy<Cache>,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val playerLazy = lazy { buildPlayer() }
    private val player: ExoPlayer by playerLazy

    /**
     * Owned here and lent to [PlaybackService], so the service being killed never loses the queue. The notification,
     * lock screen and headset buttons go through this wrapper, so their play, pause and skip fade like the app's (A71).
     */
    val sessionPlayer: Player by lazy {
        // In a room the same buttons drive the room for everyone (spec, "Clients").
        object : ForwardingPlayer(player) {
            override fun play() = if (inRoom) roomSetPlaying(true) else playWithFade()
            override fun pause() = if (inRoom) roomSetPlaying(false) else pauseWithFade()
            override fun setPlayWhenReady(playWhenReady: Boolean) = when {
                inRoom -> roomSetPlaying(playWhenReady)
                playWhenReady -> playWithFade()
                else -> pauseWithFade()
            }
            override fun seekToNext() = if (inRoom) skipToNext() else skipWithFade { player.seekToNext() }
            override fun seekToNextMediaItem() = if (inRoom) skipToNext() else skipWithFade { player.seekToNextMediaItem() }
            override fun seekToPrevious() = if (inRoom) skipToPrevious() else skipWithFade { player.seekToPrevious() }
            override fun seekToPreviousMediaItem() =
                if (inRoom) skipToPrevious() else skipWithFade { player.seekToPreviousMediaItem() }

            // Seeks from the lock screen, notification or Bluetooth: a song end planned from the old position no longer
            // fits (a fade-out would leave the rest silent, a crossfade tail would play the wrong part).
            override fun setShuffleModeEnabled(shuffleModeEnabled: Boolean) = setShuffleFromSession(shuffleModeEnabled)

            // A STOP from a headset or another app: nothing scheduled (a skip's jump, a pause fade, a crossfade tail)
            // may act after it.
            override fun stop() {
                // In a room that is a pause for everyone; stopping this phone alone is Leave, in the app.
                if (inRoom) return roomSetPlaying(false)
                fadeAction++
                pendingJump = null
                pausing = false
                resetFades()
                super.stop()
            }

            override fun seekTo(positionMs: Long) {
                if (inRoom) return this@PlaybackController.seekTo(positionMs)
                resetFades()
                super.seekTo(positionMs)
            }
            override fun seekTo(mediaItemIndex: Int, positionMs: Long) {
                if (inRoom) {
                    return if (mediaItemIndex == player.currentMediaItemIndex) {
                        this@PlaybackController.seekTo(positionMs)
                    } else {
                        skipToIndex(mediaItemIndex)
                    }
                }
                resetFades()
                super.seekTo(mediaItemIndex, positionMs)
            }
            override fun seekBack() {
                if (inRoom) return this@PlaybackController.seekTo(player.currentPosition - player.seekBackIncrement)
                resetFades()
                super.seekBack()
            }
            override fun seekForward() {
                if (inRoom) return this@PlaybackController.seekTo(player.currentPosition + player.seekForwardIncrement)
                resetFades()
                super.seekForward()
            }
        }
    }

    // Fades (A71, A72). `transitions` mirrors the setting; `boundary` is the song end already being handled, so the
    // ticker starts it once; `tail` is the second player that carries the old song through a crossfade.
    private val ramps = VolumeRamps(CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))
    private val boost = LoudnessBoost()
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
    // The sleep timer's "end of current song": no song-end fade or crossfade is planned, and the player pauses at the end.
    private var sleepAtSongEnd = false
    /** Called once when playback paused itself at the end of a song because of [pauseAtEndOfSong]. */
    var onSleepSongEnd: (() -> Unit)? = null

    // Held for the life of the process: a connected controller is what keeps PlaybackService bound,
    // and Media3 moves the bound service to the foreground while audio is playing.
    private var sessionController: ListenableFuture<MediaController>? = null

    private val equalizer = EqualizerSession(context)

    private val queue = mutableListOf<QueueItem>()

    // One key per queue entry, kept in step with [queue], so the same song queued twice is still two rows to the UI.
    private val keys = mutableListOf<Long>()
    private var nextKey = 0L
    private val _state = MutableStateFlow(PlaybackUiState())
    val state: StateFlow<PlaybackUiState> = _state.asStateFlow()

    private var tracker: ListenTracker? = null
    private var trackerItem: QueueItem? = null
    // The current play's id once its scrobble answers; the final listening time goes to it (A62).
    private var playId: Deferred<PlayRef?>? = null
    private var lastTickAt = 0L
    // The newest final-listening-time report, so logout can wait for it.
    private var lastFinish: Job? = null
    private var tickerJob: Job? = null
    private var errorMessage: String? = null

    /** [errorMessage] is only the offline skip notice, which clears itself when the next song starts. */
    private var skipNotice = false

    /**
     * Songs that failed one after another since something last played. With repeat-all there is always a next song,
     * so without a stop a down server or a revoked session would skip round the queue forever.
     */
    private var failedInARow = 0

    // The listener's shuffle/repeat choice, applied to the player whenever a queue is loaded.
    private var wantMode = ShuffleMode.OFF
    private val wantShuffle get() = wantMode != ShuffleMode.OFF
    // The last mode shuffle was on in, kept while it is off: the shuffle buttons turn it back on in this one (Q86).
    private var lastOnMode = ShuffleMode.SHUFFLE
    // Off: a tapped song turns shuffle off (see `playQueue`).
    private var keepShuffle = false
    private var endlessQueue = true
    // The queue generation whose endless radio ran dry, so it isn't started again until a new queue.
    private var endlessSpentFor = -1
    private var wantRepeat = Player.REPEAT_MODE_OFF
    // Mirrors the data saver setting; read by `toMediaItem`.
    private var dataSaver = false
    // Mirrors the "Fetch ahead" setting: songs after the playing one to hold on the phone (see `updatePrecache`).
    private var precacheCount = 0
    // With "Fetch ahead" off or in a room nothing pulls the next song early, so the server is asked to convert it (see `prepareNext`).
    private var prepareJob: Job? = null
    private var preparedId: Int? = null

    // Where the queue is topped up from as it runs low (see QueueSource). `generation` changes whenever the queue is
    // replaced, so a top-up that was in flight for the old queue is dropped instead of landing on the new one.
    private var source: QueueSource? = null
    private var refilling = false
    private var generation = 0

    // Tracks added with "Play next" that have not started yet, so a second one lands after the first, not before it.
    private var playNextPending = 0

    // A library re-source waiting for the shuffle mode to settle (see `setShuffleMode`).
    private var resourceJob: Job? = null

    // "Listen together" (A102): while a room is joined, the player follows the room's state (`syncToRoom`) and the
    // transport sends room commands instead of acting here. Spec: `.docs/specs/room-sync.md`.
    private var roomLink: RoomLink? = null
    private val inRoom get() = roomLink != null
    private var room: RoomState? = null
    // The room's entry ids, in step with [queue]; `roomKeys` gives each a list key that survives moves.
    private var roomEntryIds = emptyList<Int>()
    private val roomKeys = HashMap<Int, Long>()
    // The entry the player holds, so the sync can tell when the room moved to another song.
    private var roomEntry: Int? = null
    private var driftStrikes = 0
    // How far ahead to aim a start or a correction so it lands on time, learned on this phone (spec, "Seek lead").
    private var seekLeadMs = 0L
    private var afterCorrection = false
    private var lastDriftMs: Long? = null
    private var roomStartJob: Job? = null
    private var roomTickJob: Job? = null
    private var lastRoomRetryAt = 0L
    // Paused here by a call, another app or unplugged headphones while the room plays on: stay quiet until Play.
    private var sittingOut = false
    // Play pressed in a room: the songs go in after the current one, and this jumps to the picked one once it's there.
    private var pendingRoomJump: PendingRoomJump? = null

    init {
        scope.launch {
            wantMode = settings.shuffleMode.first()
            lastOnMode = settings.lastShuffleMode.first()
            wantRepeat = settings.repeatMode.first()
        }
        scope.launch {
            settings.transitions.collect {
                transitions = it
                // Levelling switched on or off applies to the song playing now. Not worth building the player for.
                if (playerLazy.isInitialized()) levelPlayer(player, queue.getOrNull(player.currentMediaItemIndex))
            }
        }
        scope.launch { settings.keepShuffle.collect { keepShuffle = it } }
        scope.launch { settings.endlessQueue.collect { endlessQueue = it; if (it && playerLazy.isInitialized()) maybeRefill() } }
        scope.launch { settings.dataSaver.collect(::applyDataSaver) }
        scope.launch { settings.precacheCount.collect { precacheCount = it; updatePrecache() } }
        scope.launch { networkMonitor.online.collect { updatePrecache() } }
        // A song finishing its download, or the stored downloads loading at start, changes which copy a queued song
        // should use and, offline, whether it can play at all.
        scope.launch {
            // Keyed on loaded too: with nothing downloaded the set never changes, but loading must still be heard.
            combine(downloads.loaded, downloads.downloads) { loaded, all -> loaded to all.filterValues { it.isDone }.keys }
                .distinctUntilChanged()
                .collect {
                    rebuildQueuedItems()
                    skipToDownloaded(skipCurrent = false)
                }
        }
    }

    /**
     * Switches every queued song but the playing one to the data-saver copy or back. The playing one keeps its file:
     * a seek re-requests bytes by offset, and they must come from the same copy.
     */
    private fun applyDataSaver(enabled: Boolean) {
        if (enabled == dataSaver) return
        dataSaver = enabled
        rebuildQueuedItems()
    }

    /**
     * Points every queued song but the playing one at the copy it should use now: after data saver is switched, and
     * when a song finishes downloading (it then plays its original from the phone, which the data-saver copy's cache
     * key would never find). The playing one keeps its file, for the reason above.
     */
    private fun rebuildQueuedItems() {
        updatePrecache()
        // Before touching the player: with nothing queued it may not be built yet, and this is no reason to build it.
        if (queue.isEmpty()) return
        val current = player.currentMediaItemIndex
        if (current !in queue.indices || player.mediaItemCount != queue.size) return
        val stale = queue.indices.any { i ->
            i != current && player.getMediaItemAt(i).localConfiguration?.uri?.toString() != streamUrlFor(queue[i])
        }
        if (!stale) return
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
        if (inRoom) return roomPlay(items, startIndex)
        val mode = shuffleModeForPlay(shuffle, keepShuffle, wantMode, lastOnMode)
        if (mode != wantMode) {
            wantMode = mode
            if (mode != ShuffleMode.OFF) lastOnMode = mode
            scope.launch { settings.setShuffleMode(mode) }
        }
        loadQueue(items, startIndex, 0L, play = true, source)
    }

    /** Opens the phone's equalizer, or an equalizer app's, on the music. Null when the phone has none. */
    fun equalizerIntent(): Intent? = EqualizerSession.panelIntent(context, player.audioSessionId)

    /** Restores a saved queue, paused unless [autoPlay]. A no-op if something is already queued. */
    fun restoreQueue(items: List<QueueItem>, startIndex: Int, positionMs: Long, autoPlay: Boolean) {
        if (queue.isNotEmpty() || inRoom) return
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
        failedInARow = 0
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

    /** Plays [items] (default just [item]), then keeps going with songs like [item] (A234). */
    fun startRadio(item: QueueItem, items: List<QueueItem> = listOf(item)) =
        playQueue(items, 0, QueueSource.Radio(item.trackId), shuffle = false)

    /** Inserts right after the current track; starts playing if nothing is queued. */
    fun playNext(item: QueueItem) {
        if (inRoom) return roomSend(RoomCommand.Add(listOf(item.trackId), after = room?.currentEntry?.entryId))
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
        // With endless on, a queue with no source left carries on as a radio from its last song (A235). Not in a room
        // (the room owns its queue) and not with repeat on (that queue never ends).
        if (source == null && endlessQueue && !inRoom && endlessSpentFor != generation && queue.isNotEmpty() &&
            player.repeatMode == Player.REPEAT_MODE_OFF && tracksRemaining() <= REFILL_WHEN_REMAINING
        ) {
            source = QueueSource.Radio(queue.last().trackId, endless = true)
        }
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
                    if (from is QueueSource.Radio && from.endless && chunk.next == null) endlessSpentFor = generation
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
            is QueueSource.Radio -> {
                val exclude = listOf(current.seedTrackId) + queue.map { it.trackId }
                val page = libraryRepository.getRadio(current.seedTrackId, current.seed, exclude, RADIO_CHUNK).getOrNull() ?: return null
                return Chunk(page.tracks.map(libraryRepository::queueItem), if (page.tracks.isEmpty()) null else current)
            }
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
        if (inRoom) return roomSetPlaying(!(room?.playback?.playing == true && hearingRoom()))
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
        if (inRoom) {
            val entry = room?.currentEntry ?: return
            return roomSend(RoomCommand.Seek(entry.entryId, positionMs.coerceIn(0, entry.durationMs)))
        }
        if (queue.isEmpty()) return
        // A song end planned from the old position no longer fits; the ticker plans it again.
        resetFades()
        player.seekTo(positionMs.coerceAtLeast(0))
        publish()
    }

    fun skipToNext() {
        if (inRoom) return room?.currentEntry?.let { roomSend(RoomCommand.Next(it.entryId)) } ?: Unit
        if (player.hasNextMediaItem()) skipWithFade { player.seekToNextMediaItem() }
    }

    /** Past the first few seconds this restarts the track, matching what every player does. */
    fun skipToPrevious() {
        // The server restarts the song instead when it's past its first 3 s, like here.
        if (inRoom) return room?.currentEntry?.let { roomSend(RoomCommand.Previous(it.entryId)) } ?: Unit
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
        if (inRoom) return skipToPrevious()
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
        if (inRoom) return roomEntryIds.getOrNull(index)?.let { roomSend(RoomCommand.Jump(it)) } ?: Unit
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
        if (inRoom) {
            // No Undo in a room: by then someone else may have changed the queue.
            roomEntryIds.getOrNull(index)?.let { roomSend(RoomCommand.Remove(it)) }
            return null
        }
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
        if (inRoom) return
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
        if (inRoom) return roomSend(RoomCommand.Move(roomEntryIds[from], to))
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
    fun cycleShuffle() {
        // A room plays its queue once, in order, the same for everyone.
        if (!inRoom) setShuffleMode(wantMode.next())
    }

    /**
     * Shuffle turned on or off from outside the app (notification, lock screen, Bluetooth). On means the mode last
     * picked, not ExoPlayer's own random order.
     */
    private fun setShuffleFromSession(enabled: Boolean) {
        if (enabled == wantShuffle || inRoom) return
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
        if (inRoom) return
        wantRepeat = when (wantRepeat) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
        player.repeatMode = wantRepeat
        scope.launch { settings.setRepeatMode(wantRepeat) }
        publish()
    }

    /**
     * Ends playback and empties the queue, so a logout doesn't leave the last account's music playing. Closing the app
     * (A58) passes [countAsSkip] false: that cuts the song short without the listener skipping it.
     */
    fun stop(countAsSkip: Boolean = true) {
        if (queue.isEmpty()) return
        fadeAction++
        pendingJump = null
        pausing = false
        resetFades()
        player.stop()
        player.clearMediaItems()
        equalizer.close()
        queue.clear()
        keys.clear()
        source = null
        generation++
        playNextPending = 0
        if (countAsSkip) recordSkip()
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

    /**
     * The sleep timer's end: fade out over [fadeMs], then pause. Same shape as [pauseWithFade], and a play, pause or skip
     * during the fade wins the same way. Ignores the fade-on-pause setting, the long fade is the point.
     */
    fun fadeOutAndPause(fadeMs: Long) {
        if (inRoom || !player.isPlaying) return
        val action = ++fadeAction
        runPendingJump()
        resetFades(keepVolume = true)
        pausing = true
        ramps.rampTo(player, 0f, fadeMs) {
            if (action != fadeAction) return@rampTo
            pausing = false
            player.pause()
            // Back to full, so the next play doesn't start silent.
            ramps.set(player, 1f)
        }
    }

    /**
     * The sleep timer's "end of current song": pauses when the song that plays now ends, without a fade or crossfade into
     * the next one. Not for rooms, where the server drives songs. Cleared again by passing false.
     */
    fun pauseAtEndOfSong(on: Boolean) {
        if (on && inRoom) return
        sleepAtSongEnd = on
        if (on) resetFades(keepVolume = true)
        if (queue.isNotEmpty() && !inRoom) player.pauseAtEndOfMediaItems = on
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

    /**
     * Levels [p] to [item]'s loudness (A3): a cut through the volume, a boost through [LoudnessBoost]. Unity with the
     * setting off, and for a song the server hasn't measured yet.
     */
    private fun levelPlayer(p: ExoPlayer, item: QueueItem?) {
        val gainDb = item?.gainDb?.takeIf { transitions.levelVolume } ?: 0.0
        ramps.setLevel(p, 10.0.pow(minOf(gainDb, 0.0) / 20).toFloat())
        boost.set(p, gainDb)
    }

    private fun cancelCrossfade() {
        crossfadeJob?.cancel()
        crossfadeJob = null
        tail?.let {
            ramps.forget(it)
            boost.release(it)
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
        // No fades in a room: the server ends songs, and a fade behind a moving target is where the drift maths gets hard.
        // A sleep fade is a pause under way: a planned song end would take the ramp over.
        if (boundary != null || !player.isPlaying || inRoom || pausing || sleepAtSongEnd) return
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
        levelPlayer(t, queue.getOrNull(outgoingIndex))
        ramps.set(t, ramps.fade(player))
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
     * Downloads first, then the song cache, then the server. Downloads are read-only: streaming never writes into that
     * folder, which nothing ever evicts. What streams is kept in the song cache (A198), so a downloaded song never
     * lands there twice.
     */
    private val dataSourceFactory by lazy {
        val cached = CacheDataSource.Factory()
            .setCache(songCache.cache)
            .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(okHttpClient))
            .setCacheKeyFactory(TrackCacheKey)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        CacheDataSource.Factory()
            .setCache(downloadCache.get())
            .setUpstreamDataSourceFactory(cached)
            .setCacheWriteDataSinkFactory(null)
            .setCacheKeyFactory(TrackCacheKey)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    /**
     * The crossfade's tail player is built the same way but takes no audio focus (it would take it from the main player)
     * and isn't wired to the session or the listener: it only plays out the old song while it fades.
     */
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
            // Holds CPU and Wi-Fi awake while playing; without it a phone in the background can starve the stream.
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
                equalizer.open(player.audioSessionId)
                failedInARow = 0
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

        override fun onPlaybackStateChanged(playbackState: Int) {
            // Fetching waits for the playing song to be going: the player's own first bytes come first.
            if (playbackState == Player.STATE_READY) updatePrecache()
            publish()
        }

        override fun onTimelineChanged(timeline: Timeline, reason: Int) = updatePrecache()

        override fun onAudioSessionIdChanged(audioSessionId: Int) {
            if (player.isPlaying) equalizer.open(audioSessionId) else equalizer.close()
        }

        // Unplugged headphones, a call or another app's audio. `onIsPlayingChanged` alone misses these right after a
        // crossfade's hand-off, while the main player buffers. Ramps run on wall-clock time, so a song-end fade-out
        // would also finish during the call and leave the rest silent; the ticker plans it again after.
        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (!playWhenReady && !pausing) resetFades()
            if (sleepAtSongEnd && !playWhenReady && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) {
                sleepAtSongEnd = false
                player.pauseAtEndOfMediaItems = false
                onSleepSongEnd?.invoke()
            }
            if (inRoom) onRoomPlayWhenReady(playWhenReady, reason)
        }

        override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
            if (playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) resetFades()
        }

        override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) = publish()

        override fun onRepeatModeChanged(repeatMode: Int) = publish()

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            levelPlayer(player, queue.getOrNull(player.currentMediaItemIndex))
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
            updatePrecache()
            publish()
        }

        override fun onPlayerError(error: PlaybackException) {
            Log.w(TAG, "Playback failed for track ${queue.getOrNull(player.currentMediaItemIndex)?.trackId}", error)
            if (inRoom) {
                // Skipping here alone would leave the room; the sync tries this song again every few seconds.
                errorMessage = "Couldn't play this song here. Trying again."
                publish()
                return
            }
            // The signal went mid-song: carry on with what's on the phone instead of trying each song in turn.
            if (skipToDownloaded(skipCurrent = true)) return
            failedInARow++
            // One bad file shouldn't end the whole listen, but a run of them means the server, not the files.
            if (player.hasNextMediaItem() && failedInARow < minOf(queue.size, MAX_FAILED_IN_A_ROW)) {
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
            }.let { if (failedInARow > 1) "Stopped after $failedInARow songs in a row failed. $it" else it }
            publish()
        }
    }

    /**
     * With no signal, moves from a song that isn't downloaded ([skipCurrent]: or one that just failed) to the next
     * downloaded one in play order, with one line saying how many were passed over; pauses when none is left. Returns
     * whether it acted, so the caller leaves this song alone.
     */
    private fun skipToDownloaded(skipCurrent: Boolean): Boolean {
        // Until the stored downloads are read, everything looks not downloaded; the collector above runs this again.
        // A room decides the song for everyone; offline, the room's own catch-up rules apply instead.
        if (networkMonitor.online.value || queue.isEmpty() || !downloads.isLoaded || inRoom) return false
        val from = player.currentMediaItemIndex
        val current = queue.getOrNull(from) ?: return false
        if (!skipCurrent && onPhone(current.trackId)) return false
        val timeline = player.currentTimeline
        // Repeat-all wraps round to downloaded songs at the start; repeat-one walks the queue the same way.
        val repeat = if (player.repeatMode == Player.REPEAT_MODE_OFF) Player.REPEAT_MODE_OFF else Player.REPEAT_MODE_ALL
        var index = from
        var skipped = 1
        while (true) {
            index = timeline.getNextWindowIndex(index, repeat, player.shuffleModeEnabled)
            if (index == C.INDEX_UNSET || index == from) {
                player.pause()
                errorMessage = "You're offline, and no downloaded or cached songs are left in the queue."
                skipNotice = false
                publish()
                return true
            }
            if (onPhone(queue[index].trackId)) break
            skipped++
        }
        resetFades()
        player.seekTo(index, 0)
        player.prepare()
        if (!skipCurrent || skipped > 1) {
            errorMessage = if (skipped == 1) {
                "Skipped a song that isn't downloaded or cached."
            } else {
                "Skipped $skipped songs that aren't downloaded or cached."
            }
            skipNotice = true
        }
        publish()
        return true
    }

    /** Downloaded, or whole in the song cache: plays with no signal (A199). */
    /**
     * Tells the [Precacher] which songs to hold: the playing one and the next [precacheCount] in play order, each as
     * the copy the player will ask for. Nothing offline, in a room (the room picks the songs) or with the setting off.
     * Called whenever any of that changes; the same list is a no-op there.
     */
    private fun updatePrecache() {
        val live = playerLazy.isInitialized() && queue.isNotEmpty() && !inRoom && precacheCount > 0 &&
            networkMonitor.online.value
        if (!live) {
            precacher.want(emptyList())
            prepareNext()
            return
        }
        // Not yet playing: leave the list as it is, so a song just started is not starved by a fetch.
        if (player.playbackState != Player.STATE_READY) return
        val order = playOrder()
        val repeatOne = player.repeatMode == Player.REPEAT_MODE_ONE
        val picks = precacheOrder(
            order,
            order.indexOf(player.currentMediaItemIndex),
            if (repeatOne) 0 else precacheCount,
            wrap = player.repeatMode == Player.REPEAT_MODE_ALL,
        )
        precacher.want(picks.mapNotNull { i -> queue.getOrNull(i)?.let { item -> streamUrlFor(item)?.let { PrecacheWant(item, it) } } })
    }

    /**
     * Asks the server to convert the next song after [PREPARE_NEXT_DELAY_MS], so a skip run doesn't start one per song.
     * Same delay as the web. Skipped for a song already on the phone, or one already asked for.
     */
    private fun prepareNext() {
        prepareJob?.cancel()
        if (!playerLazy.isInitialized() || queue.isEmpty() || !networkMonitor.online.value) return
        if (player.playbackState != Player.STATE_READY || player.repeatMode == Player.REPEAT_MODE_ONE) return
        val order = playOrder()
        val next = precacheOrder(order, order.indexOf(player.currentMediaItemIndex), 1, wrap = player.repeatMode == Player.REPEAT_MODE_ALL)
            .drop(1).firstOrNull()?.let(queue::getOrNull) ?: return
        val id = next.trackId
        if (id == preparedId || onPhone(id)) return
        prepareJob = scope.launch {
            delay(PREPARE_NEXT_DELAY_MS)
            preparedId = id
            libraryRepository.prepareTrack(id, dataSaver)
        }
    }

    private fun onPhone(trackId: Int) = downloads.isDownloaded(trackId) || songCache.isCached(trackId)

    private fun beginTrack() {
        recordSkip()
        reportListened(final = true)
        val item = queue.getOrNull(player.currentMediaItemIndex)
        item?.let(songCache::record)
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

    /** Plays in a row with no skip between them, for [PlaybackUiState.chain]. */
    private var chain = 0

    private fun scrobble() {
        val item = trackerItem ?: return
        val listened = tracker?.listenedMs ?: return
        chain++
        // One id and one time for this play, whichever way it goes: a send that lands but whose answer is lost, then
        // sent again from the queue, is counted once (C10).
        val clientPlayId = UUID.randomUUID().toString()
        val playedAt = Instant.now().toString()
        // A missed scrobble costs a statistic, so it is never surfaced. With no signal it waits on the phone (A87).
        playId = scope.async {
            if (!networkMonitor.online.value) return@async pendingPlays.add(item.trackId, listened, clientPlayId, playedAt)
            libraryRepository.scrobble(item.trackId, listened, clientPlayId = clientPlayId).fold(
                onSuccess = { id ->
                    // The server is answering: anything that waited for it can go now.
                    pendingPlays.flush()
                    id?.let { PlayRef.Server(it) }
                },
                onFailure = {
                    // Unreachable, or answering with an error while smol is down (Cloudflare's 502/530): keep it for
                    // later, unless the server refused this play for good.
                    if (it.isRefusedForGood()) null else pendingPlays.add(item.trackId, listened, clientPlayId, playedAt)
                },
            )
        }
    }

    /**
     * The song ending now never reached the threshold: send it as a skip (A113), once, with the time it was heard. One
     * that never played at all (skipped past at once) isn't sent.
     */
    private fun recordSkip() {
        val item = trackerItem ?: return
        val heard = tracker ?: return
        if (heard.scrobbled || heard.listenedMs <= 0) return
        // A skip breaks the chain, as an ERROR does in the game.
        chain = 0
        val listened = heard.listenedMs
        val clientPlayId = UUID.randomUUID().toString()
        val playedAt = Instant.now().toString()
        // Joined by [stopAndFlush] like a play's final report, so a skip right before logout still goes as this account.
        lastFinish = scope.launch {
            if (!networkMonitor.online.value) {
                pendingPlays.add(item.trackId, listened, clientPlayId, playedAt, skipped = true)
                return@launch
            }
            libraryRepository.scrobble(item.trackId, listened, clientPlayId = clientPlayId, skipped = true).onFailure {
                if (!it.isRefusedForGood()) pendingPlays.add(item.trackId, listened, clientPlayId, playedAt, skipped = true)
            }
        }
    }

    /**
     * Sends how long the current play has really lasted (A62), once it has been scrobbled. On pause too, not only at the
     * end, so a play cut short by the app being killed still has a close number; [final] lets go of it.
     */
    private fun reportListened(final: Boolean) {
        val pending = playId ?: return
        val listened = tracker?.listenedMs ?: return
        if (final) playId = null
        lastFinish = scope.launch {
            when (val ref = pending.await()) {
                is PlayRef.Server -> libraryRepository.finishPlay(ref.playId, listened)
                is PlayRef.Local -> {
                    pendingPlays.setMsPlayed(ref, listened)
                    // Its length is final now, so it may be sent.
                    if (final) pendingPlays.close(ref)
                }
                null -> Unit
            }
        }
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
            queueStreams = queue.any { !onPhone(it.trackId) },
            inRoom = inRoom,
            chain = chain,
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
            onPhone = queue.getOrNull(player.currentMediaItemIndex)?.let {
                (!saver && downloads.isDownloaded(it.trackId)) || songCache.isCached(it.trackId, low = saver)
            } == true,
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

    /** A downloaded song plays its original from the phone: the smaller copy would only cost data. */
    /**
     * The original when it's on the phone, downloaded or cached, even with data saver on: it costs no data. Otherwise
     * the data-saver copy with data saver on, or offline when only that copy is cached.
     */
    private fun streamUrlFor(item: QueueItem): String? {
        val id = item.trackId
        val low = when {
            downloads.isDownloaded(id) || songCache.isCached(id, low = false) -> false
            dataSaver -> true
            else -> !networkMonitor.online.value && songCache.isCached(id, low = true)
        }
        return libraryRepository.streamUrl(id, low)
    }

    private fun toMediaItem(item: QueueItem): MediaItem? {
        val url = streamUrlFor(item) ?: return null
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

    // ---- "Listen together" room mode (spec: `.docs/specs/room-sync.md`) ----

    /** A room was joined: from now on the player follows [followRoom] and the transport sends room commands. */
    fun enterRoom(link: RoomLink) {
        roomLink = link
        room = null
        roomEntryIds = emptyList()
        roomEntry = null
        driftStrikes = 0
        afterCorrection = false
        sittingOut = false
        pendingRoomJump = null
        // A room plays its queue once, in order, without fades: nothing left over from playing alone may act in it.
        fadeAction++
        pendingJump = null
        pausing = false
        resetFades()
        source = null
        generation++
        playNextPending = 0
        roomTickJob?.cancel()
        // Once a second for drift, reported every 5 s for the Control Center monitor.
        roomTickJob = scope.launch {
            var ticks = 0
            while (isActive) {
                delay(ROOM_TICK_MS)
                syncToRoom()
                if (++ticks % ROOM_STATUS_EVERY == 0) {
                    roomLink?.status(lastDriftMs, player.playbackState == Player.STATE_BUFFERING)
                }
            }
        }
        publish()
    }

    /** A new room state, or the connection came back: line the player up with it. */
    fun followRoom(state: RoomState) {
        if (!inRoom) return
        room = state
        syncToRoom()
    }

    /**
     * Left, ended, removed or signed out. Leaving keeps playing the room's queue on this phone from where it was, so the
     * music never cuts off mid-song (spec, "Clients"); shuffle and repeat come back as they were.
     */
    fun exitRoom() {
        if (!inRoom) return
        roomLink = null
        room = null
        roomTickJob?.cancel()
        roomStartJob?.cancel()
        pendingRoomJump = null
        roomEntry = null
        lastDriftMs = null
        sittingOut = false
        if (queue.isNotEmpty()) {
            player.pauseAtEndOfMediaItems = false
            player.repeatMode = wantRepeat
            player.shuffleModeEnabled = wantShuffle
            if (wantShuffle) applyShuffleOrder(first = player.currentMediaItemIndex)
        }
        publish()
    }

    private fun roomSend(command: RoomCommand) {
        // Not queued while reconnecting: a skip pressed into the void would land late and surprise everyone.
        roomLink?.takeIf { it.live }?.send(command)
    }

    /** Whether this phone is playing along, rather than sitting out or stuck on a failed song. */
    private fun hearingRoom() = !sittingOut && player.playbackState != Player.STATE_IDLE

    /**
     * Play or pause from any button. Play while the room already plays starts it on this phone only (after a call, or
     * a failed song); the room didn't stop.
     */
    private fun roomSetPlaying(play: Boolean) {
        val current = room ?: return
        if (!play) return roomSend(RoomCommand.Pause)
        if (current.playback.playing) {
            sittingOut = false
            errorMessage = null
            if (player.playbackState == Player.STATE_IDLE) player.prepare()
            syncToRoom()
        } else {
            roomSend(RoomCommand.Play)
        }
    }

    /** Play on a song in a room adds it, and what follows it, after the current song, then jumps there for everyone. */
    private fun roomPlay(items: List<QueueItem>, startIndex: Int) {
        val picked = items.drop(startIndex.coerceIn(0, items.lastIndex.coerceAtLeast(0))).take(ROOM_ADD_MAX)
        val first = picked.firstOrNull() ?: return
        val after = room?.currentEntry?.entryId
        pendingRoomJump = PendingRoomJump(after, first.trackId, SystemClock.elapsedRealtime())
        roomSend(RoomCommand.Add(picked.map { it.trackId }, after))
    }

    private fun runPendingRoomJump(state: RoomState) {
        val pending = pendingRoomJump ?: return
        if (SystemClock.elapsedRealtime() - pending.at > ROOM_PENDING_JUMP_MS) {
            pendingRoomJump = null
            return
        }
        val start = if (pending.afterEntryId == null) 0 else state.queue.indexOfFirst { it.entryId == pending.afterEntryId } + 1
        if (pending.afterEntryId != null && start == 0) return
        val target = state.queue.getOrNull(start) ?: return
        if (target.trackId != pending.trackId || target.addedBy != roomLink?.you) return
        pendingRoomJump = null
        roomSend(RoomCommand.Jump(target.entryId))
    }

    private fun roomQueueItem(entry: RoomEntry) = QueueItem(
        trackId = entry.trackId,
        title = entry.title,
        artist = entry.artist,
        album = null,
        durationSec = entry.durationMs / 1000.0,
        coverUrl = libraryRepository.trackCoverUrl(entry.trackId),
        albumId = entry.albumId,
        gainDb = entry.gainDb,
    )

    /**
     * Makes the queue the room's. The playing song is kept where the room still has it, so someone adding a song
     * doesn't restart everyone's. Returns false when the songs can't be played here (signed out).
     */
    private fun applyRoomQueue(state: RoomState): Boolean {
        val ids = state.queue.map { it.entryId }
        if (ids == roomEntryIds && player.mediaItemCount == ids.size) return true
        val items = state.queue.map(::roomQueueItem)
        val media = items.map { toMediaItem(it) ?: return false }
        connectSession()
        player.shuffleModeEnabled = false
        player.repeatMode = Player.REPEAT_MODE_OFF
        // The server ends songs: this phone stops at the end of each and waits for the room's next one.
        player.pauseAtEndOfMediaItems = true

        val at = player.currentMediaItemIndex
        val sameList = player.mediaItemCount == queue.size && queue.isNotEmpty()
        val keepAt = when {
            !sameList -> -1
            roomEntryIds.size == queue.size -> roomEntryIds.getOrNull(at)?.let(ids::indexOf) ?: -1
            // Just started this room from what was playing: the song is already loaded.
            queue.getOrNull(at)?.trackId == state.currentEntry?.trackId -> state.current
            else -> -1
        }
        // Before the player changes, so the song change it reports (`beginTrack`) reads the new queue.
        queue.clear()
        queue.addAll(items)
        keys.clear()
        ids.forEach { id -> keys.add(roomKeys.getOrPut(id) { nextKey++ }) }
        roomKeys.keys.retainAll(ids.toSet())
        roomEntryIds = ids
        when {
            media.isEmpty() -> {
                player.pause()
                player.clearMediaItems()
            }
            keepAt >= 0 -> {
                player.replaceMediaItems(at + 1, player.mediaItemCount, media.subList(keepAt + 1, media.size))
                player.replaceMediaItems(0, at, media.subList(0, keepAt))
            }
            else -> {
                player.setMediaItems(media, state.current.coerceIn(0, media.lastIndex), 0)
                player.prepare()
                roomEntry = null
            }
        }
        publish()
        return true
    }

    /**
     * Makes this phone match the room: the right song, playing or paused, at the right position. Runs on every room
     * state and once a second. The formula and thresholds are the spec's ("Model", "Drift"), as on the web.
     */
    private fun syncToRoom() {
        val link = roomLink ?: return
        val state = room ?: return
        // Disconnected: carry on alone from the last state; `onRoomPlayWhenReady` moves to the next song.
        if (!link.live) return
        if (!applyRoomQueue(state)) return
        runPendingRoomJump(state)

        val entry = state.currentEntry
        if (entry == null) {
            roomStartJob?.cancel()
            if (player.playWhenReady) player.pause()
            publish()
            return
        }
        val expected = state.expectedPositionMs(link.serverNow())
        if (roomEntry != entry.entryId) {
            roomEntry = entry.entryId
            roomStartJob?.cancel()
            driftStrikes = 0
            afterCorrection = false
            if (player.currentMediaItemIndex != state.current) player.seekTo(state.current, expected.coerceAtLeast(0))
        }
        if (player.playbackState == Player.STATE_IDLE) {
            // A song that failed to load: try it again now and then, rather than skipping on alone.
            val now = SystemClock.elapsedRealtime()
            if (now - lastRoomRetryAt < ROOM_RETRY_MS) return
            lastRoomRetryAt = now
            player.prepare()
        }
        if (player.isPlaying && errorMessage != null) errorMessage = null

        if (!state.playback.playing) {
            roomStartJob?.cancel()
            lastDriftMs = null
            sittingOut = false
            if (player.playWhenReady) player.pause()
            if (abs(player.currentPosition - state.playback.positionMs) >= ROOM_DRIFT_LIMIT_MS) {
                player.seekTo(state.playback.positionMs)
            }
            publish()
            return
        }
        if (expected < 0) {
            // A new song's start time is still ahead: wait at the start, loading, and go on the dot.
            if (player.playWhenReady) player.pause()
            if (player.currentPosition > ROOM_DRIFT_LIMIT_MS) player.seekTo(0)
            roomStartJob?.cancel()
            roomStartJob = scope.launch {
                delay(-expected)
                syncToRoom()
            }
            publish()
            return
        }
        // Past the end: the server is about to move everyone on.
        if (expected >= entry.durationMs) return
        if (sittingOut) {
            lastDriftMs = null
            return
        }
        if (!player.playWhenReady) {
            player.seekTo(expected + seekLeadMs)
            afterCorrection = true
            driftStrikes = 0
            player.play()
            publish()
            return
        }
        // Buffering or ducked for a call: the position isn't moving, so a reading now says nothing.
        if (player.playbackState != Player.STATE_READY ||
            player.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE
        ) {
            return
        }
        val drift = player.currentPosition - expected
        lastDriftMs = drift
        if (afterCorrection) {
            // How far the last start or jump landed from where it should: aim that much further ahead next time.
            afterCorrection = false
            if (abs(drift) < 2_000) seekLeadMs = (seekLeadMs - drift).coerceIn(0, MAX_SEEK_LEAD_MS)
        }
        if (abs(drift) < ROOM_DRIFT_LIMIT_MS) {
            driftStrikes = 0
            return
        }
        // Two readings in a row, so one bad reading doesn't cause a jump.
        if (++driftStrikes >= 2) {
            player.seekTo(expected + seekLeadMs)
            afterCorrection = true
            driftStrikes = 0
        }
    }

    private fun onRoomPlayWhenReady(playWhenReady: Boolean, reason: Int) {
        when {
            // Paused by something on this phone (another app's audio, headphones out): the room plays on without it.
            !playWhenReady && (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS ||
                reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY) -> {
                sittingOut = true
                publish()
            }
            reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM -> {
                // The server's next song is moments away. Only with the connection down does this phone move on alone,
                // to the next song in the queue it last saw (spec, "The 30-second test").
                if (roomLink?.live == true) return
                val next = player.currentMediaItemIndex + 1
                if (next !in queue.indices) return
                roomEntry = roomEntryIds.getOrNull(next)
                player.seekTo(next, 0)
                player.play()
            }
        }
    }

    private class PendingRoomJump(val afterEntryId: Int?, val trackId: Int, val at: Long)

    /** A song end already being handled. */
    private sealed interface Boundary {
        data class FadeOutIn(val fadeMs: Long) : Boundary
        data object Crossfade : Boundary
    }

    private companion object {
        const val RESTART_THRESHOLD_MS = 3_000L

        /** Failures in a row before skipping gives up (fewer if the queue is shorter). */
        const val MAX_FAILED_IN_A_ROW = 5

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
        /** Songs per radio request; the server caps it at 100. */
        const val RADIO_CHUNK = 40

        const val ROOM_TICK_MS = 1_000L
        /** Status goes out every this many ticks (5 s). */
        const val ROOM_STATUS_EVERY = 5
        /** Off by this much, twice in a row, means seek back into step (spec, "Drift"). */
        const val ROOM_DRIFT_LIMIT_MS = 300L
        const val MAX_SEEK_LEAD_MS = 1_000L
        /** A song picked with Play in a room waits this long for the server to add it, then the jump is dropped. */
        const val ROOM_PENDING_JUMP_MS = 10_000L
        const val ROOM_RETRY_MS = 5_000L
        /** Play on a song in a room adds it and up to this many in all, so a long list can't fill the room's 500. */
        const val ROOM_ADD_MAX = 50
    }
}

/** What room mode needs from the room session (`rooms/RoomSession.kt`). */
interface RoomLink {
    /** Connected, with the clock settled. While false the player carries on alone from the last state. */
    val live: Boolean
    /** Our user id in the room. */
    val you: Int?
    fun send(command: RoomCommand)
    /** The server's clock now, in ms. */
    fun serverNow(): Long
    fun status(driftMs: Long?, buffering: Boolean)
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
