package com.brainlessmusic.app.rooms

/**
 * The server's clock from ping round trips, the way NTP does it (spec, "Clock sync"): the server's time was `ts` halfway
 * through the round trip. A reply handled late inflates its round trip, so the offset is the median of the
 * [BEST_SAMPLES] quickest samples from the last [WINDOW_MS]. Times are `SystemClock.elapsedRealtime()`, so the phone's
 * own clock changing mid-session doesn't matter. Pure, for tests.
 */
class ClockEstimator {
    private data class Sample(val rtt: Long, val offset: Long, val at: Long)

    private var samples = emptyList<Sample>()

    /** `serverClock - localClock`, or null before the first sample. */
    var offset: Long? = null
        private set

    fun reset() {
        samples = emptyList()
    }

    fun add(t0: Long, serverTs: Long, t1: Long) {
        val sample = Sample(rtt = t1 - t0, offset = serverTs - (t0 + t1) / 2, at = t1)
        samples = samples.filter { t1 - it.at < WINDOW_MS } + sample
        val best = samples.sortedBy { it.rtt }.take(BEST_SAMPLES).map { it.offset }.sorted()
        offset = best[best.size / 2]
    }

    companion object {
        const val WINDOW_MS = 120_000L
        const val BEST_SAMPLES = 3
    }
}
