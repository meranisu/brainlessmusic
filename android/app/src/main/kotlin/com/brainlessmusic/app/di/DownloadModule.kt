package com.brainlessmusic.app.di

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.offline.DefaultDownloadIndex
import androidx.media3.exoplayer.offline.DefaultDownloaderFactory
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.scheduler.Requirements
import androidx.room.Room
import com.brainlessmusic.app.downloads.DownloadDao
import com.brainlessmusic.app.downloads.DownloadDatabase
import com.brainlessmusic.app.downloads.TrackCacheKey
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.Executors
import javax.inject.Singleton

@UnstableApi
@Module
@InstallIn(SingletonComponent::class)
object DownloadModule {

    @Provides
    @Singleton
    fun provideDatabaseProvider(@ApplicationContext context: Context): StandaloneDatabaseProvider =
        StandaloneDatabaseProvider(context)

    /**
     * Downloaded songs, in app-private storage (gone on uninstall). Never evicts: a download stays until it is removed.
     * Only one SimpleCache may use a folder per process, hence the singleton.
     */
    @Provides
    @Singleton
    fun provideDownloadCache(@ApplicationContext context: Context, databaseProvider: StandaloneDatabaseProvider): Cache =
        SimpleCache(File(context.filesDir, "downloads"), NoOpCacheEvictor(), databaseProvider)

    @Provides
    @Singleton
    fun provideDownloadDatabase(@ApplicationContext context: Context): DownloadDatabase =
        Room.databaseBuilder(context, DownloadDatabase::class.java, "downloads.db").build()

    @Provides
    fun provideDownloadDao(db: DownloadDatabase): DownloadDao = db.dao()

    @Provides
    @Singleton
    fun provideDownloadManager(
        @ApplicationContext context: Context,
        databaseProvider: StandaloneDatabaseProvider,
        cache: Cache,
        okHttpClient: OkHttpClient,
    ): DownloadManager {
        // The shared client, so downloads carry the same bearer header and user-agent as playback.
        val cacheFactory = CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(okHttpClient))
            .setCacheKeyFactory(TrackCacheKey)
        return DownloadManager(
            context,
            DefaultDownloadIndex(databaseProvider),
            DefaultDownloaderFactory(cacheFactory, Executors.newFixedThreadPool(2)),
        ).apply {
            maxParallelDownloads = 2
            // Any connection, Wi-Fi or mobile data (A85).
            requirements = Requirements(Requirements.NETWORK)
        }
    }
}
