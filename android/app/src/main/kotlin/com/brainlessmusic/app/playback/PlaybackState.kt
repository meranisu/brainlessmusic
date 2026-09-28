package com.brainlessmusic.app.playback

/** Everything the UI and the player's metadata need to describe one track, so neither has to re-fetch it. */
data class QueueItem(
    val trackId: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    val durationSec: Double?,
    val coverUrl: String?,
)

data class PlaybackUiState(
    val queue: List<QueueItem> = emptyList(),
    val currentIndex: Int = -1,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val error: String? = null,
) {
    val current: QueueItem? get() = queue.getOrNull(currentIndex)
    val hasQueue: Boolean get() = queue.isNotEmpty()
    val hasNext: Boolean get() = currentIndex in 0 until queue.lastIndex
    val hasPrevious: Boolean get() = currentIndex > 0
}
