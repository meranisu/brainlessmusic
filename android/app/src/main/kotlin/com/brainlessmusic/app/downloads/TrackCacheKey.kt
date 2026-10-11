package com.brainlessmusic.app.downloads

import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.cache.CacheKeyFactory

private val STREAM_PATH = Regex("""/tracks/(\d+)/stream$""")

/**
 * One key per track and copy, shared by the downloader and the player so a download is found by the player. The
 * quality is part of the key: the data-saver copy is different bytes from the original. Anything that isn't a stream
 * URL keeps its URL as the key.
 */
@UnstableApi
val TrackCacheKey = CacheKeyFactory { spec -> spec.key ?: trackCacheKey(spec.uri) }

fun trackCacheKey(uri: Uri): String =
    trackCacheKey(uri.path, uri.getQueryParameter("quality")) ?: uri.toString()

/** `null` when [path] isn't a stream URL's. */
internal fun trackCacheKey(path: String?, quality: String?): String? {
    val id = path?.let { STREAM_PATH.find(it) }?.groupValues?.get(1) ?: return null
    return "track:$id:" + if (quality == "low") "low" else "orig"
}

/** The download's id: one download per track, whichever album or playlist asked for it. */
fun downloadId(trackId: Int): String = "track:$trackId"

fun trackIdOf(downloadId: String): Int? = downloadId.removePrefix("track:").toIntOrNull()
