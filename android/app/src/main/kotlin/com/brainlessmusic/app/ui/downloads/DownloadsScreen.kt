package com.brainlessmusic.app.ui.downloads

import android.text.format.Formatter
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.downloads.GroupDownload
import com.brainlessmusic.app.downloads.TrackDownload
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.AppBottomBar
import com.brainlessmusic.app.ui.navigation.Routes

// Flat panels with a 1 dp outline, as Settings and the Library header (DESIGN.md: no shadows, no glow).
private val PanelShape = RoundedCornerShape(20.dp)

/**
 * Everything kept on the phone, as a cover grid like the music select (A89): the space it takes, Play all, what is
 * downloading now, filters, then one tile per album or playlist (A90). Reads only the phone's own records, so it works
 * with no signal.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadsScreen(navController: NavHostController, viewModel: DownloadsViewModel = hiltViewModel()) {
    val state by viewModel.ui.collectAsStateWithLifecycle()
    val filter by viewModel.filter.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val toast: (String) -> Unit = { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Downloads") }) },
        bottomBar = { AppBottomBar(navController) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::retryLoad,
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty },
            emptyMessage = "Nothing downloaded yet. Open an album or playlist and tap the download icon to keep it " +
                "on your phone.",
            loadingLabel = "Loading downloads",
            skeleton = { SkeletonListRows() },
        ) { ui ->
            LazyVerticalGrid(
                // Three columns on a phone, more on a wide screen.
                columns = GridCells.Adaptive(minSize = 100.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                fullWidth("storage") {
                    StoragePanel(
                        ui = ui,
                        onPlayAll = { viewModel.playAll(ui, shuffle = false, toast) },
                        onShuffleAll = { viewModel.playAll(ui, shuffle = true, toast) },
                    )
                }
                if (ui.needsSignIn) {
                    fullWidth("sign-in") {
                        Text(
                            "The server signed this phone out, so downloads are paused. Log out and back in from " +
                                "Settings, Account, then tap Resume. Songs already here still play.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
                if (ui.active.isNotEmpty()) {
                    fullWidth("in-progress") {
                        InProgressPanel(ui, onPause = viewModel::pauseAll, onResume = viewModel::resumeAll)
                    }
                }
                fullWidth("filters") { FilterRow(filter, onSelect = viewModel::setFilter) }

                if (filter == DownloadFilter.SONGS) {
                    songRows(ui, onPlay = { viewModel.playSong(ui, it, toast) }, onRemove = viewModel::removeSong)
                } else {
                    val tiles = ui.tilesFor(filter)
                    if (tiles.isEmpty()) {
                        fullWidth("none") {
                            Text(
                                "No ${filter.label.lowercase()} downloaded.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    items(tiles, key = { it.group.id }) { row ->
                        DownloadTile(row, onOpen = { navController.navigate(Routes.downloadGroup(row.group.id)) })
                    }
                }
            }
        }
    }
}

private fun LazyGridScope.fullWidth(key: String, content: @Composable () -> Unit) {
    item(key = key, span = { GridItemSpan(maxLineSpan) }) { content() }
}

/** Space used (against the limit, when there is one), what is on the phone, and Play all / Shuffle all. */
@Composable
private fun StoragePanel(ui: DownloadsUi, onPlayAll: () -> Unit, onShuffleAll: () -> Unit) {
    val context = LocalContext.current
    val used = Formatter.formatShortFileSize(context, ui.spaceUsed)
    Surface(shape = PanelShape, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline), color = Color.Transparent) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(used, style = MaterialTheme.typography.headlineMedium)
                Text(
                    if (ui.limitGb > 0) " of ${ui.limitGb} GB" else " on this phone",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp, bottom = 4.dp),
                )
            }
            if (ui.limitGb > 0) {
                val fraction = (ui.spaceUsed.toFloat() / (ui.limitGb * 1_000_000_000f)).coerceIn(0f, 1f)
                LinearProgressIndicator(
                    progress = { fraction },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "$used used of the ${ui.limitGb} GB download limit" },
                )
            }
            Text(
                listOfNotNull(
                    ui.albumCount.takeIf { it > 0 }?.let { if (it == 1) "1 album" else "$it albums" },
                    ui.playlistCount.takeIf { it > 0 }?.let { if (it == 1) "1 playlist" else "$it playlists" },
                    if (ui.doneSongCount == 1) "1 song ready" else "${ui.doneSongCount} songs ready",
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onPlayAll) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    Text("Play all", modifier = Modifier.padding(start = 6.dp))
                }
                OutlinedButton(onClick = onShuffleAll) {
                    Icon(Icons.Filled.Shuffle, contentDescription = null)
                    Text("Shuffle", modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
    }
}

