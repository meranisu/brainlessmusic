package com.brainlessmusic.app.playback

import kotlin.random.Random

/** Album shuffle for a queue already on the phone: its albums in random order, each in track order. */
object AlbumShuffle {

    /**
     * Play order for a queue (index = queue position), given each track's album ([albumIds], `null` = an album of its
     * own) and [trackNumbers]. With [first], that track leads and the rest of its album follows it; the album's tracks
     * before it go last.
     */
    fun order(albumIds: List<Int?>, trackNumbers: List<Int?>, first: Int? = null, random: Random = Random.Default): IntArray {
        val n = albumIds.size
        fun albumOf(index: Int): Any = albumIds[index] ?: Single(index)

        val albums = (0 until n).groupBy(::albumOf).mapValues { (_, indices) ->
            indices.sortedWith(compareBy<Int>({ trackNumbers[it] ?: Int.MAX_VALUE }, { it }))
        }
        val firstAlbum = first?.takeIf { it in 0 until n }?.let(::albumOf)
        val lead = firstAlbum?.let { albums.getValue(it) }.orEmpty()
        val split = lead.indexOf(first)
        val others = albums.filterKeys { it != firstAlbum }.values.shuffled(random).flatten()
        return (lead.drop(split.coerceAtLeast(0)) + others + lead.take(split.coerceAtLeast(0))).toIntArray()
    }

    private data class Single(val index: Int)
}
