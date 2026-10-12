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

    const val NOW_PLAYING = "now_playing"
    const val SETTINGS_PAGE = "settings/{page}"
    const val PLAYLIST_DETAIL = "playlist/{playlistId}"
    const val SONG_LIST = "you/{list}"
    const val TOGETHER = "together"
    const val SETUP = "setup"

    const val ARG_ARTIST_ID = "artistId"
    const val ARG_ALBUM_ID = "albumId"
    const val ARG_SETTINGS_PAGE = "page"
    const val ARG_PLAYLIST_ID = "playlistId"
    const val ARG_DOWNLOAD_GROUP = "groupId"
    const val ARG_SONG_LIST = "list"

    fun artistDetail(id: Int) = "artist/$id"
    fun albumDetail(id: Int) = "album/$id"
    fun settingsPage(page: String) = "settings/$page"
    fun playlistDetail(id: Int) = "playlist/$id"

    /** Group ids hold a colon (`album:5`); encoded so the route stays one segment. */
    fun downloadGroup(id: String) = "downloads/${android.net.Uri.encode(id)}"
    fun songList(list: String) = "you/$list"
}
