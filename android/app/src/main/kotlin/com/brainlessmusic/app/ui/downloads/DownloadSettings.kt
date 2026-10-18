package com.brainlessmusic.app.ui.downloads

import android.text.format.Formatter
import androidx.annotation.OptIn
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.data.local.PRECACHE_COUNTS
import com.brainlessmusic.app.data.local.PRECACHE_DEFAULT_COUNT
import com.brainlessmusic.app.data.local.SONG_CACHE_DEFAULT_MB
import com.brainlessmusic.app.data.local.SONG_CACHE_LIMITS_MB
import com.brainlessmusic.app.downloads.DownloadRepository
import com.brainlessmusic.app.downloads.SongCache
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The limits on offer, in GB; 0 is no limit. */
private val LIMITS_GB = listOf(0, 2, 4, 8, 16, 32)

@OptIn(UnstableApi::class)
@HiltViewModel
class DownloadSettingsViewModel @Inject constructor(
    private val settings: PlaybackSettings,
    private val downloads: DownloadRepository,
    private val songCache: SongCache,
) : ViewModel() {
    val spaceUsed: StateFlow<Long> = downloads.spaceUsed

    val wifiOnly: StateFlow<Boolean> =
        settings.downloadWifiOnly.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun setWifiOnly(enabled: Boolean) {
        viewModelScope.launch { settings.setDownloadWifiOnly(enabled) }
    }

    val limitGb: StateFlow<Int> =
        settings.downloadLimitGb.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    fun setLimitGb(gb: Int) {
        viewModelScope.launch { settings.setDownloadLimitGb(gb) }
    }

    fun deleteAll() = downloads.deleteAll()

    val cacheUsed: StateFlow<Long> = songCache.spaceUsed

    val cacheLimitMb: StateFlow<Int> =
        settings.songCacheLimitMb.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SONG_CACHE_DEFAULT_MB)

    fun setCacheLimitMb(mb: Int) {
        viewModelScope.launch { settings.setSongCacheLimitMb(mb) }
    }

    val precacheCount: StateFlow<Int> =
        settings.precacheCount.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PRECACHE_DEFAULT_COUNT)

    fun setPrecacheCount(count: Int) {
        viewModelScope.launch { settings.setPrecacheCount(count) }
    }

    fun clearCache() {
        viewModelScope.launch { songCache.clear() }
    }
}

/** The Settings list's line for the Downloads page. */
@Composable
internal fun downloadSummary(viewModel: DownloadSettingsViewModel = hiltViewModel()): String {
    val used by viewModel.spaceUsed.collectAsStateWithLifecycle()
    val limit by viewModel.limitGb.collectAsStateWithLifecycle()
    val usedText = Formatter.formatShortFileSize(LocalContext.current, used)
    return if (limit > 0) "$usedText used of $limit GB" else "$usedText used"
}

/**
 * Settings, Downloads: the space used, the limit (A88: off by default; new downloads stop at it, nothing is deleted to
 * make room) and deleting everything. [block] and [divider] are the Settings page's own row shapes.
 */
@kotlin.OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun DownloadSettings(
    block: @Composable (title: String, detail: String?, content: @Composable () -> Unit) -> Unit,
    divider: @Composable () -> Unit,
    viewModel: DownloadSettingsViewModel = hiltViewModel(),
) {
    val used by viewModel.spaceUsed.collectAsStateWithLifecycle()
    val limit by viewModel.limitGb.collectAsStateWithLifecycle()
    val wifiOnly by viewModel.wifiOnly.collectAsStateWithLifecycle()
    val usedText = Formatter.formatShortFileSize(LocalContext.current, used)
    var confirmDelete by remember { mutableStateOf(false) }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete all downloads?") },
            text = { Text("Frees $usedText. Your library doesn't change; songs just won't play without signal.") },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; viewModel.deleteAll() }) { Text("Delete all") }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }

    block(
        "Storage limit",
        if (limit > 0) {
            "Downloads use $usedText of $limit GB. A download that would go over doesn't start; nothing already " +
                "downloaded is removed."
        } else {
            "Downloads use $usedText. No limit: Android warns you when the phone is full."
        },
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LIMITS_GB.forEach { gb ->
                FilterChip(
                    selected = gb == limit,
                    onClick = { viewModel.setLimitGb(gb) },
                    label = { Text(if (gb == 0) "No limit" else "$gb GB") },
                )
            }
        }
    }
    divider()
    block(
        "Wi-Fi only",
        if (wifiOnly) {
            "Downloads wait for Wi-Fi and carry on when you connect. Songs already here still play."
        } else {
            "Downloads use any connection, Wi-Fi or mobile data. Turn this on to save your data plan."
        },
    ) {
        Switch(
            checked = wifiOnly,
            onCheckedChange = viewModel::setWifiOnly,
            modifier = Modifier.semantics { contentDescription = "Download on Wi-Fi only" },
        )
    }
    divider()
    block("Delete all downloads", "Takes every downloaded song off this phone.") {
        OutlinedButton(onClick = { confirmDelete = true }, enabled = used > 0) { Text("Delete all") }
    }
    divider()
    SongCacheSettings(block, divider, viewModel)
}

/** The played-songs cache (A198): its size, the space it uses, and emptying it. */
@kotlin.OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SongCacheSettings(
    block: @Composable (title: String, detail: String?, content: @Composable () -> Unit) -> Unit,
    divider: @Composable () -> Unit,
    viewModel: DownloadSettingsViewModel,
) {
    val used by viewModel.cacheUsed.collectAsStateWithLifecycle()
    val limit by viewModel.cacheLimitMb.collectAsStateWithLifecycle()
    val ahead by viewModel.precacheCount.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val usedText = Formatter.formatShortFileSize(context, used)
    var confirmClear by remember { mutableStateOf(false) }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Clear the cache?") },
            text = { Text("Frees $usedText. Songs you've played will stream again next time. Downloads stay.") },
            confirmButton = {
                TextButton(onClick = { confirmClear = false; viewModel.clearCache() }) { Text("Clear") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }

    block(
        "Cache of played songs",
        if (limit > 0) {
            "Songs you play are kept here, so they play again without data or signal. Using $usedText of " +
                "${cacheSizeLabel(limit)}; when it's full, the songs played longest ago go first."
        } else {
            "Songs you play are kept here, so they play again without data or signal. Using $usedText, no limit. " +
                "Android may still empty it if the phone runs short of space."
        },
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SONG_CACHE_LIMITS_MB.forEach { mb ->
                FilterChip(
                    selected = mb == limit,
                    onClick = { viewModel.setCacheLimitMb(mb) },
                    label = { Text(cacheSizeLabel(mb)) },
                )
            }
        }
    }
    divider()
    block(
        "Fetch ahead",
        "Saves the playing song and the next ones while you have signal, so they keep playing in a dead zone. " +
            "Uses mobile data, and fills the cache above.",
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PRECACHE_COUNTS.forEach { n ->
                FilterChip(
                    selected = n == ahead,
                    onClick = { viewModel.setPrecacheCount(n) },
                    label = { Text(if (n == 0) "Off" else if (n == 1) "1 song" else "$n songs") },
                )
            }
        }
    }
    divider()
    block("Clear the cache", "Takes every cached song off this phone. Downloads stay.") {
        OutlinedButton(onClick = { confirmClear = true }, enabled = used > 0) { Text("Clear cache") }
    }
}

private fun cacheSizeLabel(mb: Int): String = when {
    mb <= 0 -> "Unlimited"
    mb % 1024 == 0 -> "${mb / 1024} GB"
    else -> "$mb MB"
}
