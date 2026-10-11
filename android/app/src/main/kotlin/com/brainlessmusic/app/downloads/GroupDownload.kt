package com.brainlessmusic.app.downloads

/** An album's or playlist's download state, summed over its songs. */
sealed interface GroupDownload {
    data object None : GroupDownload
    data class Running(val percent: Int) : GroupDownload
    data object Done : GroupDownload
    data object Failed : GroupDownload
}

fun groupDownload(trackIds: List<Int>, downloads: Map<Int, TrackDownload>): GroupDownload {
    if (trackIds.isEmpty()) return GroupDownload.None
    val each = trackIds.map { downloads[it] }
    return when {
        each.all { it?.isDone == true } -> GroupDownload.Done
        each.any { it?.isActive == true } ->
            GroupDownload.Running((each.sumOf { (it?.percent ?: 0f).toDouble() } / each.size).toInt())
        each.any { it?.isFailed == true } -> GroupDownload.Failed
        // Some songs on the phone and the rest never asked for: the button offers the rest.
        else -> GroupDownload.None
    }
}
