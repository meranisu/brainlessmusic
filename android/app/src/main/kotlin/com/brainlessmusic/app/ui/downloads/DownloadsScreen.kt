package com.brainlessmusic.app.ui.downloads

import android.text.format.Formatter
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.AppBottomBar

/** Everything kept on the phone. Reads only the local database, so it works with no signal. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadsScreen(navController: NavHostController, viewModel: DownloadsViewModel = hiltViewModel()) {
    val state by viewModel.rows.collectAsStateWithLifecycle()
    val spaceUsed by viewModel.spaceUsed.collectAsStateWithLifecycle()
    val needsSignIn by viewModel.needsSignIn.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var confirmRemove by remember { mutableStateOf<DownloadRow?>(null) }

    confirmRemove?.let { row ->
        AlertDialog(
            onDismissRequest = { confirmRemove = null },
            title = { Text("Remove download?") },
            text = { Text("\"${row.group.name}\" stays in your library. It just won't play without signal.") },
            confirmButton = {
                TextButton(onClick = { viewModel.remove(row); confirmRemove = null }) { Text("Remove") }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = null }) { Text("Cancel") } },
        )
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Downloads") }) },
        bottomBar = { AppBottomBar(navController) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::retryLoad,
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty() },
            emptyMessage = "Nothing downloaded yet. Open an album and tap the download icon to keep it on your phone.",
            loadingLabel = "Loading downloads",
            skeleton = { SkeletonListRows() },
        ) { rows ->
            LazyColumn(Modifier.fillMaxSize()) {
                if (needsSignIn) {
                    item {
                        Text(
                            "The server signed this phone out, so downloads are paused. Log out and back in from " +
                                "Settings, Account, then retry from each album's menu. Songs already here still play.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                }
                item {
                    Text(
                        "${Formatter.formatShortFileSize(context, spaceUsed)} on this phone",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                items(rows, key = { it.group.id }) { row ->
                    DownloadRowItem(
                        row = row,
                        onPlay = { viewModel.play(row, shuffle = false) { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() } },
                        onShuffle = { viewModel.play(row, shuffle = true) { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() } },
                        onRetry = { viewModel.retry(row) },
                        onRemove = { confirmRemove = row },
                    )
                }
            }
        }
    }
}

/** Tap plays it from the top; shuffle and the menu sit on the right. */
@Composable
private fun DownloadRowItem(
    row: DownloadRow,
    onPlay: () -> Unit,
    onShuffle: () -> Unit,
    onRetry: () -> Unit,
    onRemove: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    ListItem(
        leadingContent = { CoverImage(url = row.coverUri, contentDescription = null, modifier = Modifier.size(56.dp)) },
        headlineContent = { Text(row.group.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(
                row.status(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (row.canRetry) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onShuffle) {
                    Icon(Icons.Filled.Shuffle, contentDescription = "Shuffle ${row.group.name}")
                }
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "Options for ${row.group.name}")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        if (row.canRetry) {
                            DropdownMenuItem(text = { Text("Retry download") }, onClick = { menuOpen = false; onRetry() })
                        }
                        DropdownMenuItem(text = { Text("Remove download") }, onClick = { menuOpen = false; onRemove() })
                    }
                }
            }
        },
        modifier = Modifier.clickable(onClick = onPlay),
    )
}
