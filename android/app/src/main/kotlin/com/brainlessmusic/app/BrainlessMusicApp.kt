package com.brainlessmusic.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import dagger.hilt.android.HiltAndroidApp
import okhttp3.OkHttpClient
import javax.inject.Inject

/**
 * [ImageLoaderFactory] so every `AsyncImage` in the app shares one
 * [ImageLoader] built on the same authenticated [OkHttpClient] Retrofit
 * uses — cover art is served from `authenticateMedia` routes
 * (backend/src/plugins/auth.ts), which accept a normal bearer header, so
 * [com.brainlessmusic.app.data.remote.AuthInterceptor] already does the
 * right thing for Coil's requests with no separate media-token exchange
 * needed. Field injection (not constructor injection — [Application] can't
 * take constructor args) is populated by Hilt's generated base class before
 * `newImageLoader()` is ever called; Coil only calls it lazily on first
 * image load, which can't happen before `onCreate()` completes.
 */
@HiltAndroidApp
class BrainlessMusicApp : Application(), ImageLoaderFactory {

    @Inject
    lateinit var okHttpClient: OkHttpClient

    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .okHttpClient(okHttpClient)
            .build()
}
