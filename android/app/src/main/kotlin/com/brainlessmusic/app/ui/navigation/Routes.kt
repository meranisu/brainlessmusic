package com.brainlessmusic.app.ui.navigation

object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"

    // The bottom-nav destinations.
    const val ARTISTS = "artists"
    const val SEARCH = "search"
    const val SETTINGS = "settings"

    // Detail screens: no bottom nav, a back arrow instead.
    const val ARTIST_DETAIL = "artist/{artistId}"
    const val ALBUM_DETAIL = "album/{albumId}"

    const val NOW_PLAYING = "now_playing"

    const val ARG_ARTIST_ID = "artistId"
    const val ARG_ALBUM_ID = "albumId"

    fun artistDetail(id: Int) = "artist/$id"
    fun albumDetail(id: Int) = "album/$id"
}
