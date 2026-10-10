package com.brainlessmusic.app.playback

import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository

/** Where a queue gets more tracks once its first batch runs low, so a 200-song start keeps going to the library's end. */
sealed interface QueueSource {
    /** The songs list in title order, continuing from row [nextOffset]. Ends with the library, or with [search]'s matches. */
    data class Songs(val nextOffset: Int, val search: String? = null) : QueueSource

    /**
     * The whole library in the order fixed by [seed]; when a pass ends a fresh seed starts the next, so it never stops.
     * [skipTrackId] is the song the queue started from, left out of this pass so it does not come round again.
     */
    data class Shuffled(val seed: Int, val nextOffset: Int, val skipTrackId: Int? = null) : QueueSource
}

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
