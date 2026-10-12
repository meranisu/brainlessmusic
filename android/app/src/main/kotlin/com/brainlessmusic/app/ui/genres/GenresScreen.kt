package com.brainlessmusic.app.ui.genres

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.GenreDetailDto
import com.brainlessmusic.app.data.remote.dto.GenreSummaryDto
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonAlbumGrid
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.theme.AppIcons

/** Reached from "By genre" on the Library's Albums tab; the tab bar is full in every skin. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GenresScreen(
    onBack: () -> Unit,
    onGenreClick: (genreId: Int) -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: GenresViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var filter by rememberSaveable { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Genres") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") }
                },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty() },
            emptyMessage = "No genres yet. They come from your files' genre tags and show up after the next library scan.",
            loadingLabel = "Loading genres",
            skeleton = { SkeletonListRows() },
        ) { genres: List<GenreSummaryDto> ->
            val needle = filter.trim().lowercase()
            val shown = if (needle.isEmpty()) genres else genres.filter { needle in it.name.lowercase() }
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    OutlinedTextField(
                        value = filter,
                        onValueChange = { filter = it },
                        label = { Text("Filter genres") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                if (shown.isEmpty()) {
                    item {
                        Text(
                            "No genre matches “${filter.trim()}”.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                }
                items(shown, key = { it.id }) { genre ->
                    ListItem(
                        headlineContent = { Text(genre.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        supportingContent = {
                            Text("${plural(genre.albumCount, "album")} · ${plural(genre.trackCount, "song")}")
                        },
                        modifier = Modifier.clickable { onGenreClick(genre.id) },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GenreDetailScreen(
    onBack: () -> Unit,
    onAlbumClick: (albumId: Int) -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: GenreDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val title = (state as? LoadState.Content)?.data?.name ?: "Genre"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") }
                },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { it.albums.isEmpty() },
            emptyMessage = "No albums in this genre right now.",
            loadingLabel = "Loading genre",
            skeleton = { SkeletonAlbumGrid() },
        ) { genre: GenreDetailDto ->
            LazyVerticalGrid(
                modifier = Modifier.fillMaxSize(),
                columns = GridCells.Adaptive(minSize = 140.dp),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                items(genre.albums, key = { it.id }) { album ->
                    GenreAlbumCard(album, viewModel.albumCoverUrl(album.id)) { onAlbumClick(album.id) }
                }
            }
        }
    }
}

@Composable
private fun GenreAlbumCard(album: AlbumSummaryDto, coverUrl: String?, onClick: () -> Unit) {
    Column(modifier = Modifier.clickable(onClick = onClick)) {
        CoverImage(url = coverUrl, contentDescription = album.title, modifier = Modifier.fillMaxWidth().aspectRatio(1f))
        Text(
            album.title,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(
            album.artistName ?: "Unknown artist",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun plural(n: Int, word: String) = "$n $word${if (n == 1) "" else "s"}"
