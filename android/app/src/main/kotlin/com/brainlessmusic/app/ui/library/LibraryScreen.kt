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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.paging.LoadState
import androidx.paging.compose.LazyPagingItems
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemKey
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.navigation.AppBottomBar
import com.brainlessmusic.app.ui.navigation.Routes
import kotlinx.coroutines.launch

// The floating tab bar covers the top of the list, so every list starts this far down.
private val TabBarClearance = 68.dp

// Room on the right for the alphabet rail, so a row's duration isn't drawn under it.
private val RailWidth = 28.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    navController: NavHostController,
    onLoggedOut: () -> Unit,
    viewModel: LibraryViewModel = hiltViewModel(),
) {
    val tab by viewModel.tab.collectAsStateWithLifecycle()

    // Hoisted so each tab keeps its scroll position while another is showing.
    val songsState = rememberLazyListState()
    val albumsState = rememberLazyGridState()
    val artistsState = rememberLazyListState()

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
                LibraryTab.SONGS -> SongsTab(viewModel, songsState)
                LibraryTab.ALBUMS -> AlbumsTab(viewModel, navController, albumsState)
                LibraryTab.ARTISTS -> ArtistsTab(viewModel, navController, artistsState)
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

/**
 * Loading, error and empty states for a paged list; [content] draws it once there is something to show.
 * Only the first load is handled here — a later page that fails just leaves its placeholders, and
 * scrolling to them tries again.
 */
@Composable
private fun <T : Any> PagedContent(
    items: LazyPagingItems<T>,
    emptyMessage: String,
    content: @Composable () -> Unit,
) {
    val refresh = items.loadState.refresh
    when {
        refresh is LoadState.Loading && items.itemCount == 0 ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

        refresh is LoadState.Error && items.itemCount == 0 ->
            Column(
                Modifier.fillMaxSize().padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Couldn't load the library. Check your connection.", style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
                OutlinedButton(onClick = { items.retry() }, modifier = Modifier.padding(top = 16.dp)) { Text("Retry") }
            }

        refresh is LoadState.NotLoading && items.itemCount == 0 ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(emptyMessage, style = MaterialTheme.typography.bodyMedium)
            }

        else -> content()
    }
}

@Composable
private fun SongsTab(viewModel: LibraryViewModel, listState: LazyListState) {
    val items = viewModel.songs.collectAsLazyPagingItems()
    val letters by viewModel.letters.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    RegisterRefresh(viewModel, items::refresh)

    PagedContent(items, emptyMessage = "No songs yet — scan your library from the web app.") {
        val firstVisible by remember { derivedStateOf { listState.firstVisibleItemIndex } }
        Box(Modifier.fillMaxSize()) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = TabBarClearance, end = RailWidth),
            ) {
                items(count = items.itemCount, key = items.itemKey { it.id }) { index ->
                    val song = items[index]
                    if (song != null) SongRow(song, onClick = { viewModel.playSongsFrom(index) }) else PlaceholderRow()
                }
            }
            AlphabetRail(
                letters = letters[LibraryTab.SONGS].orEmpty(),
                firstVisibleIndex = firstVisible,
                onJump = { scope.launch { listState.scrollToItem(it) } },
                topInset = TabBarClearance,
            )
            // Plays everything, not just what is on screen: the server shuffles the whole library.
            ExtendedFloatingActionButton(
                onClick = viewModel::shuffleAll,
                icon = { Icon(Icons.Filled.Shuffle, contentDescription = null) },
                text = { Text("Shuffle all") },
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = RailWidth + 12.dp, bottom = 16.dp),
            )
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

/** Same height as a real row, so the list does not jump when a page arrives. */
@Composable
private fun PlaceholderRow() {
    Box(Modifier.fillMaxWidth().height(72.dp))
}

@Composable
private fun AlbumsTab(viewModel: LibraryViewModel, navController: NavHostController, gridState: LazyGridState) {
    val items = viewModel.albums.collectAsLazyPagingItems()
    val letters by viewModel.letters.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    RegisterRefresh(viewModel, items::refresh)

    PagedContent(items, emptyMessage = "No albums yet — scan your library from the web app.") {
        val firstVisible by remember { derivedStateOf { gridState.firstVisibleItemIndex } }
        Box(Modifier.fillMaxSize()) {
            LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Adaptive(minSize = 140.dp),
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp + RailWidth, top = TabBarClearance + 4.dp, bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(count = items.itemCount, key = items.itemKey { it.id }) { index ->
                    val album = items[index]
                    if (album != null) {
                        AlbumCard(
                            album = album,
                            coverUrl = viewModel.albumCoverUrl(album.id),
                            onClick = { navController.navigate(Routes.albumDetail(album.id)) },
                        )
                    } else {
                        Box(Modifier.fillMaxWidth().aspectRatio(0.8f))
                    }
                }
            }
            AlphabetRail(
                letters = letters[LibraryTab.ALBUMS].orEmpty(),
                firstVisibleIndex = firstVisible,
                onJump = { scope.launch { gridState.scrollToItem(it) } },
                topInset = TabBarClearance,
            )
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
private fun ArtistsTab(viewModel: LibraryViewModel, navController: NavHostController, listState: LazyListState) {
    val items = viewModel.artists.collectAsLazyPagingItems()
    val letters by viewModel.letters.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    RegisterRefresh(viewModel, items::refresh)

    PagedContent(items, emptyMessage = "No artists yet — scan your library from the web app.") {
        val firstVisible by remember { derivedStateOf { listState.firstVisibleItemIndex } }
        Box(Modifier.fillMaxSize()) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = TabBarClearance, end = RailWidth),
            ) {
                items(count = items.itemCount, key = items.itemKey { it.id }) { index ->
                    val artist = items[index]
                    if (artist != null) {
                        ArtistRow(artist, onClick = { navController.navigate(Routes.artistDetail(artist.id)) })
                    } else {
                        PlaceholderRow()
                    }
                }
            }
            AlphabetRail(
                letters = letters[LibraryTab.ARTISTS].orEmpty(),
                firstVisibleIndex = firstVisible,
                onJump = { scope.launch { listState.scrollToItem(it) } },
                topInset = TabBarClearance,
            )
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

/** Lets the top-bar Refresh reach whichever list is showing. */
@Composable
private fun RegisterRefresh(viewModel: LibraryViewModel, refresh: () -> Unit) {
    DisposableEffect(refresh) {
        viewModel.registerRefresh(refresh)
        onDispose { }
    }
}
