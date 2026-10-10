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
 * Puts the player behind a [MediaSession] for the notification, lock screen, headset buttons and screen-off playback.
 * The player belongs to [PlaybackController], so a killed service never loses the queue.
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
            // Cover art needs the bearer token; the default loader would show no artwork.
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
