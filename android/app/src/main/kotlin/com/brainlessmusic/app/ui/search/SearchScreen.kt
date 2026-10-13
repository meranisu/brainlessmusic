package com.brainlessmusic.app.ui.search

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.PlaylistSearchDto
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.navigation.TabBarSpace
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.profile.SongMenuSheet
import com.brainlessmusic.app.ui.theme.AppIcons

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    navController: NavHostController,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val query by viewModel.query.collectAsStateWithLifecycle()
    val state by viewModel.state.collectAsStateWithLifecycle()
    var menuFor by remember { mutableStateOf<TrackSummaryDto?>(null) }
    menuFor?.let { track ->
        SongMenuSheet(
            item = viewModel.queueItem(track),
            onDismiss = { menuFor = null },
            onOpenAlbum = { navController.navigate(Routes.albumDetail(it)) },
            onOpenArtist = { navController.navigate(Routes.artistDetail(it)) },
        )
    }

    // No TopAppBar: a text field in its title slot comes out cramped and unstyled.
    Scaffold(
        bottomBar = { TabBarSpace() },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            TextField(
                value = query,
                onValueChange = viewModel::onQueryChange,
                placeholder = { Text("Search songs, albums, artists, playlists") },
                singleLine = true,
                leadingIcon = { Icon(AppIcons.search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { viewModel.onQueryChange("") }) {
                            Icon(AppIcons.clear, contentDescription = "Clear search")
                        }
                    }
                },
                colors = TextFieldDefaults.colors(
                    unfocusedIndicatorColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                ),
                shape = MaterialTheme.shapes.extraLarge,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
            )

            LoadStateContent(
                state = state,
                onRetry = viewModel::retry,
                modifier = Modifier.fillMaxSize(),
                isEmpty = { it.artists.isEmpty() && it.albums.isEmpty() && it.tracks.isEmpty() && it.playlists.isNullOrEmpty() },
                emptyMessage = if (query.isBlank()) "Search your library." else "No matches for \"$query\".",
                loadingLabel = "Searching",
                skeleton = { SkeletonListRows(rows = 8, trailing = true) },
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
                    // Yours first, then other people's public ones (A162).
                    val playlists = results.playlists.orEmpty()
                    if (playlists.isNotEmpty()) {
                        item { SectionHeader("Playlists") }
                        items(playlists, key = { "playlist-${it.id}" }) { playlist ->
                            PlaylistResultRow(playlist, coverUrl = playlist.coverAlbumIds?.firstOrNull()?.let(viewModel::albumCoverUrl)) {
                                navController.navigate(Routes.playlistDetail(playlist.id))
                            }
                        }
                    }
                    if (results.tracks.isNotEmpty()) {
                        item { SectionHeader("Tracks") }
                        itemsIndexed(results.tracks, key = { _, track -> "track-${track.id}" }) { index, track ->
                            TrackResultRow(
                                track,
                                onClick = { viewModel.playTracks(results.tracks, index) },
                                onLongClick = { menuFor = track },
                            )
                        }
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
private fun PlaylistResultRow(playlist: PlaylistSearchDto, coverUrl: String?, onClick: () -> Unit) {
    val count = if (playlist.trackCount == 1) "1 song" else "${playlist.trackCount} songs"
    ListItem(
        leadingContent = { CoverImage(url = coverUrl, contentDescription = null, modifier = Modifier.size(40.dp)) },
        headlineContent = { Text(playlist.name) },
        supportingContent = {
            Text(
                when {
                    !playlist.isOwner -> "by ${playlist.ownerName ?: "someone"} · $count"
                    playlist.isPublic -> "Yours, public · $count"
                    else -> "Yours · $count"
                },
            )
        },
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TrackResultRow(track: TrackSummaryDto, onClick: () -> Unit, onLongClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    ListItem(
        headlineContent = { Text(track.title) },
        supportingContent = { Text(listOfNotNull(track.artist, track.album).joinToString(" · ")) },
        trailingContent = { Text(formatDuration(track.duration), style = MaterialTheme.typography.bodySmall) },
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = onClick,
                onLongClickLabel = "Song options",
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    onLongClick()
                },
            ),
    )
}
