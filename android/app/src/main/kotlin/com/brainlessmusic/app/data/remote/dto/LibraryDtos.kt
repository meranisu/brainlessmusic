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
    /** Albums they are the album artist of. */
    val albums: List<AlbumSummaryDto>,
    /** Other artists' albums with a song of theirs (A149). Null from a server before v0.4; Gson leaves it null. */
    val appearsOn: List<AlbumSummaryDto>? = null,
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
    /** The song's own artist; on a compilation it differs from the album's. Null from a server before v0.4. */
    val artistId: Int? = null,
    val artistName: String? = null,
    val trackNumber: Int?,
    /** Null when untagged (played as disc 1), and from a server before v0.4. */
    val discNumber: Int? = null,
    val duration: Double?,
    val format: String?,
    // Null until the server has measured the song, and from servers before levelling.
    val gainDb: Double? = null,
)

/** `GET /tracks/:id`: the file's tags and what the server knows about it. [bitrate] is in bits per second. */
data class TrackDetailDto(
    val id: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    val albumId: Int?,
    /** For "Go to artist"; null from servers before 2026-10-11 or with no artist tag. */
    val artistId: Int? = null,
    val trackNumber: Int?,
    val duration: Double?,
    val format: String?,
    val bitrate: Int?,
    val sampleRate: Int?,
    val fileSize: Long?,
    val playCount: Int,
    val dateAdded: String?,
    val lastPlayedAt: String?,
)

data class AlbumDetailDto(
    val id: Int,
    /** The id that was asked for, when a rescan merged that album into this one (v0.4). */
    val mergedFrom: Int? = null,
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
    // Nullable: servers before 2026-10-11 don't send them, and Gson leaves a missing field null.
    val albumId: Int? = null,
    val trackNumber: Int? = null,
    val duration: Double?,
    val format: String?,
    val hidden: Boolean,
    val notRecommended: Boolean,
    val missing: Boolean,
    val hasStreamError: Boolean,
    val playCount: Int,
    val dateAdded: String,
    // Null until the server has measured the song, and from servers before levelling.
    val gainDb: Double? = null,
    // Only on liked songs (`GET /me/favorites`): when it was liked, in the server's UTC "YYYY-MM-DD HH:MM:SS".
    val favoritedAt: String? = null,
)

data class SearchResultsDto(
    val artists: List<ArtistSummaryDto>,
    val albums: List<AlbumSummaryDto>,
    val tracks: List<TrackSummaryDto>,
    // Your own and other people's public ones (A162). Null from an older server.
    val playlists: List<PlaylistSearchDto>? = null,
    // People whose name matches, to open their profile (A172). Null from an older server.
    val people: List<PersonDto>? = null,
    // Whether each kind has more than it shows, for "See all". Null from an older server.
    val hasMore: SearchHasMoreDto? = null,
    // The one result shown big, with Play. Null when nothing matched, or from an older server.
    val top: SearchTopDto? = null,
    // "Did you mean …?" when nothing matched and a name is close.
    val suggestion: String? = null,
)

data class SearchHasMoreDto(
    val artists: Boolean = false,
    val albums: Boolean = false,
    val tracks: Boolean = false,
    val playlists: Boolean = false,
    val people: Boolean = false,
)

/** [kind] is `artist`, `album` or `track`; [id] is one of the results of that kind. */
data class SearchTopDto(val kind: String, val id: Int)

/** One kind's "See all" page (`GET /search?type=`). */
data class SearchPageDto<T>(val items: List<T>, val hasMore: Boolean)

/** 128 peaks, 0-255, absolute (A8: scaling per track happens where they are drawn). */
data class WaveformDto(val peaks: List<Int>)

data class ScrobbleRequest(
    val msPlayed: Long,
    /** Only for a play made offline and sent later (A87); Gson leaves it out when null. */
    val playedAt: String? = null,
    /** The app's own id for this play (C10), the same on every send, so a resend is counted once. */
    val clientPlayId: String? = null,
    /** True for a song cut short before the threshold (A113); left out (null) for a play. */
    val skipped: Boolean? = null,
)

/** `POST /tracks/:id/scrobble` answers 201 with the updated counters; the client only needs to know it landed. */
data class ScrobbleResponse(
    /** The play's id, for [FinishPlayRequest]; missing from servers older than A62. */
    val playId: Int?,
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

/** `GET /mix/radio`: songs like [seedTrackId] (backend/src/routes/mix.ts). Empty when the radio has run dry. */
data class RadioPageDto(
    val seedTrackId: Int,
    val seed: Int,
    val tracks: List<TrackSummaryDto>,
)

/** One of `GET /mix/daily`'s mixes: named after the genre it comes from, the same all day (A236). */
data class DailyMixDto(
    val id: Int,
    val name: String,
    val tracks: List<TrackSummaryDto>,
)

data class DailyMixesDto(val mixes: List<DailyMixDto>)

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

/** `PATCH /me/history/:id`: how long the play really lasted (A62). */
data class FinishPlayRequest(val msPlayed: Long)

data class GenreSummaryDto(
    val id: Int,
    val name: String,
    val trackCount: Int,
    val albumCount: Int,
)

data class GenresDto(val genres: List<GenreSummaryDto>)

data class GenreDetailDto(
    val id: Int,
    val name: String,
    val trackCount: Int,
    val albumCount: Int,
    val albums: List<AlbumSummaryDto>,
)
