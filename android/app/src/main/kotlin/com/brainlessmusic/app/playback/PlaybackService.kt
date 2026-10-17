package com.brainlessmusic.app.playback

import android.app.PendingIntent
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import androidx.annotation.OptIn
import androidx.core.content.IntentCompat
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceBitmapLoader
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.brainlessmusic.app.MainActivity
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.google.common.util.concurrent.MoreExecutors
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import java.util.concurrent.Executors
import javax.inject.Inject

/**
 * Puts the player behind a [MediaSession] for the notification, lock screen, headset buttons and screen-off playback.
 * The player belongs to [PlaybackController], so a killed service never loses the queue.
 */
@OptIn(UnstableApi::class)
@AndroidEntryPoint
class PlaybackService : MediaSessionService() {

    @Inject lateinit var controller: PlaybackController
    @Inject lateinit var okHttpClient: OkHttpClient
    @Inject lateinit var settings: PlaybackSettings

    private var session: MediaSession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // Mirrored from the setting so onTaskRemoved can read it without blocking. Null until the first read lands.
    @Volatile
    private var keepPlayingWhenSwipedAway: Boolean? = null

    // Mirrored from the setting so a press never waits on a read. The defaults stand until the first read lands.
    @Volatile
    private var headsetPrefs = HeadsetButtonPrefs()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val headsetPresses = HeadsetPresses(
        prefs = { headsetPrefs },
        schedule = { delayMs, task ->
            val run = Runnable(task)
            mainHandler.postDelayed(run, delayMs)
            val cancel: () -> Unit = { mainHandler.removeCallbacks(run) }
            cancel
        },
        fire = ::runHeadsetAction,
    )

    /** The cover loader's thread, shut down with the service so each recreation doesn't leave one behind (C31). */
    private val bitmapExecutor = Executors.newSingleThreadExecutor()

    override fun onCreate() {
        super.onCreate()
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, controller.sessionPlayer)
            .setSessionActivity(openApp)
            // Cover art needs the bearer token; the default loader would show no artwork.
            .setBitmapLoader(
                DataSourceBitmapLoader(
                    MoreExecutors.listeningDecorator(bitmapExecutor),
                    // DefaultDataSource adds file:// for downloaded covers; http still goes through the shared client.
                    DefaultDataSource.Factory(this, OkHttpDataSource.Factory(okHttpClient)),
                ),
            )
            .setCallback(object : MediaSession.Callback {
                // Other apps (Android Auto, Wear, media controllers) can't edit the queue: those calls would reach
                // ExoPlayer directly and leave the app's own queue and row keys out of step with it.
                override fun onConnect(
                    session: MediaSession,
                    controller: MediaSession.ControllerInfo,
                ): MediaSession.ConnectionResult {
                    val result = super.onConnect(session, controller)
                    val commands = result.availablePlayerCommands.buildUpon()
                        .remove(Player.COMMAND_CHANGE_MEDIA_ITEMS)
                        .build()
                    return MediaSession.ConnectionResult.accept(result.availableSessionCommands, commands)
                }

                // Play/pause and the headset hook go through the press counter; next and previous run their own
                // action. Every other key (play, pause, stop, fast-forward) keeps Media3's handling.
                override fun onMediaButtonEvent(
                    session: MediaSession,
                    controllerInfo: MediaSession.ControllerInfo,
                    intent: Intent,
                ): Boolean {
                    val event = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
                        ?: return false
                    val handled = when (event.keyCode) {
                        KeyEvent.KEYCODE_HEADSETHOOK, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                        KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_PREVIOUS -> true
                        else -> false
                    }
                    if (!handled) return false
                    Log.i(TAG, "Media button key=${event.keyCode} action=${event.action} repeat=${event.repeatCount}")
                    // One press is a down and an up; a held key repeats the down. Count only the first down.
                    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                        when (event.keyCode) {
                            KeyEvent.KEYCODE_MEDIA_NEXT -> runHeadsetAction(headsetPrefs.nextButton)
                            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> runHeadsetAction(headsetPrefs.previousButton)
                            else -> headsetPresses.press()
                        }
                    }
                    return true
                }
            })
            .build()
        // Not read with runBlocking here: onCreate is on the main thread (C31). A swipe-away before this lands waits for it.
        scope.launch { settings.keepPlayingWhenSwipedAway.collect { keepPlayingWhenSwipedAway = it } }
        scope.launch { settings.headsetButtons.collect { headsetPrefs = it } }
    }

    /** Through the session player, so fades and Listening Together rooms apply as they do for the notification. */
    private fun runHeadsetAction(action: HeadsetAction) {
        val player = controller.sessionPlayer
        if (player.mediaItemCount == 0) return
        when (action) {
            HeadsetAction.PLAY_PAUSE -> if (player.playWhenReady) player.pause() else player.play()
            HeadsetAction.NEXT -> player.seekToNext()
            HeadsetAction.PREVIOUS -> player.seekToPrevious()
            HeadsetAction.SEEK_FORWARD -> seekBy(player, SEEK_STEP_MS)
            HeadsetAction.SEEK_BACK -> seekBy(player, -SEEK_STEP_MS)
            HeadsetAction.NONE -> Unit
        }
    }

    private fun seekBy(player: Player, deltaMs: Long) {
        val target = player.currentPosition + deltaMs
        val end = player.duration
        player.seekTo(if (end == C.TIME_UNSET) target.coerceAtLeast(0) else target.coerceIn(0, end))
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    /**
     * Swiping the app away stops the music and the service unless music is actually playing and the user chose to keep
     * it (A58). A stop, not a pause: the player outlives the service in [PlaybackController], so a pause left the
     * notification up with the track ready to go, unlike YouTube Music and Spotify. The saved resume point stays.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = controller.sessionPlayer
        // Only in the service's first moments is the setting not loaded yet; then it's worth the short wait.
        val keepPlaying = keepPlayingWhenSwipedAway ?: runBlocking { settings.keepPlayingWhenSwipedAway.first() }
        Log.i(TAG, "Task removed; keep playing = $keepPlaying, playWhenReady = ${player.playWhenReady}")
        if (!keepPlaying || !player.playWhenReady || player.mediaItemCount == 0) {
            controller.stop(countAsSkip = false)
            stopSelf()
        }
    }

    override fun onDestroy() {
        headsetPresses.cancel()
        scope.cancel()
        // Release the session but never the player: it belongs to PlaybackController.
        session?.release()
        session = null
        bitmapExecutor.shutdown()
        super.onDestroy()
    }
}

private const val TAG = "PlaybackService"
private const val SEEK_STEP_MS = 10_000L
