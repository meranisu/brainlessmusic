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
    /** Added for the Stats screen (2026-10-20); missing from older servers. */
    val topGenres: List<ProfileGenreDto> = emptyList(),
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

data class PlaylistSummaryDto(
    val id: Int,
    val name: String,
    val trackCount: Int,
    val createdAt: String,
    // Up to four albums for the cover mosaic (A152). Null from an older server; Gson leaves a missing field null.
    val coverAlbumIds: List<Int>? = null,
    // Everyone signed in can see, play and copy it (A162). False from an older server.
    val isPublic: Boolean = false,
    // Holds the song asked about; only set when the list was fetched for one song. Null from an older server.
    val hasTrack: Boolean? = null,
    // What it is, in the owner's words (A185). Null without one, or from an older server.
    val description: String? = null,
    // Filled by rules each time it opens (A207). False from an older server.
    val isSmart: Boolean = false,
)

data class PlaylistsDto(val playlists: List<PlaylistSummaryDto>)

/** Someone else's public playlist (`GET /playlists/public`), newest public first (A166). */
data class PublicPlaylistDto(
    val id: Int,
    val name: String,
    val trackCount: Int,
    val ownerId: Int,
    val ownerName: String?,
    val coverAlbumIds: List<Int>? = null,
    val description: String? = null,
)

data class PublicPlaylistsDto(val playlists: List<PublicPlaylistDto>)

/** A playlist in search results: your own (`isOwner`) or someone's public one (A162). */
data class PlaylistSearchDto(
    val id: Int,
    val name: String,
    val trackCount: Int,
    val ownerName: String?,
    val isPublic: Boolean,
    val isOwner: Boolean,
    val coverAlbumIds: List<Int>? = null,
    val isSmart: Boolean = false,
)

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
    // SQLite UTC, when it went into the playlist, for "Recently added". Null from an older server.
    val addedAt: String? = null,
)

data class PlaylistDetailDto(
    val id: Int,
    val name: String,
    val createdAt: String,
    val tracks: List<PlaylistTrackDto>,
    // A162. Null from an older server, which only ever returned your own: read null as yours.
    val isOwner: Boolean? = null,
    val ownerName: String? = null,
    // Opens their profile from the "by" line (A172). Null from an older server.
    val ownerId: Int? = null,
    val isPublic: Boolean = false,
    val description: String? = null,
    // A207. Its songs come from [rules] each time it opens; null for an ordinary playlist or an older server.
    val isSmart: Boolean = false,
    val rules: SmartRulesDto? = null,
) {
    val isMine: Boolean get() = isOwner != false
}

/**
 * One smart playlist rule (A207). [value] is a number, text or true/false depending on the field, and absent for
 * "never played"; Gson leaves nulls out and reads numbers back as Double.
 */
data class SmartRuleDto(val field: String, val op: String, val value: Any? = null)

data class SmartRulesDto(
    val v: Int = 1,
    val match: String,
    val rules: List<SmartRuleDto>,
    val sort: String,
    val limit: Int,
)

/** `POST /playlists` with rules. */
data class CreateSmartPlaylistRequest(val name: String, val rules: SmartRulesDto)

/** `PATCH /playlists/:id` with new rules, on a smart playlist. */
data class EditSmartRulesRequest(val rules: SmartRulesDto)

data class SmartPreviewRequest(val rules: SmartRulesDto)

/** What the rules would pick right now: the count, and the first 50 songs. */
data class SmartPreviewDto(val trackCount: Int, val tracks: List<PlaylistTrackDto>)

/** `POST /playlists` and `PATCH /playlists/:id` both answer with this. */
data class PlaylistRefDto(val id: Int, val name: String, val description: String? = null)

data class PlaylistNameRequest(val name: String)

/** The name and description together (A185). Gson leaves out nulls, so an empty description is what clears it. */
data class PlaylistDetailsRequest(val name: String?, val description: String)

data class PlaylistPublicRequest(val isPublic: Boolean)

data class AddPlaylistTrackRequest(val trackId: Int)

data class ReorderPlaylistRequest(val trackIds: List<Int>)

