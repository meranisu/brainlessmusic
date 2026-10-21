package com.brainlessmusic.app.rooms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Reject on a Listen together invite's notification (A264). It works with the app closed: Android starts the process
 * for the broadcast, and [goAsync] keeps it alive until the server has been told.
 */
class InviteActionReceiver : BroadcastReceiver() {
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps {
        fun invites(): RoomInvites
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_REJECT) return
        val code = intent.getStringExtra(EXTRA_CODE) ?: return
        val invites = EntryPointAccessors.fromApplication(context.applicationContext, Deps::class.java).invites()
        val result = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                invites.decline(code)
            } finally {
                result.finish()
            }
        }
    }

    companion object {
        const val ACTION_REJECT = "com.brainlessmusic.app.action.REJECT_ROOM_INVITE"
        const val EXTRA_CODE = "code"
    }
}
