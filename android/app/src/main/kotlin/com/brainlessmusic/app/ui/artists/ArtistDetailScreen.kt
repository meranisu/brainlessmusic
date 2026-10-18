package com.brainlessmusic.app.ui.artists

import com.brainlessmusic.app.ui.common.AlbumCard
import com.brainlessmusic.app.ui.common.Notices
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistDetailDto
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.albums.PlayShuffleRow
import com.brainlessmusic.app.ui.common.SkeletonAlbumGrid
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.theme.AppIcons

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtistDetailScreen(
    onBack: () -> Unit,
    onAlbumClick: (albumId: Int) -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: ArtistDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    val context = LocalContext.current
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
                        Icon(AppIcons.back, contentDescription = "Back")
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
            isEmpty = { it.albums.isEmpty() && it.appearsOn.isNullOrEmpty() },
            emptyMessage = "This artist has no albums.",
            loadingLabel = "Loading artist",
            skeleton = { SkeletonAlbumGrid() },
        ) { detail: ArtistDetailDto ->
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = { viewModel.refresh { Notices.show(it) } },
            ) {
                LazyVerticalGrid(
                    modifier = Modifier.fillMaxSize(),
                    columns = GridCells.Adaptive(minSize = 140.dp),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        val onFailed: (String) -> Unit = { Notices.show(it) }
                        PlayShuffleRow(
                            onPlay = { viewModel.playAll(shuffle = false, onFailed) },
                            onShuffle = { viewModel.playAll(shuffle = true, onFailed) },
                        )
                    }
                    items(detail.albums, key = { it.id }) { album ->
                        AlbumCard(
                            album = album,
                            coverUrl = viewModel.albumCoverUrl(album.id),
                            subtitle = album.year?.toString() ?: "${album.trackCount} tracks",
                            onClick = { onAlbumClick(album.id) },
                        )
                    }
                    // Other artists' albums with a song of theirs (A149); here the album's artist is worth a line.
                    val appearsOn = detail.appearsOn.orEmpty()
                    if (appearsOn.isNotEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }, key = "appears-on") {
                            Text(
                                "Appears on",
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.padding(top = 8.dp).semantics { heading() },
                            )
                        }
                        items(appearsOn, key = { "on-${it.id}" }) { album ->
                            AlbumCard(
                                album = album,
                                coverUrl = viewModel.albumCoverUrl(album.id),
                                onClick = { onAlbumClick(album.id) },
                                subtitle = album.artistName ?: album.year?.toString() ?: "${album.trackCount} tracks",
                            )
                        }
                    }
                }
            }
        }
    }
}
