package com.brainlessmusic.app.playback

import kotlin.random.Random

/**
 * A shuffle that avoids the same artist twice in a row: random, weighted by tracks left, except an artist holding
 * over half of what's left goes now. Runs on the phone because the queue knows artist names, not the server's ids.
 */
object SmartShuffle {

    /**
     * Play order for [artistKeys] (index = queue position), with [first] at the front. A `null` key never matches
     * another; when one artist has over half the tracks, repeats are kept as few as possible.
     */
    fun order(artistKeys: List<String?>, first: Int? = null, random: Random = Random.Default): IntArray {
        val n = artistKeys.size
        val result = IntArray(n)
        var filled = 0

        // Each track's group. Unknown artists get a key of their own so they never constrain each other.
        fun groupOf(index: Int): Any = artistKeys[index] ?: Unknown(index)

        val groups = LinkedHashMap<Any, ArrayDeque<Int>>()
        for (i in (0 until n).filter { it != first }.shuffled(random)) {
            groups.getOrPut(groupOf(i)) { ArrayDeque() }.addLast(i)
        }

        var last: Any? = null
        if (first != null && first in 0 until n) {
            result[filled++] = first
            last = groupOf(first)
        }

        while (filled < n) {
            val remaining = n - filled
            var pick: Any? = null
            var totalCandidates = 0
            for ((key, indices) in groups) {
                if (indices.isEmpty() || key == last) continue
                totalCandidates += indices.size
                // More than half of what is left: this artist must go now or never get separated.
                if (indices.size * 2 > remaining) pick = key
            }
            if (pick == null && totalCandidates > 0) {
                var roll = random.nextInt(totalCandidates)
                for ((key, indices) in groups) {
                    if (indices.isEmpty() || key == last) continue
                    if (roll < indices.size) {
                        pick = key
                        break
                    }
                    roll -= indices.size
                }
            }
            // Only the artist just played is left: nothing to separate them with.
            val chosen = pick ?: last!!
            result[filled++] = groups.getValue(chosen).removeFirst()
            last = chosen
        }
        return result
    }

    private data class Unknown(val index: Int)
}
