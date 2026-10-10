package com.brainlessmusic.app.data.local

/** What happens between songs (A71). One choice of three, so a crossfade and a fade-out-then-in never both apply. */
enum class BetweenSongs(val label: String, val detail: String) {
    GAPLESS("Gapless", "One song straight into the next"),
    CROSSFADE("Crossfade", "The next song fades in over the end"),
    FADE_OUT_IN("Fade out, then in", "A soft dip between songs"),
}

/** Fade lengths offered, in seconds, for crossfade and fade-out-then-in alike. */
val FADE_LENGTHS = listOf(3, 6, 9, 12)

/** A71 and A72, same meaning and defaults as the web's `lib/transitions.ts`. Per phone. */
data class TransitionPrefs(
    val betweenSongs: BetweenSongs = BetweenSongs.GAPLESS,
    val fadeSeconds: Int = 6,
    /** A short ramp on pause, play and skip, so stopping never clicks. */
    val fadeOnPause: Boolean = true,
    /** No fade between back-to-back tracks of one album, so live albums and mixes stay seamless (A72). */
    val keepAlbumsGapless: Boolean = true,
)

/** True when [nextAlbumId]/[nextTrack] directly follows on the same album. */
fun isNextOnAlbum(albumId: Int?, trackNumber: Int?, nextAlbumId: Int?, nextTrack: Int?): Boolean =
    albumId != null && albumId == nextAlbumId && trackNumber != null && nextTrack == trackNumber + 1
