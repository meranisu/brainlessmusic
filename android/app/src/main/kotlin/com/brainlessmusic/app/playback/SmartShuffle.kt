package com.brainlessmusic.app.playback

import kotlin.random.Random

/**
 * A shuffle that doesn't play the same artist twice in a row.
 *
 * The server's `POST /shuffle` (backend/src/services/shuffle.ts) does the same job by always taking
 * the largest remaining artist that isn't the one just played — which is tidy but predictable (two
 * artists strictly alternate). This picks at random, weighted by how many tracks each artist has left,
 * with one exception that keeps it correct: an artist holding more than half of what is left is
 * played now, or they would end up stranded at the tail with nothing to separate them.
 *
 * Runs on the phone rather than calling the server: it needs no round trip, works offline, has no
 * size limit, and the queue only knows artist names, not the ids the server shuffles by.
 */
object SmartShuffle {

    /**
     * A play order for tracks whose artists are [artistKeys] (index = position in the queue). [first], if
     * given, is put at the front — the track the listener tapped or is already on. A `null` key is an
     * unknown artist and is never treated as matching another unknown one.
     *
     * When one artist has more than half the tracks, adjacent repeats are unavoidable; they are kept as
     * few as the greedy pass can manage rather than being an error.
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
