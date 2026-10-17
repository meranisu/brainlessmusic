package com.brainlessmusic.app.playback

/**
 * Turns the headset's play/pause presses into one action by counting how many land within [WINDOW_MS] of each other.
 * The timer is injected so the counting is testable without a looper.
 *
 * With nothing mapped to two or three presses a single press fires at once, so the common setup has no delay.
 * A press that reaches the highest mapped count fires at once as well.
 */
class HeadsetPresses(
    private val prefs: () -> HeadsetButtonPrefs,
    private val schedule: (delayMs: Long, task: () -> Unit) -> () -> Unit,
    private val fire: (HeadsetAction) -> Unit,
) {
    private var count = 0
    private var cancelPending: (() -> Unit)? = null

    fun press() {
        cancelPending?.invoke()
        cancelPending = null
        count++
        val p = prefs()
        val mostPresses = when {
            p.triple != HeadsetAction.NONE -> 3
            p.double != HeadsetAction.NONE -> 2
            else -> 1
        }
        if (count >= mostPresses) {
            settle()
        } else {
            cancelPending = schedule(WINDOW_MS) { settle() }
        }
    }

    /** Drops a counted press that has not fired, for when the service goes away. */
    fun cancel() {
        cancelPending?.invoke()
        cancelPending = null
        count = 0
    }

    private fun settle() {
        val p = prefs()
        val action = when (count) {
            1 -> p.single
            2 -> p.double
            else -> p.triple
        }
        cancelPending = null
        count = 0
        fire(action)
    }

    companion object {
        const val WINDOW_MS = 400L
    }
}
