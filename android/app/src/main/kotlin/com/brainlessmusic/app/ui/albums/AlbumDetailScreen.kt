package com.brainlessmusic.app.ui.albums

import androidx.compose.foundation.layout.Column
import com.brainlessmusic.app.ui.playback.MiniPlayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.AlbumTrackDto
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.formatDuration

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlbumDetailScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: AlbumDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val playback by viewModel.playback.collectAsStateWithLifecycle()
    val title = when (val s = state) {
        is LoadState.Content -> s.data.title
        else -> "Album"
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::load) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { it.tracks.isEmpty() },
            emptyMessage = "This album has no tracks.",
        ) { album: AlbumDetailDto ->
            LazyColumn {
                item { AlbumHeader(album, coverUrl = viewModel.coverUrl()) }
                itemsIndexed(album.tracks, key = { _, track -> track.id }) { index, track ->
                    TrackRow(
                        track = track,
                        isCurrent = playback.current?.trackId == track.id,
                        onClick = { viewModel.playFrom(album, index) },
                        onPlayNext = { viewModel.playNext(album, track) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AlbumHeader(album: AlbumDetailDto, coverUrl: String?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CoverImage(
            url = coverUrl,
            contentDescription = album.title,
            modifier = Modifier.size(88.dp),
        )
        Column(modifier = Modifier.padding(start = 16.dp)) {
            Text(album.title, style = MaterialTheme.typography.titleMedium)
            Text(
                album.artistName ?: "Unknown Artist",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            album.year?.let {
                Text(
                    it.toString(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun TrackRow(
    track: AlbumTrackDto,
    isCurrent: Boolean,
    onClick: () -> Unit,
    onPlayNext: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    ListItem(
        leadingContent = {
            Text(
                track.trackNumber?.toString() ?: "–",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        headlineContent = {
            Text(
                track.title,
                fontWeight = if (isCurrent) FontWeight.Bold else null,
                color = if (isCurrent) MaterialTheme.colorScheme.primary else Color.Unspecified,
            )
        },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(formatDuration(track.duration), style = MaterialTheme.typography.bodySmall)
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "More")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("Play next") },
                            onClick = {
                                menuOpen = false
                                onPlayNext()
                            },
                        )
                    }
                }
            }
        },
        modifier = Modifier.clickable(onClick = onClick),
    )
}
