package com.brainlessmusic.app.data.remote.dto

/** `GET /me/stats`: one account's listening over a range (profile, A61). */
data class UserStatsDto(
    val range: String,
    val since: String?,
    val memberSince: String,
    val totals: StatsTotalsDto,
    /** The window just before, same length (A91). Null for all time, and from servers before 2026-10-11. */
    val previousTotals: StatsTotalsDto? = null,
    val topTracks: List<TopTrackDto>,
    val topArtists: List<TopArtistDto>,
    val topAlbums: List<TopAlbumDto>,
    val counts: ProfileCountsDto,
)

data class StatsTotalsDto(val plays: Int, val msListened: Long, val tracks: Int, val artists: Int)

/** [previousRank]: where it ranked in the window before, or null if it wasn't played then. Only read with previousTotals. */
data class TopTrackDto(val track: TrackSummaryDto, val plays: Int, val msListened: Long, val previousRank: Int? = null)

data class TopArtistDto(val id: Int, val name: String, val plays: Int, val msListened: Long, val previousRank: Int? = null)

/** `GET /me/stats/tracks/:id`: one song's numbers for this account, all time. */
data class TrackStatDto(
    val trackId: Int,
    val plays: Int,
    /** Songs cut short (A113). Missing from servers before A115, so 0 there. */
    val skips: Int = 0,
    val msListened: Long,
    val firstPlayedAt: String?,
    val lastPlayedAt: String?,
)

/** `GET /me/history`, newest play first. */
data class HistoryPageDto(val total: Int, val history: List<HistoryEntryDto>)

data class HistoryEntryDto(
    val id: Int,
    val trackId: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    // Nullable: servers before 2026-10-11 don't send them.
    val albumId: Int? = null,
    val trackNumber: Int? = null,
    val duration: Double?,
    val format: String?,
    val playedAt: String,
    val missing: Boolean = false,
    // Null until the server has measured the song, and from servers before levelling.
    val gainDb: Double? = null,
    /** Cut short before the threshold (A113). Servers before 2026-10-11 don't send it. */
    val skipped: Boolean = false,
)

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
    val gainDb: Double? = null,
)

data class PlaylistDetailDto(val id: Int, val name: String, val createdAt: String, val tracks: List<PlaylistTrackDto>)

/** `POST /playlists` and `PATCH /playlists/:id` both answer with this. */
data class PlaylistRefDto(val id: Int, val name: String)

data class PlaylistNameRequest(val name: String)

data class AddPlaylistTrackRequest(val trackId: Int)

data class ReorderPlaylistRequest(val trackIds: List<Int>)
