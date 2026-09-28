package com.brainlessmusic.app.playback

import android.app.PendingIntent
import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceBitmapLoader
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.brainlessmusic.app.MainActivity
import com.google.common.util.concurrent.MoreExecutors
import dagger.hilt.android.AndroidEntryPoint
import okhttp3.OkHttpClient
import java.util.concurrent.Executors
import javax.inject.Inject

/**
 * Phase 3: puts the app's one player behind a [MediaSession], which is what gives it the media
 * notification, the lock-screen controls, headset/Bluetooth buttons, and a foreground service
 * that keeps audio going with the screen off. Media3 posts the notification and moves this
 * service to the foreground itself while the player is playing.
 *
 * The player is owned by [PlaybackController], not by this service — the service only lends it to
 * the session — so if the system kills the service the queue survives and the next play reconnects.
 */
@OptIn(UnstableApi::class)
@AndroidEntryPoint
class PlaybackService : MediaSessionService() {

    @Inject lateinit var controller: PlaybackController
    @Inject lateinit var okHttpClient: OkHttpClient

    private var session: MediaSession? = null

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
            // Cover art is behind the bearer token, which the default loader knows nothing about —
            // without this the notification and lock screen would show no artwork.
            .setBitmapLoader(
                DataSourceBitmapLoader(
                    MoreExecutors.listeningDecorator(Executors.newSingleThreadExecutor()),
                    OkHttpDataSource.Factory(okHttpClient),
                ),
            )
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    /** Swiping the app away stops the service unless music is actually playing. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        if (controller.sessionPlayer.playWhenReady.not() || controller.sessionPlayer.mediaItemCount == 0) {
            pauseAllPlayersAndStopSelf()
        }
    }

    override fun onDestroy() {
        // Release the session but never the player: it belongs to PlaybackController.
        session?.release()
        session = null
        super.onDestroy()
    }
}
