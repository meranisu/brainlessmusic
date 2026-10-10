package com.brainlessmusic.app.playback

private const val SCROBBLE_CAP_SECONDS = 240.0

/** Longest tick that counts as listening, so a stalled ticker can't credit music that never played. */
private const val MAX_TICK_MS = 2_000L

/** A play counts at half the track or four minutes, whichever is first: the web player's rule. Unknown duration uses the cap. */
fun scrobbleThresholdMs(durationSeconds: Double?): Long {
    if (durationSeconds == null || !durationSeconds.isFinite() || durationSeconds <= 0) {
        return (SCROBBLE_CAP_SECONDS * 1000).toLong()
    }
    return (minOf(durationSeconds / 2, SCROBBLE_CAP_SECONDS) * 1000).toLong()
}

/** Time actually heard in one playthrough. Fed wall-clock ticks, not positions, so seeking adds no credit. */
class ListenTracker(durationSeconds: Double?) {
    val thresholdMs: Long = scrobbleThresholdMs(durationSeconds)

    var listenedMs: Long = 0
        private set

    var scrobbled: Boolean = false
        private set

    /** @return `true` once, on the tick that crosses the threshold. */
    fun onTick(elapsedMs: Long, playing: Boolean): Boolean {
        if (scrobbled || !playing || elapsedMs <= 0) return false
        listenedMs += minOf(elapsedMs, MAX_TICK_MS)
        if (listenedMs < thresholdMs) return false
        scrobbled = true
        return true
    }
}
