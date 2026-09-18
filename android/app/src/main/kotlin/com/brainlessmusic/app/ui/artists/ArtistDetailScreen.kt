package com.brainlessmusic.app.ui.artists

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtistDetailScreen(
    onBack: () -> Unit,
    onAlbumClick: (albumId: Int) -> Unit,
    viewModel: ArtistDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val title = when (val s = state) {
        is LoadState.Content -> s.data.name
        else -> "Artist"
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
            isEmpty = { it.albums.isEmpty() },
            emptyMessage = "This artist has no albums.",
        ) { detail: ArtistDetailDto ->
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 140.dp),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                items(detail.albums, key = { it.id }) { album ->
                    AlbumCard(
                        album = album,
                        coverUrl = viewModel.albumCoverUrl(album.id),
                        onClick = { onAlbumClick(album.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AlbumCard(album: AlbumSummaryDto, coverUrl: String?, onClick: () -> Unit) {
    Column(modifier = Modifier.clickable(onClick = onClick)) {
        CoverImage(
            url = coverUrl,
            contentDescription = album.title,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f),
        )
        Text(
            text = album.title,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(
            text = album.year?.toString() ?: "${album.trackCount} tracks",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
