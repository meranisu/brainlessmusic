package com.brainlessmusic.app.ui.navigation

object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"

    // The bottom-nav destinations.
    const val ARTISTS = "artists"
    const val SEARCH = "search"
    const val SETTINGS = "settings"
    const val HOME = "home"
    const val DOWNLOADS = "downloads"
    const val DOWNLOAD_GROUP = "downloads/{groupId}"

    // Detail screens: no bottom nav, a back arrow instead.
    const val ARTIST_DETAIL = "artist/{artistId}"
    const val ALBUM_DETAIL = "album/{albumId}"
    const val GENRES = "genres"
    const val GENRE_DETAIL = "genre/{genreId}"

    const val NOW_PLAYING = "now_playing"
    const val SETTINGS_PAGE = "settings/{page}"
    const val PLAYLIST_DETAIL = "playlist/{playlistId}"
    const val SONG_LIST = "you/{list}"
    const val TOGETHER = "together"
    const val PEOPLE = "people"
    const val FRIENDS = "friends"
    /** Your own listening in full (A228), opened from Home. */
    const val STATS = "stats"
    const val PROFILE = "people/{userId}"
    const val SETUP = "setup"
    /** Sign up with an invite code (A189-A192); `code` is filled in from an invite link, else typed. */
    const val SIGNUP = "signup?code={code}"

    const val ARG_ARTIST_ID = "artistId"
    const val ARG_ALBUM_ID = "albumId"
    const val ARG_GENRE_ID = "genreId"
    const val ARG_SETTINGS_PAGE = "page"
    const val ARG_PLAYLIST_ID = "playlistId"
    const val ARG_DOWNLOAD_GROUP = "groupId"
    const val ARG_SONG_LIST = "list"
    const val ARG_USER_ID = "userId"
    const val ARG_INVITE_CODE = "code"

    fun artistDetail(id: Int) = "artist/$id"
    fun albumDetail(id: Int) = "album/$id"
    fun genreDetail(id: Int) = "genre/$id"
    fun settingsPage(page: String) = "settings/$page"
    fun playlistDetail(id: Int) = "playlist/$id"
    fun profile(userId: Int) = "people/$userId"
    fun signup(code: String? = null) = if (code == null) "signup" else "signup?code=${android.net.Uri.encode(code)}"

    /** Group ids hold a colon (`album:5`); encoded so the route stays one segment. */
    fun downloadGroup(id: String) = "downloads/${android.net.Uri.encode(id)}"
    fun songList(list: String) = "you/$list"
}
