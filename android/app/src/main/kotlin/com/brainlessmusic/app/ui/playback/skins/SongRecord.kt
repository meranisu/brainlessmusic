package com.brainlessmusic.app.ui.playback.skins

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/** How a song stands with you, the arcade way (A115). Each skin names these in its own game's words. */
enum class Clear { NEW, FAILED, CLEAR, FULL_COMBO }

/**
 * Plays against skips (A113): nothing yet is new, skipped at least as often as finished is failed, three or more
 * finishes with no skip is a full combo, anything else a clear.
 */
fun clearFor(plays: Int, skips: Int): Clear = when {
    plays == 0 && skips == 0 -> Clear.NEW
    skips >= plays -> Clear.FAILED
    skips == 0 && plays >= 3 -> Clear.FULL_COMBO
    else -> Clear.CLEAR
}

/** "14 plays · 52 min", the numbers half of a score strip. */
fun recordLine(plays: Int, msListened: Long): String {
    val minutes = msListened / 60_000
    val time = if (minutes >= 60) "${minutes / 60} h ${minutes % 60} min" else "$minutes min"
    return "$plays ${if (plays == 1) "play" else "plays"} · $time"
}

/** False when the phone has animations off (Developer options or Remove animations); skins then hold still. */
@Composable
fun rememberAnimationsOn(): Boolean {
    val context = LocalContext.current
    return remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
}
