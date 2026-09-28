package com.brainlessmusic.app.data.remote

import com.brainlessmusic.app.BuildConfig
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The server this build talks to. Fixed at build time (`SERVER_URL` in
 * `app/build.gradle.kts`, `-PserverUrl=` to override) rather than typed in by
 * the listener: it is a personal server with one address, and a login screen
 * that asks for it just gives a way to get it wrong.
 */
@Singleton
class ServerConfig @Inject constructor() {
    val url: String = BuildConfig.SERVER_URL

    /** Just the host, for showing next to the status light. */
    val host: String = url.substringAfter("://").substringBefore('/')
}
