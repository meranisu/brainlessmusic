package com.brainlessmusic.app.data.remote

import com.brainlessmusic.app.BuildConfig
import javax.inject.Inject
import javax.inject.Singleton

/** The server this build talks to: `SERVER_URL` in `app/build.gradle.kts`, overridable with `-PserverUrl=`. */
@Singleton
class ServerConfig @Inject constructor() {
    val url: String = BuildConfig.SERVER_URL

    /** Just the host, for showing next to the status light. */
    val host: String = url.substringAfter("://").substringBefore('/')
}
