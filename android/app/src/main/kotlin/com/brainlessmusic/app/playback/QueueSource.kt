package com.brainlessmusic.app.playback

import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.AlbumTrackDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository

/** Where a queue gets more tracks once its first batch runs low, so a 200-song start keeps going to the library's end. */
sealed interface QueueSource {
    /** The songs list in title order, continuing from row [nextOffset]. Ends with the library, or with [search]'s matches. */
    data class Songs(val nextOffset: Int, val search: String? = null) : QueueSource

    /**
     * The whole library in the order fixed by [seed] and [mode]; when a pass ends a fresh seed starts the next, so it
     * never stops. [skipTrackId] is the song the queue started from, left out of this pass so it does not come round
     * again. [asOf] (Unix seconds) is when the pass began, so Rediscover's order holds still while it plays.
     * [albumRest], set in Albums mode, is the album the queue started in: the rest of it comes first, then the pass.
     */
    data class Shuffled(
        val seed: Int,
        val nextOffset: Int,
        val skipTrackId: Int? = null,
        val mode: ShuffleMode = ShuffleMode.SHUFFLE,
        val asOf: Long = System.currentTimeMillis() / 1000,
        val albumRest: AlbumRest? = null,
    ) : QueueSource {
        companion object {
            /** A new pass in [mode], with a fresh seed. */
            fun fresh(mode: ShuffleMode, skipTrackId: Int? = null) =
                Shuffled(kotlin.random.Random.nextInt(Int.MAX_VALUE), 0, skipTrackId, mode)
        }
    }
}

/** The tracks of album [albumId] after [afterTrackId], in the album's own order. */
data class AlbumRest(val albumId: Int, val afterTrackId: Int)

/** The unfiltered songs list in title order: shuffling a batch of it only mixes songs that share a first letter. */
val QueueSource?.isLibraryInTitleOrder: Boolean get() = this is QueueSource.Songs && search == null

fun LibraryRepository.queueItem(track: TrackSummaryDto) = QueueItem(
    trackId = track.id,
    title = track.title,
    artist = track.artist,
    album = track.album,
    durationSec = track.duration,
    coverUrl = trackCoverUrl(track.id),
    format = track.format,
    albumId = track.albumId,
    trackNumber = track.trackNumber,
)

/** An album's tracks carry no artist/album/cover of their own; the album supplies them. */
fun LibraryRepository.queueItem(album: AlbumDetailDto, track: AlbumTrackDto) = QueueItem(
    trackId = track.id,
    title = track.title,
    artist = album.artistName,
    album = album.title,
    durationSec = track.duration,
    coverUrl = albumCoverUrl(album.id),
    format = track.format,
    albumId = album.id,
    trackNumber = track.trackNumber,
)
