package com.brainlessmusic.app.ui.profile

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.remote.dto.TrackDetailDto
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.formatDuration

private enum class MenuStep { MENU, PLAYLIST, DETAILS }

/**
 * What a long press on a song opens: play next, like, add to a playlist, its album, play less often, and its details.
 * Account-only rows hide for guests. [showPlayNext] is off where the song is the one playing; [onOpenAlbum] null hides
 * the album row.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongMenuSheet(
    item: QueueItem,
    onDismiss: () -> Unit,
    onOpenAlbum: ((Int) -> Unit)? = null,
    showPlayNext: Boolean = true,
    viewModel: SongActionsViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val liked by viewModel.likedIds.collectAsStateWithLifecycle()
    val downloadStates by viewModel.downloadStates.collectAsStateWithLifecycle()
    var step by remember { mutableStateOf(MenuStep.MENU) }
    val toast: (String) -> Unit = { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() }

    when (step) {
        MenuStep.PLAYLIST -> {
            AddToPlaylistSheet(trackId = item.trackId, trackTitle = item.title, onDismiss = onDismiss, viewModel = viewModel)
            return
        }
        MenuStep.DETAILS -> {
            SongDetailsDialog(item.trackId, onDismiss = onDismiss, viewModel = viewModel)
            return
        }
        MenuStep.MENU -> Unit
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 8.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(start = 24.dp, end = 24.dp, bottom = 12.dp),
            ) {
                CoverImage(url = item.coverUrl, contentDescription = null, modifier = Modifier.size(48.dp))
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        listOfNotNull(item.artist, item.album).joinToString(" · ").ifEmpty { "Unknown artist" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            if (showPlayNext) {
                MenuRow(Icons.AutoMirrored.Filled.PlaylistPlay, "Play next") {
                    toast(viewModel.playNext(item))
                    onDismiss()
                }
            }
            if (viewModel.canEdit) {
                val isLiked = item.trackId in liked
                MenuRow(
                    if (isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    if (isLiked) "Unlike" else "Like",
                    tint = if (isLiked) MaterialTheme.colorScheme.primary else null,
                ) {
                    viewModel.toggleLike(item.trackId)
                    onDismiss()
                }
                MenuRow(Icons.AutoMirrored.Filled.PlaylistAdd, "Add to playlist") { step = MenuStep.PLAYLIST }
            }
            val download = downloadStates[item.trackId]
            when {
                download?.isDone == true -> MenuRow(Icons.Filled.DownloadDone, "Remove download") {
                    viewModel.removeDownload(item.trackId)
                    toast("Removed from this phone.")
                    onDismiss()
                }
                download?.isActive == true -> MenuRow(Icons.Filled.Download, "Stop download") {
                    viewModel.removeDownload(item.trackId)
                    onDismiss()
                }
                else -> MenuRow(Icons.Filled.Download, "Download") {
                    viewModel.download(item, toast)
                    onDismiss()
                }
            }
            val albumId = item.albumId
            if (albumId != null && onOpenAlbum != null) {
                MenuRow(Icons.Filled.Album, "Go to album") {
                    onDismiss()
                    onOpenAlbum(albumId)
                }
            }
            if (viewModel.canEdit) {
                MenuRow(
                    Icons.AutoMirrored.Filled.TrendingDown,
                    "Play less often",
                    detail = "Shuffle picks it about one pass in four. Undo it in You, under Songs you hear less.",
                ) {
                    viewModel.playLessOften(item.trackId, item.title, toast)
                    onDismiss()
                }
            }
            MenuRow(Icons.Outlined.Info, "Details") { step = MenuStep.DETAILS }
        }
    }
}

@Composable
private fun MenuRow(
    icon: ImageVector,
    label: String,
    detail: String? = null,
    tint: Color? = null,
    onClick: () -> Unit,
) {
    ListItem(
        leadingContent = { Icon(icon, contentDescription = null, tint = tint ?: MaterialTheme.colorScheme.onSurfaceVariant) },
        headlineContent = { Text(label) },
        supportingContent = detail?.let { { Text(it, style = MaterialTheme.typography.bodySmall) } },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick).padding(horizontal = 8.dp),
    )
}

/** The file's tags and what the server knows about it, as label and value pairs. */
@Composable
private fun SongDetailsDialog(trackId: Int, onDismiss: () -> Unit, viewModel: SongActionsViewModel) {
    val detail by viewModel.detail.collectAsStateWithLifecycle()
    LaunchedEffect(trackId) { viewModel.loadDetail(trackId) }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
        title = { Text("Song details") },
        text = {
            when (val state = detail) {
                LoadState.Loading -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(32.dp))
                }
                is LoadState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
                is LoadState.Content -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    detailRows(state.data).forEach { (label, value) -> DetailRow(label, value) }
                }
            }
        },
    )
}

private fun detailRows(d: TrackDetailDto): List<Pair<String, String>> = listOfNotNull(
    "Title" to d.title,
    "Artist" to (d.artist ?: "Unknown"),
    "Album" to (d.album ?: "Unknown"),
    d.trackNumber?.let { "Track" to "$it" },
    "Length" to formatDuration(d.duration),
    d.format?.takeIf { it.isNotBlank() }?.let { "Format" to it },
    d.bitrate?.takeIf { it > 0 }?.let { "Bitrate" to "${it / 1000} kbps" },
    d.sampleRate?.takeIf { it > 0 }?.let { "Sample rate" to "%.1f kHz".format(it / 1000.0) },
    d.fileSize?.takeIf { it > 0 }?.let { "File size" to "%.1f MB".format(it / 1_048_576.0) },
    "Plays" to "${d.playCount}",
    d.lastPlayedAt?.let { "Last played" to formatDay(it) },
    d.dateAdded?.let { "Added" to formatDay(it) },
)

@Composable
private fun DetailRow(label: String, value: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(0.35f),
        )
        Text(value, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.End, modifier = Modifier.weight(0.65f))
    }
}
