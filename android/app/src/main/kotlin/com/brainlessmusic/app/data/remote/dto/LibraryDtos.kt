package com.brainlessmusic.app.data.remote.dto

// Shapes from backend/src/db/browse.ts and its routes, not the older phased-plan doc.

data class ArtistSummaryDto(
    val id: Int,
    val name: String,
    val trackCount: Int,
    val albumCount: Int,
)

data class ArtistDetailDto(
    val id: Int,
    val name: String,
    val trackCount: Int,
    val albumCount: Int,
    val albums: List<AlbumSummaryDto>,
)

data class ArtistsPageDto(
    val total: Int,
    val limit: Int,
    val offset: Int,
    val artists: List<ArtistSummaryDto>,
)

data class AlbumSummaryDto(
    val id: Int,
    val title: String,
    val artistId: Int?,
    val artistName: String?,
    val year: Int?,
    val trackCount: Int,
)

data class AlbumTrackDto(
    val id: Int,
    val title: String,
    val trackNumber: Int?,
    val duration: Double?,
    val format: String?,
)

data class AlbumDetailDto(
    val id: Int,
    val title: String,
    val artistId: Int?,
    val artistName: String?,
    val year: Int?,
    val tracks: List<AlbumTrackDto>,
)

/** The lean track shape browse and search return. */
data class TrackSummaryDto(
    val id: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    val duration: Double?,
    val format: String?,
    val hidden: Boolean,
    val notRecommended: Boolean,
    val missing: Boolean,
    val hasStreamError: Boolean,
    val playCount: Int,
    val dateAdded: String,
)

data class SearchResultsDto(
    val artists: List<ArtistSummaryDto>,
    val albums: List<AlbumSummaryDto>,
    val tracks: List<TrackSummaryDto>,
)

data class ScrobbleRequest(
    val msPlayed: Long,
)

/** `POST /tracks/:id/scrobble` answers 201 with the updated counters; the client only needs to know it landed. */
data class ScrobbleResponse(
    val trackId: Int,
    val playCount: Int,
)

/** `GET /me/playback-state`. `state` is `null`, not a 404, when nothing is saved. */
data class PlaybackStateResponse(
    val state: PlaybackStateDto?,
)

/** The queue arrives hydrated and already filtered of unplayable tracks, with `queueIndex` adjusted to match. */
data class PlaybackStateDto(
    val queue: List<TrackSummaryDto>,
    val queueIndex: Int,
    val positionSeconds: Double,
)

/** `PUT /me/playback-state`. The server rejects an out-of-range index rather than clamping it. */
data class SavePlaybackStateRequest(
    val queue: List<Int>,
    val queueIndex: Int,
    val positionSeconds: Double,
    /** Not saved; tells the control center a pause means "stopped listening". */
    val playing: Boolean,
)

/** `GET /tracks`, paged. */
data class TracksPageDto(
    val total: Int,
    val limit: Int,
    val offset: Int,
    val tracks: List<TrackSummaryDto>,
)

/** `GET /albums`, paged. */
data class AlbumsPageDto(
    val total: Int,
    val limit: Int,
    val offset: Int,
    val albums: List<AlbumSummaryDto>,
)

/** `GET /browse/shuffled`: one page of the library in the order fixed by [seed]. */
data class ShuffledTracksPageDto(
    val seed: Int,
    val total: Int,
    val limit: Int,
    val offset: Int,
    val tracks: List<TrackSummaryDto>,
)

/** `GET /browse/letters`: where each letter starts in a listing (backend/src/db/letterIndex.ts). */
data class LetterIndexDto(
    val scope: String,
    val total: Int,
    val letters: List<LetterEntryDto>,
)

/** [letter] is `#`, `A`–`Z` or `…`; [offset] is the bucket's first row (or where it would be, if [count] is 0). */
data class LetterEntryDto(
    val letter: String,
    val offset: Int,
    val count: Int,
)
