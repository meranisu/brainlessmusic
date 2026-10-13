package com.brainlessmusic.app.rooms

/**
 * "Listen together" (A102): the room as the server sends it. Field names match the JSON from
 * `backend/src/services/rooms.ts` (`snapshot`). Spec: `.docs/specs/room-sync.md`.
 */
data class RoomEntry(
    val entryId: Int,
    val trackId: Int,
    val title: String,
    val artist: String?,
    val albumId: Int?,
    val durationMs: Long,
    val addedBy: Int,
    /** Null until measured, and from servers before levelling. */
    val gainDb: Double? = null,
)

data class RoomMember(
    val userId: Int,
    val name: String,
    /** `account` or `guest`. */
    val kind: String,
    val connected: Boolean,
    /** Their profile picture; null without one, for guests, and from a server older than it. */
    val avatarId: String? = null,
)

/** While [playing], the song is at `positionMs + (serverNow - anchorMs)`; before [anchorMs] it hasn't started. */
data class RoomPlayback(val playing: Boolean, val positionMs: Long, val anchorMs: Long)

data class RoomState(
    val code: String,
    val version: Int,
    val hostUserId: Int,
    val members: List<RoomMember>,
    val queue: List<RoomEntry>,
    val current: Int,
    val playback: RoomPlayback,
) {
    val currentEntry: RoomEntry? get() = queue.getOrNull(current)

    /** Where the song is now on the server clock; negative before a new song's start time. */
    fun expectedPositionMs(serverNow: Long): Long =
        if (playback.playing) playback.positionMs + (serverNow - playback.anchorMs) else playback.positionMs
}

/** What the server is asked to do. The `entryId` names the song the sender saw, so two skips at once move one song. */
sealed class RoomCommand(val op: String) {
    data object Play : RoomCommand("play")
    data object Pause : RoomCommand("pause")
    data class Seek(val entryId: Int, val positionMs: Long) : RoomCommand("seek")
    data class Next(val entryId: Int) : RoomCommand("next")
    data class Previous(val entryId: Int) : RoomCommand("previous")
    data class Jump(val entryId: Int) : RoomCommand("jump")
    data class Add(val trackIds: List<Int>, val after: Int?) : RoomCommand("add")
    data class Remove(val entryId: Int) : RoomCommand("remove")
    data class Move(val entryId: Int, val toIndex: Int) : RoomCommand("move")
    data object End : RoomCommand("end")
    data class Kick(val userId: Int) : RoomCommand("kick")
}

/** `LIVE`: in step. `CONNECTING`: first connect or a reconnect after a drop; the music carries on meanwhile. */
enum class RoomConnection { CONNECTING, LIVE }

/** Why the room let go of us. `left` is our own leave; `unknown` covers a reason this build doesn't know. */
enum class RoomClosedReason(val wire: String, val message: String?) {
    ENDED("ended", "The room was ended."),
    KICKED("kicked", "The host took you out of the room."),
    NOT_FOUND("not-found", "That room is gone. The music carries on here."),
    REPLACED("replaced", "You joined from somewhere else, so this phone left the room."),
    LEFT("left", null),
    FULL("full", "That room is full (8 people)."),
    UNAUTHORIZED("unauthorized", "Your sign-in ran out, so you left the room."),
    UNKNOWN("unknown", "You left the room.");

    companion object {
        fun from(wire: String?): RoomClosedReason = entries.firstOrNull { it.wire == wire } ?: UNKNOWN
    }
}

/** Rejections worth telling someone about. `stale` (two people pressed skip at once) is normal and stays quiet. */
fun rejectionMessage(reason: String): String? = when (reason) {
    "unplayable" -> "That song can't be played in a room."
    "queue-full" -> "The room queue is full (500 songs)."
    "host-only" -> "Only the host can do that."
    "end-of-queue" -> "That's the last song in the queue."
    else -> null
}
