package com.brainlessmusic.app.playback

private const val SCROBBLE_CAP_SECONDS = 240.0

/** Longest single tick that counts as listening — a stalled ticker must not credit minutes of music that never played. */
private const val MAX_TICK_MS = 2_000L

/**
 * A play counts once the listener has heard half the track, or four minutes
 * of it, whichever comes first — the same rule as the web player
 * (`frontend/src/components/PlayerBar.tsx`), so a track played on either
 * client moves the same counter. An unknown duration falls back to the cap.
 */
fun scrobbleThresholdMs(durationSeconds: Double?): Long {
    if (durationSeconds == null || !durationSeconds.isFinite() || durationSeconds <= 0) {
        return (SCROBBLE_CAP_SECONDS * 1000).toLong()
    }
    return (minOf(durationSeconds / 2, SCROBBLE_CAP_SECONDS) * 1000).toLong()
}

/**
 * Accumulates time actually heard for one playthrough of one track.
 *
 * Fed elapsed wall-clock time per tick rather than reading the player's
 * position, so seeking neither adds nor removes credit: skipping to the end
 * of a track does not make it "heard".
 */
class ListenTracker(durationSeconds: Double?) {
    val thresholdMs: Long = scrobbleThresholdMs(durationSeconds)

    var listenedMs: Long = 0
        private set

    var scrobbled: Boolean = false
        private set

    /** @return `true` exactly once — on the tick that crosses the threshold. */
    fun onTick(elapsedMs: Long, playing: Boolean): Boolean {
        if (scrobbled || !playing || elapsedMs <= 0) return false
        listenedMs += minOf(elapsedMs, MAX_TICK_MS)
        if (listenedMs < thresholdMs) return false
        scrobbled = true
        return true
    }
}
