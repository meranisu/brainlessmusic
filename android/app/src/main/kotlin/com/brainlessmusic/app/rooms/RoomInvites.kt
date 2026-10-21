package com.brainlessmusic.app.rooms

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.brainlessmusic.app.MainActivity
import com.brainlessmusic.app.R
import com.brainlessmusic.app.data.remote.ApiServiceFactory
import com.brainlessmusic.app.data.remote.ServerConfig
import com.brainlessmusic.app.data.remote.TokenProvider
import com.brainlessmusic.app.data.remote.dto.RoomInviteDto
import com.brainlessmusic.app.data.remote.dto.SendInvitesRequest
import com.brainlessmusic.app.data.remote.dto.SocialPersonDto
import com.brainlessmusic.app.data.repository.apiResult
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Listen together invites (A255): sending them, and noticing ones sent to us. With no push service the server is asked
 * every 15 s, but only while someone holds the poller: the app on screen ([MainActivity]) or the playback service
 * (music playing in the background). A closed app hears about an invite once it opens (A264). Each invite is announced
 * once, as a notification with Join (the room's `/join/<code>` link) and Reject ([InviteActionReceiver]), and stays in
 * [pending] for the in-app banner until it is answered or lapses.
 */
@Singleton
class RoomInvites @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiServiceFactory: ApiServiceFactory,
    private val serverConfig: ServerConfig,
    private val tokenProvider: TokenProvider,
    private val session: RoomSession,
    private val issues: RoomIssues,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var holders = 0
    private var polling: Job? = null
    /** Room codes already announced, so an invite rings once however many polls see it. */
    private val announced = mutableSetOf<String>()
    private val _pending = MutableStateFlow<List<RoomInviteDto>>(emptyList())

    /** Invites to rooms other than the one we're in, newest poll's view; the banner shows the first. */
    val pending: StateFlow<List<RoomInviteDto>> = _pending.asStateFlow()

    private val api get() = apiServiceFactory.get(serverConfig.url)

    suspend fun invitable(): Result<List<SocialPersonDto>> =
        apiResult { issues.tracked("Couldn't load the invite list") { api.invitablePeople().people } }

    /** How many new invites went out; someone already invited isn't asked twice. */
    suspend fun send(userIds: List<Int>): Result<Int> =
        apiResult { issues.tracked("Couldn't send an invite") { api.sendInvites(SendInvitesRequest(userIds)).invited } }

    fun acquire() {
        holders += 1
        if (polling?.isActive == true) return
        polling = scope.launch {
            while (isActive) {
                poll()
                delay(POLL_MS)
            }
        }
    }

    fun release() {
        holders = (holders - 1).coerceAtLeast(0)
        if (holders == 0) {
            polling?.cancel()
            polling = null
        }
    }

    private suspend fun poll() {
        // Guests can't be invited (accounts only, both ways).
        if (tokenProvider.current == null || tokenProvider.isGuest) return
        val invites = apiResult { issues.tracked("Couldn't check for room invites") { api.roomInvites().invites } }
            .getOrNull() ?: return
        val here = session.state.value.room?.code
        // Joined some other way (the banner, a link): its notification has nothing left to offer.
        here?.let { cancelNotification(it) }
        for (invite in invites) {
            if (invite.code == here || !announced.add(invite.code)) continue
            notify(invite)
        }
        // Forgotten once gone, so a new invite to the same room later rings again.
        announced.retainAll(invites.map { it.code }.toSet())
        _pending.value = invites.filter { it.code != here }
    }

    /** Says no to an invite: the server drops it, and its notification and banner go (A264). */
    suspend fun decline(code: String) {
        _pending.value = _pending.value.filterNot { it.code == code }
        cancelNotification(code)
        apiResult { issues.tracked("Couldn't turn down a room invite") { api.declineInvite(code) } }
    }

    fun cancelNotification(code: String) {
        NotificationManagerCompat.from(context).cancel(notificationId(code))
    }

    private fun notify(invite: RoomInviteDto) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Listen together invites", NotificationManager.IMPORTANCE_HIGH),
            )
        }
        val open = PendingIntent.getActivity(
            context,
            invite.code.hashCode(),
            Intent(Intent.ACTION_VIEW, Uri.parse(RoomLinks.linkFor(invite.code)), context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val playing = invite.nowPlaying?.let { np -> "Playing ${np.title}" + (np.artist?.let { " by $it" } ?: "") }
            ?: "Nothing playing yet"
        val people = invite.members.size.let { if (it == 1) "1 person" else "$it people" }
        val reject = PendingIntent.getBroadcast(
            context,
            invite.code.hashCode(),
            Intent(context, InviteActionReceiver::class.java)
                .setAction(InviteActionReceiver.ACTION_REJECT)
                .putExtra(InviteActionReceiver.EXTRA_CODE, invite.code),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle("${invite.from.name} invited you to listen together")
            .setContentText("$playing · $people in")
            .setContentIntent(open)
            .addAction(0, "Join", open)
            .addAction(0, "Reject", reject)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(notificationId(invite.code), notification)
    }

    private fun notificationId(code: String) = NOTIFICATION_BASE + (code.hashCode() and 0xFFF)

    private companion object {
        const val POLL_MS = 15_000L
        const val CHANNEL_ID = "invites"
        /** Clear of the update notification's 7001. */
        const val NOTIFICATION_BASE = 8000
    }
}
