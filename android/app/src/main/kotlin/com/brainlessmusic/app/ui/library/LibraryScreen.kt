package com.brainlessmusic.app.ui.library

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.navigation.AppBottomBar
import com.brainlessmusic.app.ui.navigation.Routes

// The floating tab bar covers the top of the list, so every list starts this far down.
private val TabBarClearance = 68.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    navController: NavHostController,
    onLoggedOut: () -> Unit,
    viewModel: LibraryViewModel = hiltViewModel(),
) {
    val tab by viewModel.tab.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Library") },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = { navController.navigate(Routes.SETTINGS) }) {
                        Icon(Icons.Filled.Settings, contentDescription = "Settings")
                    }
                    IconButton(onClick = { viewModel.logout(onLoggedOut) }) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Log out")
                    }
                },
            )
        },
        bottomBar = { AppBottomBar(navController) },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                LibraryTab.SONGS -> SongsTab(viewModel)
                LibraryTab.ALBUMS -> AlbumsTab(viewModel, navController)
                LibraryTab.ARTISTS -> ArtistsTab(viewModel, navController)
                LibraryTab.GENRES -> GenresTab()
            }
            LibraryTabBar(
                selected = tab,
                onSelect = viewModel::selectTab,
                modifier = Modifier.align(Alignment.TopCenter).padding(top = 8.dp),
            )
        }
    }
}

/** A pill that floats over the list rather than sitting in the layout, so content scrolls under it. */
@Composable
private fun LibraryTabBar(selected: LibraryTab, onSelect: (LibraryTab) -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        tonalElevation = 3.dp,
        shadowElevation = 6.dp,
    ) {
        Row(modifier = Modifier.padding(4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            LibraryTab.entries.forEach { tab ->
                val isSelected = tab == selected
                Surface(
                    shape = CircleShape,
                    color = if (isSelected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh,
                    contentColor = if (isSelected) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.selectable(selected = isSelected, role = Role.Tab, onClick = { onSelect(tab) }),
                ) {
                    Text(
                        text = tab.label,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun SongsTab(viewModel: LibraryViewModel) {
    val state by viewModel.songs.collectAsStateWithLifecycle()
    LoadStateContent(
        state = state,
        onRetry = viewModel::refresh,
        isEmpty = { it.items.isEmpty() },
        emptyMessage = "No songs yet — scan your library from the web app.",
    ) { songs ->
        val listState = rememberLazyListState()
        LoadMoreOnScroll(listState, itemCount = songs.items.size, onLoadMore = viewModel::loadMoreSongs)
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(top = TabBarClearance)) {
            itemsIndexed(songs.items, key = { _, song -> song.id }) { index, song ->
                SongRow(song, onClick = { viewModel.playSongs(songs.items, index) })
            }
        }
    }
}

@Composable
private fun SongRow(song: TrackSummaryDto, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(song.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(
                listOfNotNull(song.artist, song.album).joinToString(" · ").ifEmpty { "Unknown artist" },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
            )
        },
        trailingContent = { Text(formatDuration(song.duration), style = MaterialTheme.typography.bodySmall) },
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    )
}

@Composable
private fun AlbumsTab(viewModel: LibraryViewModel, navController: NavHostController) {
    val state by viewModel.albums.collectAsStateWithLifecycle()
    LoadStateContent(
        state = state,
        onRetry = viewModel::refresh,
        isEmpty = { it.items.isEmpty() },
        emptyMessage = "No albums yet — scan your library from the web app.",
    ) { albums ->
        val gridState = rememberLazyGridState()
        LoadMoreOnScroll(gridState, itemCount = albums.items.size, onLoadMore = viewModel::loadMoreAlbums)
        LazyVerticalGrid(
            state = gridState,
            columns = GridCells.Adaptive(minSize = 140.dp),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = TabBarClearance + 4.dp, bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(albums.items, key = { it.id }) { album ->
                AlbumCard(
                    album = album,
                    coverUrl = viewModel.albumCoverUrl(album.id),
                    onClick = { navController.navigate(Routes.albumDetail(album.id)) },
                )
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
            modifier = Modifier.fillMaxWidth().aspectRatio(1f),
        )
        Text(
            text = album.title,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(
            text = album.artistName ?: "Unknown artist",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ArtistsTab(viewModel: LibraryViewModel, navController: NavHostController) {
    val state by viewModel.artists.collectAsStateWithLifecycle()
    LoadStateContent(
        state = state,
        onRetry = viewModel::refresh,
        isEmpty = { it.isEmpty() },
        emptyMessage = "No artists yet — scan your library from the web app.",
    ) { artists ->
        LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(top = TabBarClearance)) {
            items(artists, key = { it.id }) { artist ->
                ArtistRow(artist, onClick = { navController.navigate(Routes.artistDetail(artist.id)) })
            }
        }
    }
}

@Composable
private fun ArtistRow(artist: ArtistSummaryDto, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(artist.name) },
        supportingContent = {
            Text(
                "${artist.albumCount} album${if (artist.albumCount == 1) "" else "s"} · ${artist.trackCount} track${if (artist.trackCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodySmall,
            )
        },
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    )
}

/** The server does not read genre tags yet (no column, no scanner extraction, no endpoint) — see A22 in QUESTIONS.md. */
@Composable
private fun GenresTab() {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(
            "Genres aren't available yet.\nThe server doesn't read genre tags from your files so far.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Asks for the next page once the last visible row is within a screen of the end. */
@Composable
private fun LoadMoreOnScroll(state: LazyListState, itemCount: Int, onLoadMore: () -> Unit) {
    LaunchedEffect(state, itemCount) {
        snapshotFlow { state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { last -> if (last >= itemCount - LOAD_MORE_MARGIN) onLoadMore() }
    }
}

@Composable
private fun LoadMoreOnScroll(state: LazyGridState, itemCount: Int, onLoadMore: () -> Unit) {
    LaunchedEffect(state, itemCount) {
        snapshotFlow { state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { last -> if (last >= itemCount - LOAD_MORE_MARGIN) onLoadMore() }
    }
}

private const val LOAD_MORE_MARGIN = 20
