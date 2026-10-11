package com.brainlessmusic.app.playback

/** Everything the UI and the player's metadata need to describe one track, so neither has to re-fetch it. */
data class QueueItem(
    val trackId: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    val durationSec: Double?,
    val coverUrl: String?,
    /** The file's container as the server names it ("flac", "opus", "mp3"…), for the stream readout. */
    val format: String? = null,
    /** With [trackNumber], tells "the next track of this album" apart (A72, gapless albums). */
    val albumId: Int? = null,
    val trackNumber: Int? = null,
)

enum class Repeat { OFF, ALL, ONE }

/** What the player is receiving now, read from ExoPlayer rather than the file's tags. */
data class StreamInfo(
    val codec: String?,
    val sampleRateHz: Int?,
    val channels: Int?,
    /** Stream bitrate when the container declares one; FLAC and Opus often don't. */
    val bitrateKbps: Int?,
    val bufferedAheadMs: Long,
    /** ExoPlayer's running estimate of the connection, not a measurement of this track. */
    val networkKbps: Long?,
    /** This track was asked for as the data-saver copy. */
    val dataSaver: Boolean = false,
    /** This track plays from its download, so buffering and the network say nothing about it (A95). */
    val onPhone: Boolean = false,
)

data class PlaybackUiState(
    val queue: List<QueueItem> = emptyList(),
    /** One stable key per [queue] entry, for list keys and drag-to-reorder. */
    val keys: List<Long> = emptyList(),
    val currentIndex: Int = -1,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val error: String? = null,
    // Asked of the player rather than derived from the index: with shuffle or repeat on, "next" is not index + 1.
    val hasNext: Boolean = false,
    val hasPrevious: Boolean = false,
    /** Index in [queue] of what plays after the current track (shuffle- and repeat-aware), or -1. */
    val nextIndex: Int = -1,
    /** With shuffle on: queue indices in the order they will play (current track first). Empty otherwise. */
    val playOrder: List<Int> = emptyList(),
    /** Whether the play order is shuffled; [shuffleMode] says which way. */
    val shuffle: Boolean = false,
    val shuffleMode: ShuffleMode = ShuffleMode.OFF,
    /** The queue is a library shuffle from the server. Otherwise it is fixed, and Rediscover there is a plain shuffle. */
    val fromLibrary: Boolean = false,
    val repeat: Repeat = Repeat.OFF,
    val stream: StreamInfo? = null,
    /** Some song in the queue would stream rather than play from the phone; data saver only matters then (A95). */
    val queueStreams: Boolean = true,
    /** In a "Listen together" room: the transport drives the room for everyone, and shuffle and repeat are off. */
    val inRoom: Boolean = false,
    /**
     * Songs heard to the play threshold in a row since the app started, broken by one recorded as a skip (A113): SOUND
     * VOLTEX's CHAIN, which Gear shows on its lane. Kept on the phone only, for this run of the app.
     */
    val chain: Int = 0,
) {
    val current: QueueItem? get() = queue.getOrNull(currentIndex)
    val hasQueue: Boolean get() = queue.isNotEmpty()
    val next: QueueItem? get() = queue.getOrNull(nextIndex)
}

/** A queue entry taken out by [PlaybackController.removeAt], and where it was in play order, for Undo. */
data class RemovedEntry(val item: QueueItem, val playPosition: Int)
