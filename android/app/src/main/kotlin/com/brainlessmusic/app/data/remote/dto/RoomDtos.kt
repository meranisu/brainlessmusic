package com.brainlessmusic.app.data.remote.dto

/** `POST /rooms`: a new room starts from the creator's queue and position (`backend/src/routes/rooms.ts`). */
data class CreateRoomRequest(
    val trackIds: List<Int>,
    val current: Int,
    val positionMs: Long,
    val playing: Boolean,
)

data class RoomCodeResponse(val code: String?)

data class RoomNowPlayingDto(val title: String, val artist: String?)

/** `GET /rooms/:code`, for the join screen; 404 when there's no such room. */
data class RoomLookupDto(
    val code: String,
    val members: List<String>,
    val nowPlaying: RoomNowPlayingDto?,
)