/** Someone on the People list or in search (A170, A172). Accounts only. */
data class PersonDto(
    val id: Int,
    val name: String,
    /** Null without a picture; changes with the picture, so it goes in the URL to beat a cached old one. */
    val avatarId: String? = null,
    val bio: String? = null,
    /** SQLite UTC ("2026-10-13 09:15:00"); null if they never played anything. */
    val lastPlayedAt: String? = null,
)

data class PeopleDto(val people: List<PersonDto>)

data class ProfileArtistDto(val id: Int, val name: String)

data class ProfileGenreDto(val id: Int, val name: String, val plays: Int)

/** Liked or disliked songs on a profile: the first page and how many in all. */
data class ProfileSongsDto(val total: Int, val tracks: List<TrackSummaryDto>)

/**
 * `GET /users/:id/profile` (A167-A170): anyone's, guests included. [username] and [isAdmin] come only on your own
 * (A174). [playlists] are the public ones, or all of yours.
 */
data class ProfileDto(
    val id: Int,
    val name: String,
    val username: String? = null,
    val isAdmin: Boolean? = null,
    val isSelf: Boolean,
    val memberSince: String,
    val bio: String? = null,
    val avatarId: String? = null,
    val favoriteTrack: TrackSummaryDto? = null,
    val favoriteArtist: ProfileArtistDto? = null,
    val range: String,
    val totals: StatsTotalsDto,
    val topTracks: List<TopTrackDto>,
    val topArtists: List<TopArtistDto>,
    val topGenres: List<ProfileGenreDto>? = null,
    val playlists: List<PlaylistSummaryDto>,
    val liked: ProfileSongsDto,
    val disliked: ProfileSongsDto,
)

/** `PUT /me/profile`: a field left null is sent as null, which clears it; Gson drops nothing here (see the call). */
data class ProfileUpdateRequest(val bio: String?, val favoriteTrackId: Int?, val favoriteArtistId: Int?)

data class AvatarDto(val avatarId: String? = null)

/** `GET /me/stats/patterns`: when you listen, bucketed in the zone sent as `tz`. Plays leave out skips; time includes them. */
data class ListeningPatternsDto(
    val range: String,
    val tz: String,
    /** "day" for week, month and year; "week" (Monday first) for all time (A229). */
    val bucket: String,
    /** 24 entries, local hour 0 to 23. */
    val byHour: List<PatternBucketDto>,
    /** 7 entries, Monday first. */
    val byWeekday: List<PatternBucketDto>,
    val trend: List<TrendPointDto>,
    val streak: StreakDto,
    val busiest: BusiestDto,
)

data class PatternBucketDto(val plays: Int, val msListened: Long)

/** [date] is the local day, or the Monday of the week, as `YYYY-MM-DD`. */
data class TrendPointDto(val date: String, val plays: Int, val msListened: Long, val skips: Int)

/** Days in a row with a play, over all time whatever the range. */
data class StreakDto(val current: Int, val longest: Int, val longestEndedOn: String?)

data class BusiestDto(val hour: Int?, val weekday: Int?, val day: BusiestDayDto?)

data class BusiestDayDto(val date: String, val plays: Int)

/** Someone in friends' now playing or the feed (A239): display name only. */
data class SocialPersonDto(val id: Int, val name: String, val avatarId: String? = null)

/** `GET /social/now-playing`. [since] is ISO, when they started this song. */
data class FriendListeningDto(
    val person: SocialPersonDto,
    val track: TrackSummaryDto,
    val positionSeconds: Double,
    val since: String,
    /** Their Listen together room, so the row can offer Join (A255). Null when not in one, and from older servers. */
    val roomCode: String? = null,
)

data class NowPlayingDto(val listening: List<FriendListeningDto>)

data class FeedPlaylistDto(val id: Int, val name: String, val trackCount: Int)

/** One feed line: [kind] is `play`, `like` (with [track]) or `playlist` (with [playlist]). [at] is SQLite UTC. */
data class FeedItemDto(
    val kind: String,
    val at: String,
    val person: SocialPersonDto,
    val track: TrackSummaryDto? = null,
    val playlist: FeedPlaylistDto? = null,
)

/** `GET /social/feed`. Pass [nextBefore] back untouched as `before` for older; null at the end. */
data class FeedPageDto(val items: List<FeedItemDto>, val nextBefore: String? = null)

data class ActivityVisibilityRequest(val hidden: Boolean)
