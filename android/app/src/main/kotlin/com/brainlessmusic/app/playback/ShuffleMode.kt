package com.brainlessmusic.app.playback

/** The shuffle button's settings, in the order it cycles through them (A77). */
enum class ShuffleMode(val apiName: String?) {
    OFF(null),

    /** Plain random, with the same artist kept apart. */
    SHUFFLE("shuffle"),

    /** Songs not played for a long time, or ever, come up sooner. Only the whole library knows that; a fixed queue shuffles. */
    REDISCOVER("rediscover"),

    /** Random albums, each played through in track order. */
    ALBUMS("albums");

    fun next(): ShuffleMode = entries[(ordinal + 1) % entries.size]
}
