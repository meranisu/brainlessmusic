package com.brainlessmusic.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import dagger.hilt.android.HiltAndroidApp
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

    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .okHttpClient(okHttpClient)
            .build()
}
