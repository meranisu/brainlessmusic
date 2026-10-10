package com.brainlessmusic.app.playback

import android.os.SystemClock
import androidx.media3.common.Player
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Linear `Player.volume` ramps for the fades (A71). One per player: a newer ramp replaces the older one, and a replaced
 * or cancelled ramp never runs its `then`, so a late fade can't pause or skip over a newer action. Main thread only.
 */
internal class VolumeRamps(private val scope: CoroutineScope) {
    private val jobs = HashMap<Player, Job>()

    fun cancel(player: Player) {
        jobs.remove(player)?.cancel()
    }

    /** Sets the volume at once, dropping any ramp. */
    fun set(player: Player, volume: Float) {
        cancel(player)
        player.volume = volume
    }

    fun rampTo(player: Player, target: Float, durationMs: Long, then: (() -> Unit)? = null) {
        cancel(player)
        // Lazy, so it is registered before its first line runs: on the immediate dispatcher a zero-length ramp would
        // otherwise call `then` (which may start the next ramp) before this one is in the map, and overwrite it.
        lateinit var job: Job
        job = scope.launch(start = CoroutineStart.LAZY) {
            val from = player.volume
            val start = SystemClock.elapsedRealtime()
            while (durationMs > 0) {
                val t = ((SystemClock.elapsedRealtime() - start).toFloat() / durationMs).coerceAtMost(1f)
                player.volume = from + (target - from) * t
                if (t >= 1f) break
                delay(STEP_MS)
            }
            player.volume = target
            if (jobs[player] === job) jobs.remove(player)
            then?.invoke()
        }
        jobs[player] = job
        job.start()
    }

    private companion object {
        const val STEP_MS = 16L
    }
}
