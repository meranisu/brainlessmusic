package com.brainlessmusic.app.downloads

import android.app.Notification
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.PlatformScheduler
import androidx.media3.exoplayer.scheduler.Scheduler
import com.brainlessmusic.app.R
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/** Runs the download queue in the foreground with a progress notification, so it keeps going with the app closed. */
@UnstableApi
@AndroidEntryPoint
class MusicDownloadService : DownloadService(
    NOTIFICATION_ID,
    DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
    CHANNEL_ID,
    R.string.download_channel_name,
    0,
) {
    @Inject
    lateinit var manager: DownloadManager

    private val notifications by lazy { DownloadNotificationHelper(this, CHANNEL_ID) }

    override fun getDownloadManager(): DownloadManager = manager

    /** Restarts the queue when the signal comes back, even with the app closed. */
    override fun getScheduler(): Scheduler = PlatformScheduler(this, JOB_ID)

    override fun getForegroundNotification(downloads: MutableList<Download>, notMetRequirements: Int): Notification =
        notifications.buildProgressNotification(
            this,
            android.R.drawable.stat_sys_download,
            null,
            null,
            downloads,
            notMetRequirements,
        )

    private companion object {
        const val NOTIFICATION_ID = 2
        const val JOB_ID = 2
        const val CHANNEL_ID = "downloads"
    }
}
