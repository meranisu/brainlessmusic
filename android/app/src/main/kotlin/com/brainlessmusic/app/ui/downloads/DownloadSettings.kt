package com.brainlessmusic.app.ui.downloads

import android.text.format.Formatter
import androidx.annotation.OptIn
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.downloads.DownloadRepository
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
) : ViewModel() {
    val spaceUsed: StateFlow<Long> = downloads.spaceUsed

    val limitGb: StateFlow<Int> =
        settings.downloadLimitGb.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    fun setLimitGb(gb: Int) {
        viewModelScope.launch { settings.setDownloadLimitGb(gb) }
    }

    fun deleteAll() = downloads.deleteAll()
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
    block("Delete all downloads", "Takes every downloaded song off this phone.") {
        FilledTonalButton(onClick = { confirmDelete = true }, enabled = used > 0) { Text("Delete all") }
    }
}
