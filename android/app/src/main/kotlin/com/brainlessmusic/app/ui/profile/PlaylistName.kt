package com.brainlessmusic.app.ui.profile

/** Longest playlist name, in characters. Matches `MAX_NAME_LENGTH` in `backend/src/routes/playlists.ts`. */
const val PLAYLIST_NAME_MAX = 100

/** The counter shows from here, so it isn't noise on every short name. */
private const val COUNTER_FROM = 80

/**
 * A playlist name as typed, checked the way the server checks it, plus a duplicate warning the server doesn't enforce.
 * The web's `checkPlaylistName` (`frontend/src/lib/playlistName.ts`) gives the same answers in the same words.
 */
data class PlaylistNameCheck(
    /** The name as it will be saved. */
    val trimmed: String,
    /** Characters, not UTF-16 units, the same count the server uses: an emoji is one. */
    val length: Int,
    /** Stops the save. */
    val error: String?,
    /** Allowed, but worth knowing: another of your playlists already has this name. */
    val warning: String?,
) {
    val showCounter: Boolean get() = length >= COUNTER_FROM
    val canSave: Boolean get() = trimmed.isNotEmpty() && error == null
}

/** [ownName] is the playlist's current name on a rename, so keeping it isn't flagged as a duplicate. */
fun checkPlaylistName(raw: String, takenNames: List<String>, ownName: String? = null): PlaylistNameCheck {
    val trimmed = raw.trim()
    val length = trimmed.codePointCount(0, trimmed.length)
    val error = when {
        trimmed.isEmpty() -> null
        trimmed.any { it.code < 0x20 || it.code == 0x7f } -> "Line breaks and tabs can't go in a name."
        length > PLAYLIST_NAME_MAX -> {
            val over = length - PLAYLIST_NAME_MAX
            "$over character${if (over == 1) "" else "s"} too long. Names fit $PLAYLIST_NAME_MAX."
        }
        else -> null
    }
    val key = trimmed.lowercase()
    val clash = if (trimmed.isEmpty() || error != null || key == ownName?.trim()?.lowercase()) {
        null
    } else {
        takenNames.firstOrNull { it.trim().lowercase() == key }
    }
    val warning = clash?.let { "You already have a playlist called “$it”. Saving makes a second one." }
    return PlaylistNameCheck(trimmed, length, error, warning)
}
