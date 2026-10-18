package com.brainlessmusic.app.downloads

import android.net.Uri
import android.util.Log
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.okhttp.OkHttpDataSource
import com.brainlessmusic.app.playback.QueueItem
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient

private const val TAG = "Precacher"

/** One song to have on the phone: [url] is the stream URL the player will ask for, so the cache key matches. */
data class PrecacheWant(val item: QueueItem, val url: String)

/**
 * Fetches the playing song and the next few into the song cache while there is signal, so they keep playing in a dead
 * zone. It writes through the same cache and key the player reads ([TrackCacheKey]), so a fetched song is an ordinary
 * cache hit; the offline queue skip then finds it with no change.
 */
@OptIn(UnstableApi::class)
@Singleton
class Precacher @Inject constructor(
    private val okHttpClient: OkHttpClient,
    private val songCache: SongCache,
    private val downloads: DownloadRepository,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var job: Job? = null
    private var wanted = emptyList<Pair<Int, String>>()

    private val dataSourceFactory by lazy {
        CacheDataSource.Factory()
            .setCache(songCache.cache)
            .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(okHttpClient))
            .setCacheKeyFactory(TrackCacheKey)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    /**
     * The songs to hold, in the order to fetch them. The same list again changes nothing; a different one drops the
     * song being fetched and starts over, so a skip is never left waiting behind a fetch nobody needs.
     * Main thread.
     */
    fun want(items: List<PrecacheWant>) {
        val next = items.map { it.item.trackId to it.url }
        if (next == wanted) return
        wanted = next
        job?.cancel()
        job = if (items.isEmpty()) null else scope.launch { fetchAll(items) }
    }

    private suspend fun fetchAll(items: List<PrecacheWant>) {
        for (want in items) {
            val id = want.item.trackId
            val low = Uri.parse(want.url).getQueryParameter("quality") == "low"
            if (downloads.isDownloaded(id) || songCache.isCached(id, low)) continue
            try {
                fetch(want.url)
                if (songCache.isCached(id, low)) songCache.record(want.item)
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                // Left partial: the player reuses what landed. Try the next song; the list is rebuilt on any change.
                Log.w(TAG, "Fetching track $id stopped", e)
            }
        }
    }

    private suspend fun fetch(url: String) = withContext(Dispatchers.IO) {
        val writer = CacheWriter(dataSourceFactory.createDataSource(), DataSpec(Uri.parse(url)), null, null)
        val cancel = coroutineContext[Job]!!.invokeOnCompletion { if (it != null) writer.cancel() }
        try {
            writer.cache()
        } finally {
            cancel.dispose()
        }
    }
}

/**
 * The positions in [order] to hold: the song at [currentPos] first, then the next [count]. Past the end it stops, or
 * with [wrap] carries on from the start. Never the same position twice.
 */
internal fun precacheOrder(order: List<Int>, currentPos: Int, count: Int, wrap: Boolean): List<Int> {
    if (currentPos !in order.indices) return emptyList()
    val out = mutableListOf(order[currentPos])
    for (step in 1..count) {
        val pos = currentPos + step
        val at = if (wrap) pos % order.size else pos
        if (at !in order.indices) break
        if (order[at] !in out) out += order[at]
    }
    return out
}
