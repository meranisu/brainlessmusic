package com.brainlessmusic.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.brainlessmusic.app.data.local.SessionStore
import com.brainlessmusic.app.data.remote.TokenProvider
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import javax.inject.Inject

/**
 * One Coil [ImageLoader] on the authenticated [OkHttpClient], so cover art gets the bearer header with no media token.
 * Hilt fills the injected field before Coil first calls `newImageLoader()`.
 */
@HiltAndroidApp
class BrainlessMusicApp : Application(), ImageLoaderFactory {

    @Inject
    lateinit var okHttpClient: OkHttpClient

    @Inject
    lateinit var tokenProvider: TokenProvider

    @Inject
    lateinit var sessionStore: SessionStore

    /**
     * The scheduler can start the download service in a fresh process with no UI, so nothing has run `restoreSession`.
     * Load the stored token here so those requests carry `Authorization`. The UI's restore still validates it.
     */
    override fun onCreate() {
        super.onCreate()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            val token = runCatching { sessionStore.readToken() }.getOrNull() ?: return@launch
            if (tokenProvider.current == null) tokenProvider.current = token
        }
    }

    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .okHttpClient(okHttpClient)
            .build()
}
