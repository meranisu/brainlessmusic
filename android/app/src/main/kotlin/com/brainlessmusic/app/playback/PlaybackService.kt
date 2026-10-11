package com.brainlessmusic.app.playback

import android.app.PendingIntent
import android.content.Intent
import androidx.annotation.OptIn
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

    // Mirrored from the setting so onTaskRemoved can read it without blocking; true matches the setting's default.
    private var keepPlayingWhenSwipedAway = true

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
                    MoreExecutors.listeningDecorator(Executors.newSingleThreadExecutor()),
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
            })
            .build()
        // Read once now, so a swipe-away in the service's first moments sees the real setting, not the default.
        keepPlayingWhenSwipedAway = runBlocking { settings.keepPlayingWhenSwipedAway.first() }
        scope.launch { settings.keepPlayingWhenSwipedAway.collect { keepPlayingWhenSwipedAway = it } }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    /** Swiping the app away stops the service unless music is actually playing and the user chose to keep it (A58). */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = controller.sessionPlayer
        if (!keepPlayingWhenSwipedAway || !player.playWhenReady || player.mediaItemCount == 0) {
            pauseAllPlayersAndStopSelf()
        }
    }

    override fun onDestroy() {
        scope.cancel()
        // Release the session but never the player: it belongs to PlaybackController.
        session?.release()
        session = null
        super.onDestroy()
    }
}