/** What is downloading now, three songs at most, with pause and resume for the whole queue. */
@Composable
private fun InProgressPanel(ui: DownloadsUi, onPause: () -> Unit, onResume: () -> Unit) {
    Surface(shape = PanelShape, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline), color = Color.Transparent) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val count = ui.active.size
                Text(
                    if (ui.paused) "Paused, $count waiting" else if (count == 1) "Downloading 1 song" else "Downloading $count songs",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                if (ui.paused) {
                    TextButton(onClick = onResume) {
                        Icon(Icons.Filled.Download, contentDescription = null)
                        Text("Resume all", modifier = Modifier.padding(start = 6.dp))
                    }
                } else {
                    TextButton(onClick = onPause) {
                        Icon(Icons.Filled.Pause, contentDescription = null)
                        Text("Pause all", modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
            ui.active.take(3).forEach { row ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(row.song.track.title, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val percent = row.download?.percent ?: 0f
                    LinearProgressIndicator(
                        progress = { percent / 100f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "${row.song.track.title}, ${percent.toInt()}%" },
                    )
                }
            }
            if (ui.active.size > 3) {
                Text(
                    "and ${ui.active.size - 3} more",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun FilterRow(selected: DownloadFilter, onSelect: (DownloadFilter) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DownloadFilter.entries.forEach {
            FilterChip(selected = it == selected, onClick = { onSelect(it) }, label = { Text(it.label) })
        }
    }
}

/** A cover with its download state in the corner; tap opens its page. */
@Composable
private fun DownloadTile(row: DownloadRow, onOpen: () -> Unit) {
    Column(
        Modifier
            .clickable(onClickLabel = "Open", onClick = onOpen)
            .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box {
            CoverMosaic(row.covers, Modifier.fillMaxWidth().aspectRatio(1f))
            StateBadge(row.state, Modifier.align(Alignment.BottomEnd).padding(6.dp))
        }
        Text(row.group.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            listOfNotNull(row.group.subtitle, row.status()).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = if (row.canRetry) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** One cover, or with four or more a 2×2 mosaic of the first four, so the Songs tile shows what's in it. */
@Composable
internal fun CoverMosaic(covers: List<String?>, modifier: Modifier = Modifier) {
    if (covers.size < 4) {
        CoverImage(url = covers.firstOrNull(), contentDescription = null, modifier = modifier, cornerRadius = 14.dp)
        return
    }
    Column(modifier.clip(RoundedCornerShape(14.dp))) {
        covers.take(4).chunked(2).forEach { pair ->
            Row(Modifier.weight(1f)) {
                pair.forEach { CoverImage(url = it, contentDescription = null, modifier = Modifier.weight(1f).fillMaxHeight(), cornerRadius = 0.dp) }
            }
        }
    }
}

/** Done, downloading (a ring), failed, or partly on the phone, on a solid disc so it reads over any cover. */
@Composable
internal fun StateBadge(state: GroupDownload, modifier: Modifier = Modifier) {
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = modifier.size(32.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            when (state) {
                GroupDownload.Done ->
                    Icon(Icons.Filled.DownloadDone, contentDescription = "Downloaded", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                is GroupDownload.Running ->
                    CircularProgressIndicator(progress = { state.percent / 100f }, modifier = Modifier.size(20.dp), strokeWidth = 2.5.dp)
                GroupDownload.Failed ->
                    Icon(Icons.Filled.ErrorOutline, contentDescription = "Download failed", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                GroupDownload.None ->
                    Icon(Icons.Filled.Download, contentDescription = "Partly downloaded", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            }
        }
    }
}

/** The Songs filter: every downloaded song once. Tap plays from it; the menu takes it off the phone. */
private fun LazyGridScope.songRows(ui: DownloadsUi, onPlay: (DownloadSongRow) -> Unit, onRemove: (DownloadSongRow) -> Unit) {
    if (ui.songs.isEmpty()) {
        fullWidth("no-songs") { Text("No songs downloaded.", style = MaterialTheme.typography.bodyMedium) }
    }
    items(ui.songs, key = { "song-${it.song.track.trackId}" }, span = { GridItemSpan(maxLineSpan) }) { row ->
        SongRow(
            title = row.song.track.title,
            supporting = listOfNotNull(row.song.track.artist ?: "Unknown artist", row.song.track.album).joinToString(" · "),
            coverUri = row.coverUri,
            download = row.download,
            onClick = { onPlay(row) },
            menu = { close ->
                DropdownMenuItem(text = { Text("Remove from phone") }, onClick = { close(); onRemove(row) })
            },
        )
    }
}

/** One song in a list, its download state at the end and a menu; shared with the album and playlist pages. */
@Composable
internal fun SongRow(
    title: String,
    supporting: String,
    coverUri: String?,
    download: TrackDownload?,
    onClick: () -> Unit,
    leading: (@Composable () -> Unit)? = null,
    menu: @Composable (close: () -> Unit) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    ListItem(
        leadingContent = leading ?: { CoverImage(url = coverUri, contentDescription = null, modifier = Modifier.size(48.dp)) },
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(
                supporting,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (download?.isFailed == true) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TrackStateIcon(download)
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "Options for $title")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        menu { menuOpen = false }
                    }
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick),
    )
}

/** One song's state: on the phone, downloading, failed, or not downloaded. */
@Composable
private fun TrackStateIcon(download: TrackDownload?) {
    val mod = Modifier.size(20.dp)
    when {
        download?.isDone == true ->
            Icon(Icons.Filled.DownloadDone, contentDescription = "On the phone", tint = MaterialTheme.colorScheme.primary, modifier = mod)
        download?.isActive == true ->
            CircularProgressIndicator(
                progress = { download.percent / 100f },
                strokeWidth = 2.dp,
                modifier = mod.semantics { contentDescription = "Downloading, ${download.percent.toInt()}%" },
            )
        download?.isFailed == true ->
            Icon(Icons.Filled.ErrorOutline, contentDescription = "Download failed", tint = MaterialTheme.colorScheme.error, modifier = mod)
        else ->
            Icon(Icons.Filled.Download, contentDescription = "Not downloaded", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = mod)
    }
}

/** Asks before taking an album or playlist off the phone. */
@Composable
internal fun RemoveGroupDialog(name: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Remove download?") },
        text = { Text("\"$name\" stays in your library. It just won't play without signal.") },
        confirmButton = { TextButton(onClick = { onDismiss(); onConfirm() }) { Text("Remove") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
