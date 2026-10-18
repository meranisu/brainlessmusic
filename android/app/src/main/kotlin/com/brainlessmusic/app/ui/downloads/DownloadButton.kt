package com.brainlessmusic.app.ui.downloads

import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.downloads.GroupDownload
import com.brainlessmusic.app.ui.theme.AppIcons

/**
 * An album's or playlist's download button: download, a progress ring while it runs, a tick when every song is on the
 * phone, or retry. Stopping and removing ask first. [what] names it in labels ("album", "playlist").
 */
@Composable
internal fun DownloadButton(state: GroupDownload, what: String, onDownload: () -> Unit, onRemove: () -> Unit) {
    var confirming by remember { mutableStateOf(false) }
    if (confirming) {
        val running = state is GroupDownload.Running
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text(if (running) "Stop downloading?" else "Remove download?") },
            text = {
                Text(
                    if (running) {
                        "Songs already downloaded are removed too."
                    } else {
                        "The $what stays in your library. It just won't play without signal."
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = { confirming = false; onRemove() }) { Text(if (running) "Stop" else "Remove") }
            },
            dismissButton = { TextButton(onClick = { confirming = false }) { Text("Cancel") } },
        )
    }
    when (state) {
        GroupDownload.None -> IconButton(onClick = onDownload) {
            Icon(AppIcons.download, contentDescription = "Download $what")
        }
        is GroupDownload.Running -> IconButton(onClick = { confirming = true }) {
            CircularProgressIndicator(
                progress = { state.percent / 100f },
                modifier = Modifier
                    .size(24.dp)
                    .semantics { contentDescription = "Downloading, ${state.percent}%. Stop download" },
                strokeWidth = 3.dp,
            )
        }
        GroupDownload.Done -> IconButton(onClick = { confirming = true }) {
            Icon(
                AppIcons.downloadDone,
                contentDescription = "Downloaded. Remove download",
                tint = MaterialTheme.colorScheme.primary,
            )
        }
        GroupDownload.Paused -> IconButton(onClick = onDownload) {
            Icon(AppIcons.download, contentDescription = "Paused. Resume download")
        }
        GroupDownload.Failed -> IconButton(onClick = onDownload) {
            Icon(
                AppIcons.error,
                contentDescription = "Download failed. Retry",
                tint = MaterialTheme.colorScheme.error,
            )
        }
    }
}
