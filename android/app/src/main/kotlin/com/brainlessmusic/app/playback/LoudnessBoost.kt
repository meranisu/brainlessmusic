package com.brainlessmusic.app.playback

import android.media.audiofx.LoudnessEnhancer
import android.util.Log
import androidx.media3.exoplayer.ExoPlayer
import kotlin.math.roundToInt

/**
 * The part of levelling (A3) that turns a song up. `Player.volume` stops at 1, so a quiet song's boost goes through a
 * [LoudnessEnhancer] on the player's audio session; like the volume, it acts on what is being heard, so the change lands
 * with the song change even when songs join gaplessly. Made on first need, one per player. The server caps a boost
 * under the song's peak, so the enhancer's own limiter has nothing to do. A phone that refuses the effect plays quiet
 * songs unboosted, which is how they played before levelling. Main thread only.
 */
internal class LoudnessBoost {
    private val enhancers = HashMap<ExoPlayer, LoudnessEnhancer>()

    fun set(player: ExoPlayer, gainDb: Double) {
        val millibels = (gainDb.coerceAtLeast(0.0) * 100).roundToInt()
        val enhancer = enhancers[player]
            ?: if (millibels == 0) {
                return
            } else {
                try {
                    LoudnessEnhancer(player.audioSessionId).also { enhancers[player] = it }
                } catch (e: RuntimeException) {
                    Log.w(TAG, "No loudness enhancer on this phone; quiet songs stay quiet", e)
                    return
                }
            }
        try {
            enhancer.setTargetGain(millibels)
            enhancer.enabled = millibels > 0
        } catch (e: RuntimeException) {
            Log.w(TAG, "Couldn't set the loudness boost", e)
        }
    }

    fun release(player: ExoPlayer) {
        enhancers.remove(player)?.let { runCatching { it.release() } }
    }

    private companion object {
        const val TAG = "LoudnessBoost"
    }
}
