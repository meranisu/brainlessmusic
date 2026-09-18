package com.brainlessmusic.app.ui.albums

import androidx.compose.foundation.layout.Column
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
    viewModel: AlbumDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
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
                items(album.tracks, key = { it.id }) { track ->
                    TrackRow(track)
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
private fun TrackRow(track: AlbumTrackDto) {
    ListItem(
        leadingContent = {
            Text(
                track.trackNumber?.toString() ?: "–",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        headlineContent = { Text(track.title) },
        trailingContent = { Text(formatDuration(track.duration), style = MaterialTheme.typography.bodySmall) },
    )
}
