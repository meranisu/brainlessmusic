package com.brainlessmusic.app.ui.common

/** `null`/negative durations (untagged files, see backend/src/services/scanner.ts) render as "--:--" rather than "0:00", which would read as a real zero-length track. */
fun formatDuration(seconds: Double?): String {
    if (seconds == null || seconds < 0) return "--:--"
    val total = seconds.toInt()
    val minutes = total / 60
    val secs = total % 60
    return "%d:%02d".format(minutes, secs)
}
