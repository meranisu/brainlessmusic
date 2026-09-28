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
)

enum class Repeat { OFF, ALL, ONE }

/** What the player is actually receiving right now — read from ExoPlayer, not from the file's tags. */
data class StreamInfo(
    val codec: String?,
    val sampleRateHz: Int?,
    val channels: Int?,
    /** Stream bitrate when the container declares one; FLAC and Opus often don't. */
    val bitrateKbps: Int?,
    val bufferedAheadMs: Long,
    /** ExoPlayer's running estimate of the connection, not a measurement of this track. */
    val networkKbps: Long?,
)

data class PlaybackUiState(
    val queue: List<QueueItem> = emptyList(),
    val currentIndex: Int = -1,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val error: String? = null,
    // Asked of the player rather than derived from the index: with shuffle or repeat on, "next" is not index + 1.
    val hasNext: Boolean = false,
    val hasPrevious: Boolean = false,
    val shuffle: Boolean = false,
    val repeat: Repeat = Repeat.OFF,
    val stream: StreamInfo? = null,
) {
    val current: QueueItem? get() = queue.getOrNull(currentIndex)
    val hasQueue: Boolean get() = queue.isNotEmpty()
}
