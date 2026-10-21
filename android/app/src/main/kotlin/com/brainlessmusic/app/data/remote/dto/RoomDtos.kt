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

/** `GET /rooms/invites`: an invite to a room (A255), answered by joining it or declining. */
data class RoomInviteDto(
    val code: String,
    val from: SocialPersonDto,
    val members: List<String>,
    val nowPlaying: RoomNowPlayingDto?,
    val expiresAt: Long,
)

data class RoomInvitesResponse(val invites: List<RoomInviteDto>)

/** `GET /rooms/invitable`: accounts that can be invited to your room. */
data class InvitablePeopleResponse(val people: List<SocialPersonDto>)

data class SendInvitesRequest(val userIds: List<Int>)

data class SendInvitesResponse(val invited: Int)
