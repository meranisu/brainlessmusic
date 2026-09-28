package com.brainlessmusic.app.data.remote.dto

// Shapes confirmed by reading backend/src/db/browse.ts and the routes that
// serve it — not the (older) phased-plan doc.

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

/** The lean shape browse/search endpoints return — not [com.brainlessmusic.app.data.remote.dto.AlbumTrackDto]'s even leaner one. */
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

/** `GET /me/playback-state` — `state` is `null` (not a 404) when nothing has been saved yet. */
data class PlaybackStateResponse(
    val state: PlaybackStateDto?,
)

/** The queue arrives hydrated and already filtered of unplayable tracks, with `queueIndex` adjusted to match. */
data class PlaybackStateDto(
    val queue: List<TrackSummaryDto>,
    val queueIndex: Int,
    val positionSeconds: Double,
)

/** `PUT /me/playback-state` — ids only; the server rejects (rather than clamps) an out-of-range index. */
data class SavePlaybackStateRequest(
    val queue: List<Int>,
    val queueIndex: Int,
    val positionSeconds: Double,
)

/** `GET /tracks` — the whole library, paged. */
data class TracksPageDto(
    val total: Int,
    val limit: Int,
    val offset: Int,
    val tracks: List<TrackSummaryDto>,
)

/** `GET /albums` — every album, paged. */
data class AlbumsPageDto(
    val total: Int,
    val limit: Int,
    val offset: Int,
    val albums: List<AlbumSummaryDto>,
)

/** `GET /browse/letters` — where each letter starts in a scope's default listing (backend/src/db/letterIndex.ts). */
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
