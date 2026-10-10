package com.brainlessmusic.app.data.remote.dto

/** `GET /me/stats`: one account's listening over a range (profile, A61). */
data class UserStatsDto(
    val range: String,
    val since: String?,
    val memberSince: String,
    val totals: StatsTotalsDto,
    val topTracks: List<TopTrackDto>,
    val topArtists: List<TopArtistDto>,
    val topAlbums: List<TopAlbumDto>,
    val counts: ProfileCountsDto,
)

data class StatsTotalsDto(val plays: Int, val msListened: Long, val tracks: Int, val artists: Int)

data class TopTrackDto(val track: TrackSummaryDto, val plays: Int, val msListened: Long)

data class TopArtistDto(val id: Int, val name: String, val plays: Int, val msListened: Long)

data class TopAlbumDto(val id: Int, val title: String, val artist: String?, val plays: Int, val msListened: Long)

data class ProfileCountsDto(val liked: Int, val lessOften: Int, val playlists: Int)

/** `GET /me/favorites`; each entry also carries `favoritedAt`, which nothing here reads. */
data class FavoritesPageDto(val total: Int, val limit: Int, val offset: Int, val favorites: List<TrackSummaryDto>)

data class FavoriteIdsDto(val trackIds: List<Int>)

data class LessOftenPageDto(val total: Int, val limit: Int, val offset: Int, val tracks: List<TrackSummaryDto>)

data class PlaylistSummaryDto(val id: Int, val name: String, val trackCount: Int, val createdAt: String)

data class PlaylistsDto(val playlists: List<PlaylistSummaryDto>)

data class PlaylistTrackDto(
    val id: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    val duration: Double?,
    val format: String?,
    val position: Int,
    // Null from a server older than these fields.
    val albumId: Int? = null,
    val trackNumber: Int? = null,
)

data class PlaylistDetailDto(val id: Int, val name: String, val createdAt: String, val tracks: List<PlaylistTrackDto>)

/** `POST /playlists` and `PATCH /playlists/:id` both answer with this. */
data class PlaylistRefDto(val id: Int, val name: String)

data class PlaylistNameRequest(val name: String)

data class AddPlaylistTrackRequest(val trackId: Int)

data class ReorderPlaylistRequest(val trackIds: List<Int>)
