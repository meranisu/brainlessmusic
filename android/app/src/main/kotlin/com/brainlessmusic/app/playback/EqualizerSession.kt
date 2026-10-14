package com.brainlessmusic.app.playback

import android.content.Context
import android.content.Intent
import android.media.audiofx.AudioEffect
import androidx.media3.common.C

/**
 * Tells equalizer apps (the phone's own, Wavelet, Poweramp Equalizer) which audio session to work on, with Android's
 * open and close broadcasts. Opened when music first plays and kept through pauses, so an equalizer doesn't drop and
 * reattach on every pause; closed when the queue is stopped.
 *
 * Only the main player's session is announced. The crossfade's tail player keeps its own session, because the volume
 * levelling's [LoudnessBoost] is one effect per session: a shared one would give the old song the new song's boost.
 * So an equalizer app shapes the new song and not the old one while the two overlap.
 */
internal class EqualizerSession(private val context: Context) {
    private var openId = C.AUDIO_SESSION_ID_UNSET

    fun open(sessionId: Int) {
        if (sessionId == openId) return
        close()
        if (sessionId == C.AUDIO_SESSION_ID_UNSET) return
        send(AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION, sessionId)
        openId = sessionId
    }

    fun close() {
        if (openId == C.AUDIO_SESSION_ID_UNSET) return
        send(AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION, openId)
        openId = C.AUDIO_SESSION_ID_UNSET
    }

    private fun send(action: String, sessionId: Int) {
        context.sendBroadcast(withSession(Intent(action), context, sessionId))
    }

    companion object {
        /** The extras both the broadcasts and the equalizer screen ([panelIntent]) expect. */
        fun withSession(intent: Intent, context: Context, sessionId: Int): Intent = intent
            .putExtra(AudioEffect.EXTRA_AUDIO_SESSION, sessionId)
            .putExtra(AudioEffect.EXTRA_PACKAGE_NAME, context.packageName)
            .putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC)

        /** The phone's equalizer screen, or an installed equalizer app's. Null when there is none. */
        fun panelIntent(context: Context, sessionId: Int): Intent? {
            val intent = withSession(Intent(AudioEffect.ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL), context, sessionId)
            return intent.takeIf { it.resolveActivity(context.packageManager) != null }
        }
    }
}
