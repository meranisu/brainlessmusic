package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.data.repository.ConnectionException
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import com.brainlessmusic.app.data.repository.toMessage
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.StatsRange

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

/** Parses SQLite's `yyyy-MM-dd HH:mm:ss` (UTC) as a [LocalDateTime]; null when it doesn't fit. */
fun parseSqliteTime(text: String): LocalDateTime? =
    runCatching { LocalDateTime.parse(text.take(19).replace(' ', 'T')) }.getOrNull()

/**
 * `2026-09-03 10:12:44` (SQLite `datetime('now')`, so UTC) to `3 Sep 2026` on this phone's calendar: a play at 7 am in
 * Malaysia is still 23:00 the day before in UTC. Anything unexpected is shown as it came.
 */
fun formatDay(sqlite: String): String {
    val time = parseSqliteTime(sqlite) ?: return sqlite
    return time.atZone(ZoneOffset.UTC)
        .withZoneSameInstant(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH))
}

fun Throwable.loadMessage(): String = (this as? ConnectionException)?.error?.toMessage() ?: "Something went wrong."

/**
 * The player card's big listening number and its label: minutes under an hour, then hours, with one decimal below ten
 * so "1.5 hours" doesn't read as 1. The exact time is in each song's row.
 */
fun listenedHeadline(ms: Long): Pair<String, String> {
    val minutes = ms / 60_000
    if (minutes < 60) return minutes.toString() to if (minutes == 1L) "min listened" else "mins listened"
    val hours = ms / 3_600_000.0
    val value = if (hours < 10) "%.1f".format(Locale.ENGLISH, hours).removeSuffix(".0") else hours.toLong().toString()
    return value to if (value == "1") "hour listened" else "hours listened"
}

/**
 * How this range's listening time compares with the window before it (A91), or null when there is nothing to compare:
 * all time, an old server, or nothing played back then.
 */
fun listenedDelta(stats: UserStatsDto, range: StatsRange): String? {
    val previous = stats.previousTotals ?: return null
    if (previous.plays == 0) return null
    val before = when (range) {
        StatsRange.WEEK -> "the 7 days before"
        StatsRange.MONTH -> "the 30 days before"
        StatsRange.YEAR -> "the year before"
        StatsRange.ALL -> return null
    }
    val diff = stats.totals.msListened - previous.msListened
    return when {
        kotlin.math.abs(diff) < 60_000 -> "About the same as $before"
        diff > 0 -> "${formatListened(diff)} more than $before"
        else -> "${formatListened(-diff)} less than $before"
    }
}
