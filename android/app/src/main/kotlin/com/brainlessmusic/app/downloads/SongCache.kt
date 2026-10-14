package com.brainlessmusic.app.downloads

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheEvictor
import androidx.media3.datasource.cache.CacheSpan
import androidx.media3.datasource.cache.ContentMetadata
import androidx.media3.datasource.cache.SimpleCache
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.playback.QueueItem
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.TreeSet
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Songs that have streamed, kept so they play again with no signal and no data (A198, A199). Its own folder in the
 * app's cache, apart from downloads: the songs played longest ago go first once it passes the size set in Settings,
 * and Android may empty it when the phone runs short of space. Downloads are never written here.
 */
@OptIn(UnstableApi::class)
@Singleton
class SongCache @Inject constructor(
    @ApplicationContext context: Context,
    databaseProvider: StandaloneDatabaseProvider,
    private val dao: CachedTrackDao,
    settings: PlaybackSettings,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _spaceUsed = MutableStateFlow(0L)
    val spaceUsed: StateFlow<Long> = _spaceUsed.asStateFlow()

    // Bumped whenever a span lands or goes, so the Cached list rechecks what is whole.
    private val changes = MutableStateFlow(0L)

    private val evictor = AdjustableLruEvictor(mbToBytes(0)) { size ->
        _spaceUsed.value = size
        changes.value++
    }

    /** One SimpleCache per folder per process, hence the singleton. Its index loads on Media3's own thread. */
    val cache: Cache = SimpleCache(File(context.cacheDir, "songs"), evictor, databaseProvider)

    // False until the index has loaded: until then every check answers "not cached" rather than block the main thread.
    @Volatile
    private var ready = false

    init {
        scope.launch {
            cache.keys // waits for the index
            ready = true
            dropEvicted()
            changes.value++
        }
        scope.launch {
            settings.songCacheLimitMb.collect { mb -> evictor.setLimit(cache, mbToBytes(mb)) }
        }
    }

    /** Whether the whole of [trackId]'s copy is here: the data-saver one with [low], else the original. */
    fun isCached(trackId: Int, low: Boolean): Boolean {
        if (!ready) return false
        val key = songCacheKey(trackId, low)
        val length = ContentMetadata.getContentLength(cache.getContentMetadata(key))
        return length != C.LENGTH_UNSET.toLong() && cache.isCached(key, 0, length)
    }

    /** Either copy, whole. */
    fun isCached(trackId: Int): Boolean = isCached(trackId, low = false) || isCached(trackId, low = true)

    /** Remembers what [item] is called, so it can be listed with no signal once it is cached. */
    fun record(item: QueueItem) {
        scope.launch { dao.put(item.toCachedTrack(System.currentTimeMillis())) }
    }

    /** Played most recently first, only those whose song is still whole here. */
    val cachedTracks: Flow<List<CachedTrack>> = combine(dao.all(), changes) { rows, _ ->
        rows.filter { isCached(it.trackId) }
    }.flowOn(Dispatchers.IO)

    /** Takes one song, both copies, out of the cache. */
    suspend fun remove(trackId: Int) = withContext(Dispatchers.IO) {
        listOf(false, true).forEach { runCatching { cache.removeResource(songCacheKey(trackId, it)) } }
        dao.delete(listOf(trackId))
        changes.value++
    }

    /** Empties the cache. Downloads are untouched. */
    suspend fun clear() = withContext(Dispatchers.IO) {
        cache.keys.toList().forEach { runCatching { cache.removeResource(it) } }
        dao.clear()
        changes.value++
    }

    /** Rows for songs the cache no longer holds any of. Run at start, when nothing is mid-play. */
    private suspend fun dropEvicted() {
        val keys = cache.keys
        val gone = dao.allOnce().map { it.trackId }.filter {
            songCacheKey(it, low = false) !in keys && songCacheKey(it, low = true) !in keys
        }
        if (gone.isNotEmpty()) dao.delete(gone)
    }

    private fun mbToBytes(mb: Int): Long = if (mb <= 0) Long.MAX_VALUE else mb * 1024L * 1024L
}

/**
 * Least recently used first, like Media3's own evictor, but its limit can change while the cache is open (Media3's is
 * fixed when the cache is built). [onSize] hears the space used after every change. The cache calls in holding its
 * lock; [setLimit] takes the same lock.
 */
@OptIn(UnstableApi::class)
private class AdjustableLruEvictor(
    @Volatile private var maxBytes: Long,
    private val onSize: (Long) -> Unit,
) : CacheEvictor {
    private val spans = TreeSet<CacheSpan> { a, b ->
        when {
            a.lastTouchTimestamp != b.lastTouchTimestamp -> a.lastTouchTimestamp.compareTo(b.lastTouchTimestamp)
            else -> a.compareTo(b)
        }
    }
    private var size = 0L

    fun setLimit(cache: Cache, bytes: Long) {
        synchronized(cache) {
            maxBytes = bytes
            evict(cache, 0)
        }
    }

    override fun requiresCacheSpanTouches() = true

    override fun onCacheInitialized() = Unit

    override fun onStartFile(cache: Cache, key: String, position: Long, length: Long) {
        if (length != C.LENGTH_UNSET.toLong()) evict(cache, length)
    }

    override fun onSpanAdded(cache: Cache, span: CacheSpan) {
        spans.add(span)
        size += span.length
        evict(cache, 0)
        onSize(size)
    }

    override fun onSpanRemoved(cache: Cache, span: CacheSpan) {
        spans.remove(span)
        size -= span.length
        onSize(size)
    }

    override fun onSpanTouched(cache: Cache, oldSpan: CacheSpan, newSpan: CacheSpan) {
        onSpanRemoved(cache, oldSpan)
        onSpanAdded(cache, newSpan)
    }

    private fun evict(cache: Cache, required: Long) {
        while (size + required > maxBytes && spans.isNotEmpty()) {
            try {
                cache.removeSpan(spans.first())
            } catch (e: Cache.CacheException) {
                return
            }
        }
    }
}
