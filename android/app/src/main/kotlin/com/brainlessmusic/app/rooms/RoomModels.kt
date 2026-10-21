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
    /** Who added it, kept on the entry so it still shows after they leave (A256). Null from an older server. */
    val addedByName: String? = null,
    val addedByAvatarId: String? = null,
)

/**
 * The host's choices for the room (A253). The host is never held back; `host` means only the host. `editQueue` is
 * moving or removing other people's songs; your own you always can. Gson leaves a missing field null, hence the nulls.
 */
data class RoomSettings(
    val shuffle: Boolean = false,
    /** `off`, `all` or `one`. */
    val repeat: String? = "off",
    val turns: Boolean = false,
    /** `vote`, `everyone` or `host`. */
    val skip: String? = "vote",
    val playback: String? = "everyone",
    val add: String? = "everyone",
    val editQueue: String? = "everyone",
    val invite: String? = "everyone",
)

/** Votes to skip the song with [entryId]: it skips at [needed] (A254). */
data class RoomSkipVote(val entryId: Int, val votes: List<Int>, val needed: Int)

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
    /** Null from a server older than them. */
    val settings: RoomSettings? = null,
    val skipVote: RoomSkipVote? = null,
) {
    val currentEntry: RoomEntry? get() = queue.getOrNull(current)

    /** Whether [you] may do something the settings can limit (`playback`, `add`, `editQueue`, `invite`). */
    fun allows(you: Int?, area: String): Boolean {
        if (hostUserId == you || settings == null) return true
        val rule = when (area) {
            "playback" -> settings.playback
            "add" -> settings.add
            "editQueue" -> settings.editQueue
            "invite" -> settings.invite
            else -> "everyone"
        }
        return rule != "host"
    }

    /** Your own songs you can always move or remove; other people's as the settings say. */
    fun canEdit(entry: RoomEntry, you: Int?): Boolean = entry.addedBy == you || allows(you, "editQueue")

    /** True when [you]'s Next is a vote rather than a skip (A254). */
    fun nextIsVote(you: Int?): Boolean =
        hostUserId != you && currentEntry?.addedBy != you && (settings?.skip ?: "everyone") == "vote"

    /** The Next button's label: "Vote to skip (1 of 2)" while a vote is going. */
    fun nextLabel(you: Int?): String {
        val skip = settings?.skip ?: "everyone"
        if (hostUserId == you || skip == "everyone" || currentEntry?.addedBy == you) return "Next"
        if (skip == "host") return "Only the host can skip"
        val vote = skipVote?.takeIf { it.entryId == currentEntry?.entryId } ?: return "Vote to skip"
        val voted = you != null && you in vote.votes
        return "${if (voted) "You voted to skip" else "Vote to skip"} (${vote.votes.size} of ${vote.needed})"
    }

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
    /** Host only (A253). Values are `Boolean` or `String`, by setting name. */
    data class Settings(val changes: Map<String, Any>) : RoomCommand("settings")
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
    "not-allowed" -> "The host has kept that for themselves in this room."
    "turns-on" -> "Take turns sets the order, so songs can't be moved while it's on."
    "bad-settings" -> "That setting didn't save. Try again."
    else -> null
}

/** A new vote to skip, said once to everyone in the room: "bob voted to skip (1 of 2)" (A254). */
fun voteMessage(before: RoomState?, after: RoomState, you: Int?): String? {
    val vote = after.skipVote ?: return null
    if (before == null) return null
    val earlier = before.skipVote?.takeIf { it.entryId == vote.entryId }?.votes.orEmpty()
    val voter = vote.votes.firstOrNull { it !in earlier } ?: return null
    val name = if (voter == you) "You" else after.members.firstOrNull { it.userId == voter }?.name ?: "Someone"
    return "$name voted to skip (${vote.votes.size} of ${vote.needed})."
}
