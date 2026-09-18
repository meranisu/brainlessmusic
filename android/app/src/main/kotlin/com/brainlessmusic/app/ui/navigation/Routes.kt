package com.brainlessmusic.app.ui.navigation

object Routes {
    const val SPLASH = "splash"
    const val SERVER_CONFIG = "server_config"

    // The two bottom-nav destinations.
    const val ARTISTS = "artists"
    const val SEARCH = "search"

    // Pushed on top of either — no bottom nav on these, a back arrow instead.
    const val ARTIST_DETAIL = "artist/{artistId}"
    const val ALBUM_DETAIL = "album/{albumId}"

    const val ARG_ARTIST_ID = "artistId"
    const val ARG_ALBUM_ID = "albumId"

    fun artistDetail(id: Int) = "artist/$id"
    fun albumDetail(id: Int) = "album/$id"
}
