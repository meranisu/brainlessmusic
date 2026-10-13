package com.brainlessmusic.app.invites

import android.content.Intent
import android.net.Uri
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Invite links, `https://music.nobrainmusic.my/invite/ABCD2345` (A187, A191): open the app on Sign up with the code
 * filled in. Without the app the same link opens the web sign-up page. Verified by the same assetlinks.json as room
 * links.
 */
@Singleton
class InviteLinks @Inject constructor() {
    private val _pending = MutableStateFlow<String?>(null)

    /** The code from a link that opened the app, until Sign up takes it. */
    val pending: StateFlow<String?> = _pending.asStateFlow()

    /** Keeps the code if [intent] is an invite link; anything else is left alone. */
    fun handle(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        codeFrom(intent.data)?.let { _pending.value = it }
    }

    fun take(): String? = _pending.value.also { _pending.value = null }

    companion object {
        /** `CODE_ALPHABET` in `backend/src/db/invites.ts`: no 0/O or 1/I/L. */
        const val CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
        const val CODE_LENGTH = 8

        /** Upper case, spaces and dashes dropped, or null when it isn't an 8-character code. */
        fun normalize(input: String): String? {
            val code = input.filterNot { it.isWhitespace() || it == '-' }.uppercase()
            return code.takeIf { it.length == CODE_LENGTH && it.all { c -> c in CODE_ALPHABET } }
        }

        /**
         * The code in an `/invite/<code>` link, or null. A long token from a link sent before codes is passed through
         * as it is: the server still knows it.
         */
        fun codeFrom(uri: Uri?): String? {
            val segments = uri?.pathSegments ?: return null
            if (segments.size != 2 || segments[0] != "invite") return null
            return normalize(segments[1]) ?: segments[1].takeIf { it.length in 20..64 }
        }
    }
}
