package com.brainlessmusic.app.rooms

import android.content.Intent
import android.net.Uri
import com.brainlessmusic.app.BuildConfig
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Room links, `https://music.nobrainmusic.my/join/KHZGBR`: what the share sheet sends, and what opens the app straight
 * into the room. Without the app the same link opens the web player's join page, which offers the APK. Android only
 * hands the link to the app because the server's `/.well-known/assetlinks.json` names the release key.
 */
@Singleton
class RoomLinks @Inject constructor() {
    private val _pending = MutableStateFlow<String?>(null)

    /** The code from a link that opened the app, until the Listen together screen takes it. */
    val pending: StateFlow<String?> = _pending.asStateFlow()

    /** Keeps the room code if [intent] is a room link; anything else is left alone. */
    fun handle(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        codeFrom(intent.data)?.let { _pending.value = it }
    }

    fun take(): String? = _pending.value.also { _pending.value = null }

    companion object {
        /** `CODE_ALPHABET` in `backend/src/services/rooms.ts`: no I or O, which read as 1 and 0. */
        const val CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"
        const val CODE_LENGTH = 6

        fun linkFor(code: String): String = BuildConfig.SERVER_URL.trimEnd('/') + "/join/" + code

        /** The code in a `/join/<code>` link, or null. Lower case is accepted: some apps lower a pasted link. */
        fun codeFrom(uri: Uri?): String? {
            val segments = uri?.pathSegments ?: return null
            if (segments.size != 2 || segments[0] != "join") return null
            val code = segments[1].uppercase()
            return code.takeIf { it.length == CODE_LENGTH && it.all { c -> c in CODE_ALPHABET } }
        }
    }
}
