package com.brainlessmusic.app.ui.search

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.navigation.LibraryBottomBar
import com.brainlessmusic.app.ui.navigation.Routes

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    navController: NavHostController,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val query by viewModel.query.collectAsStateWithLifecycle()
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    OutlinedTextField(
                        value = query,
                        onValueChange = viewModel::onQueryChange,
                        placeholder = { Text("Search artists, albums, tracks") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                },
            )
        },
        bottomBar = { LibraryBottomBar(navController) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::retry,
            modifier = Modifier.padding(padding),
            isEmpty = { it.artists.isEmpty() && it.albums.isEmpty() && it.tracks.isEmpty() },
            emptyMessage = if (query.isBlank()) "Search your library." else "No matches for \"$query\".",
        ) { results: SearchResultsDto ->
            LazyColumn {
                if (results.artists.isNotEmpty()) {
                    item { SectionHeader("Artists") }
                    items(results.artists, key = { "artist-${it.id}" }) { artist ->
                        ArtistResultRow(artist) { navController.navigate(Routes.artistDetail(artist.id)) }
                    }
                }
                if (results.albums.isNotEmpty()) {
                    item { SectionHeader("Albums") }
                    items(results.albums, key = { "album-${it.id}" }) { album ->
                        AlbumResultRow(album, coverUrl = viewModel.albumCoverUrl(album.id)) {
                            navController.navigate(Routes.albumDetail(album.id))
                        }
                    }
                }
                if (results.tracks.isNotEmpty()) {
                    item { SectionHeader("Tracks") }
                    items(results.tracks, key = { "track-${it.id}" }) { track ->
                        TrackResultRow(track)
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun ArtistResultRow(artist: ArtistSummaryDto, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(artist.name) },
        supportingContent = { Text("${artist.albumCount} albums") },
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    )
}

@Composable
private fun AlbumResultRow(album: AlbumSummaryDto, coverUrl: String?, onClick: () -> Unit) {
    ListItem(
        leadingContent = { CoverImage(url = coverUrl, contentDescription = album.title, modifier = Modifier.size(40.dp)) },
        headlineContent = { Text(album.title) },
        supportingContent = { Text(album.artistName ?: "Unknown Artist") },
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    )
}

@Composable
private fun TrackResultRow(track: TrackSummaryDto) {
    ListItem(
        headlineContent = { Text(track.title) },
        supportingContent = { Text(listOfNotNull(track.artist, track.album).joinToString(" — ")) },
        trailingContent = { Text(formatDuration(track.duration), style = MaterialTheme.typography.bodySmall) },
        modifier = Modifier.fillMaxWidth(),
    )
}
