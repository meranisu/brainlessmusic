package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.data.repository.ConnectionException
import com.brainlessmusic.app.data.repository.toMessage

/** "3 h 20 min", "45 min", "under a minute": listening time at a glance, not to the second. */
fun formatListened(ms: Long): String {
    val minutes = ms / 60_000
    if (minutes < 1) return if (ms > 0) "under a minute" else "0 min"
    val hours = minutes / 60
    val rest = minutes % 60
    return when {
        hours == 0L -> "$minutes min"
        rest == 0L -> "$hours h"
        else -> "$hours h $rest min"
    }
}

fun plays(count: Int): String = if (count == 1) "1 play" else "$count plays"

/** `2026-09-03 10:12:44` (SQLite) to `September 2026`; anything unexpected is shown as it came. */
fun formatMonthYear(sqlite: String): String {
    val parts = sqlite.take(7).split("-")
    val month = parts.getOrNull(1)?.toIntOrNull()?.takeIf { it in 1..12 } ?: return sqlite
    val names = listOf(
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    )
    return "${names[month - 1]} ${parts[0]}"
}

fun Throwable.loadMessage(): String = (this as? ConnectionException)?.error?.toMessage() ?: "Something went wrong."
