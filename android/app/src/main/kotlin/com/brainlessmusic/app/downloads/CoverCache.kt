package com.brainlessmusic.app.downloads

import android.content.Context
import coil.disk.DiskCache
import com.brainlessmusic.app.data.local.PlaybackSettings
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Album art kept on the phone, so covers show at once and with no signal. Coil's disk cache in its usual folder, with
 * the size set in Settings; the covers used longest ago go first once it is full. Coil fixes a cache's size when it is
 * built, so a new limit swaps in a fresh cache on the same folder, which trims itself to fit.
 */
@Singleton
class CoverCache @Inject constructor(
    @ApplicationContext context: Context,
    private val settings: PlaybackSettings,
) : DiskCache {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val folder = File(context.cacheDir, "image_cache")

    @Volatile
    private var current: DiskCache = build(runBlocking { settings.coverCacheLimitMb.first() })

    private val _spaceUsed = MutableStateFlow(0L)
    val spaceUsed: StateFlow<Long> = _spaceUsed.asStateFlow()

    init {
        scope.launch {
            settings.coverCacheLimitMb.drop(1).collect { mb ->
                current = build(mb)
                refresh()
            }
        }
    }

    private fun build(mb: Int): DiskCache = DiskCache.Builder()
        .directory(folder)
        .maxSizeBytes(if (mb > 0) mb * 1024L * 1024L else Long.MAX_VALUE)
        .build()

    /** Rereads the space used; Settings calls it on open. */
    fun refresh() {
        scope.launch { _spaceUsed.value = current.size }
    }

    /** Empties the cache. Covers load from the server again next time. */
    suspend fun clearAll() = withContext(Dispatchers.IO) {
        current.clear()
        _spaceUsed.value = current.size
    }

    override val size get() = current.size
    override val maxSize get() = current.maxSize
    override val directory get() = current.directory
    override val fileSystem get() = current.fileSystem

    @Deprecated("Coil's own deprecation", replaceWith = ReplaceWith("openSnapshot(key)"))
    override fun get(key: String) = current.openSnapshot(key)
    override fun openSnapshot(key: String) = current.openSnapshot(key)

    @Deprecated("Coil's own deprecation", replaceWith = ReplaceWith("openEditor(key)"))
    override fun edit(key: String) = current.openEditor(key)
    override fun openEditor(key: String) = current.openEditor(key)
    override fun remove(key: String) = current.remove(key)
    override fun clear() = current.clear()
}
