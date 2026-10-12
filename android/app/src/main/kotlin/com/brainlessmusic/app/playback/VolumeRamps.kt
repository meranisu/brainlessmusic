package com.brainlessmusic.app.playback

import android.os.SystemClock
import androidx.media3.common.Player
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Linear fades (A71), kept apart from each player's levelling cut (A3): `Player.volume` is always fade times level, so a
 * fade to "full" lands on the song's levelled loudness and a new song's level doesn't disturb a fade under way. One ramp
 * per player: a newer ramp replaces the older one, and a replaced or cancelled ramp never runs its `then`, so a late
 * fade can't pause or skip over a newer action. Main thread only.
 */
internal class VolumeRamps(private val scope: CoroutineScope) {
    private val jobs = HashMap<Player, Job>()
    private val fades = HashMap<Player, Float>()
    private val levels = HashMap<Player, Float>()

    /** Where this player's fade is, 0 to 1. */
    fun fade(player: Player): Float = fades[player] ?: 1f

    /** The levelling cut, 0 to 1; anything louder than full is [LoudnessBoost]'s. Keeps the fade where it is. */
    fun setLevel(player: Player, level: Float) {
        levels[player] = level
        apply(player, fade(player))
    }

    /** Drops everything held for a player that is being released. */
    fun forget(player: Player) {
        cancel(player)
        fades.remove(player)
        levels.remove(player)
    }

    private fun apply(player: Player, fade: Float) {
        fades[player] = fade
        player.volume = fade * (levels[player] ?: 1f)
    }

    fun cancel(player: Player) {
        jobs.remove(player)?.cancel()
    }

    /** Sets the fade at once, dropping any ramp. */
    fun set(player: Player, volume: Float) {
        cancel(player)
        apply(player, volume)
    }

    fun rampTo(player: Player, target: Float, durationMs: Long, then: (() -> Unit)? = null) {
        cancel(player)
        // Lazy, so it is registered before its first line runs: on the immediate dispatcher a zero-length ramp would
        // otherwise call `then` (which may start the next ramp) before this one is in the map, and overwrite it.
        lateinit var job: Job
        job = scope.launch(start = CoroutineStart.LAZY) {
            val from = fade(player)
            val start = SystemClock.elapsedRealtime()
            while (durationMs > 0) {
                val t = ((SystemClock.elapsedRealtime() - start).toFloat() / durationMs).coerceAtMost(1f)
                apply(player, from + (target - from) * t)
                if (t >= 1f) break
                delay(STEP_MS)
            }
            apply(player, target)
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
