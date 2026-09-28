package com.brainlessmusic.app.playback

/** The server rejects a longer queue outright (backend/src/db/playbackState.ts `MAX_QUEUE_LENGTH`). */
internal const val MAX_SAVED_QUEUE = 5000
internal const val SAVE_INTERVAL_MS = 10_000L

/** What decides "something worth saving changed", as opposed to position, which changes constantly. */
data class ResumeSnapshot(
    val trackIds: List<Int>,
    val index: Int,
    val playing: Boolean,
)

/**
 * When to write the playback state to the server. Mirrors the web player's
 * rule (A9): on a track or queue change, on play/pause, and every 10 s while
 * playing. Pure, so it is unit-tested without a player or a clock.
 */
class ResumeSavePolicy(private val intervalMs: Long = SAVE_INTERVAL_MS) {
    private var last: ResumeSnapshot? = null
    private var lastSavedAt = 0L

    fun shouldSave(snapshot: ResumeSnapshot, nowMs: Long): Boolean {
        // An empty queue is "nothing playing" (fresh launch, or logout) — never a reason to overwrite what is saved.
        if (snapshot.trackIds.isEmpty() || snapshot.trackIds.size > MAX_SAVED_QUEUE) return false
        val changed = snapshot != last
        val due = snapshot.playing && nowMs - lastSavedAt >= intervalMs
        if (!changed && !due) return false
        last = snapshot
        lastSavedAt = nowMs
        return true
    }
}
