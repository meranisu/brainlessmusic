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
