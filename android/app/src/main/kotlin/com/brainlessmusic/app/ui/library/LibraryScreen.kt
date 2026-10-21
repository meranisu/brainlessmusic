package com.brainlessmusic.app.ui.library

import com.brainlessmusic.app.ui.common.AlbumCard
import com.brainlessmusic.app.ui.common.SongListItem
import com.brainlessmusic.app.ui.common.Notices
import com.brainlessmusic.app.ui.common.LargeFace
import com.brainlessmusic.app.ui.common.SkinFab
import com.brainlessmusic.app.ui.common.SkinTabBar
import com.brainlessmusic.app.ui.profile.SongListKind
import com.brainlessmusic.app.ui.profile.PlaylistsTab
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.common.GearDifficultyColors
import com.brainlessmusic.app.ui.common.GearInk
import com.brainlessmusic.app.ui.common.RingDifficulties
import com.brainlessmusic.app.ui.common.RingInk
import com.brainlessmusic.app.ui.common.RingSky
import com.brainlessmusic.app.ui.common.RingYellow
import androidx.compose.ui.graphics.Color
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.flow.filter
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.paging.LoadState
import androidx.paging.compose.LazyPagingItems
import androidx.paging.compose.collectAsLazyPagingItems
import com.brainlessmusic.app.data.paging.SavedPageState
import androidx.paging.compose.itemKey
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.ui.common.Skeleton
import com.brainlessmusic.app.ui.common.SkeletonAlbumGrid
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.TabBarSpace
import com.brainlessmusic.app.ui.navigation.TabReselect
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.profile.SongMenuSheet
import kotlinx.coroutines.launch
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.rowShape
import com.brainlessmusic.app.ui.common.dockedHeader
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CutCornerShape

// The floating header (tabs, or the search field) covers the top of the list, so every list starts this far down.
private val TabBarClearance = 68.dp

// The tab pill, the search field and the round buttons beside them share one height, so swapping them doesn't jump.
private val HeaderHeight = 48.dp

// Rows end before the alphabet rail, so a row's duration isn't drawn under it.
private val ListEndPadding = RailWidth

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    navController: NavHostController,
    viewModel: LibraryViewModel = hiltViewModel(),
) {
    val tab by viewModel.tab.collectAsStateWithLifecycle()
    val filter by viewModel.songFilter.collectAsStateWithLifecycle()
    // Survives rotation; reopens if a filter is still applied when the screen comes back.
    var searching by rememberSaveable { mutableStateOf(filter.isNotBlank()) }
    val scope = rememberCoroutineScope()

    // Hoisted so each tab keeps its scroll position while another is showing.
    val songsState = rememberLazyListState()
    val albumsState = rememberLazyGridState()
    val artistsState = rememberLazyListState()

    // Library tapped again: the open tab goes back to its top.
    val currentTab by rememberUpdatedState(tab)
    LaunchedEffect(Unit) {
        TabReselect.events.filter { it == Routes.ARTISTS }.collect {
            when (currentTab) {
                LibraryTab.SONGS -> songsState.scrollToTop()
                LibraryTab.ALBUMS -> albumsState.scrollToTop()
                LibraryTab.ARTISTS -> artistsState.scrollToTop()
                LibraryTab.PLAYLISTS -> Unit
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                // The mark lives beside the wordmark in Settings now (owner, 2026-10-11).
                title = { Text("Library") },
            )
        },
        bottomBar = { TabBarSpace() },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                LibraryTab.SONGS -> SongsTab(viewModel, navController, songsState)
                LibraryTab.ALBUMS -> AlbumsTab(viewModel, navController, albumsState)
                LibraryTab.ARTISTS -> ArtistsTab(viewModel, navController, artistsState)
                LibraryTab.PLAYLISTS -> PlaylistsTab(
                    topInset = TabBarClearance,
                    bottomInset = fabClearance(LibraryTab.PLAYLISTS),
                    onOpenLiked = { navController.navigate(Routes.songList(SongListKind.LIKED.route)) { launchSingleTop = true } },
                    onOpenDisliked = { navController.navigate(Routes.songList(SongListKind.LESS_OFTEN.route)) { launchSingleTop = true } },
                    onOpenPlaylist = { id -> navController.navigate(Routes.playlistDetail(id)) { launchSingleTop = true } },
                )
            }
            // A flat band in the page colour behind the header: rows end cleanly at its edge instead of showing beside the pills.
            // Docked (Lane), it is the header's own strip, closed by an edge line.
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(TabBarClearance)
                    .background(if (dockedHeader) MaterialTheme.colorScheme.surfaceContainer else MaterialTheme.colorScheme.background),
            ) {
                if (dockedHeader) {
                    Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))
                }
            }
            LibraryHeader(
                tab = tab,
                onSelectTab = viewModel::selectTab,
                searching = searching,
                filter = filter,
                onOpenSearch = {
                    // The filter narrows Songs only, so searching from another tab goes to Songs.
                    viewModel.selectTab(LibraryTab.SONGS)
                    searching = true
                },
                onFilterChange = { text ->
                    viewModel.setSongFilter(text)
                    scope.launch { songsState.scrollToItem(0) }
                },
                onCloseSearch = {
                    searching = false
                    if (filter.isNotEmpty()) {
                        viewModel.setSongFilter("")
                        scope.launch { songsState.scrollToItem(0) }
                    }
                },
                modifier = Modifier.align(Alignment.TopCenter).padding(top = 8.dp, start = 16.dp, end = 16.dp),
            )
            // Listen together moved here from Home as an icon (owner, 2026-10-21), on top of Shuffle on the Songs tab
            // and alone on the others.
            Column(
                verticalArrangement = Arrangement.spacedBy(FabGap),
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = ListEndPadding + 8.dp, bottom = FabBottom),
            ) {
                SkinFab(
                    icon = AppIcons.headphones,
                    description = "Listen together",
                    onClick = { navController.navigate(Routes.TOGETHER) { launchSingleTop = true } },
                    large = true,
                )
                if (tab == LibraryTab.SONGS) {
                    // Plays everything, not just what is on screen: the server shuffles the whole library.
                    SkinFab(
                        icon = AppIcons.shuffle,
                        description = "Shuffle all",
                        onClick = { viewModel.shuffleAll { Notices.show(it) } },
                        large = true,
                    )
                }
            }
        }
    }
}

private val FabGap = 12.dp
private val FabBottom = 16.dp

/** Room under a tab's last row for the buttons over it: one on most tabs, two on Songs, and a gap. */
private fun fabClearance(tab: LibraryTab): Dp {
    val buttons = if (tab == LibraryTab.SONGS) 2 else 1
    return FabBottom + LargeFace * buttons + FabGap * (buttons - 1) + 8.dp
}

// From deep in a long list, jump most of the way first so the animation is a short glide, not a long scroll.
private suspend fun LazyListState.scrollToTop() {
    if (firstVisibleItemIndex > 20) scrollToItem(20)
    animateScrollToItem(0)
}

private suspend fun LazyGridState.scrollToTop() {
    if (firstVisibleItemIndex > 40) scrollToItem(40)
    animateScrollToItem(0)
}

/**
 * The tab pill with a round search button beside it. Search swaps the pill for a field with a round close button,
 * which brings the tabs back and drops the filter. System back closes it too.
 */
@Composable
private fun LibraryHeader(
    tab: LibraryTab,
    onSelectTab: (LibraryTab) -> Unit,
    searching: Boolean,
    filter: String,
    onOpenSearch: () -> Unit,
    onFilterChange: (String) -> Unit,
    onCloseSearch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BackHandler(enabled = searching, onBack = onCloseSearch)
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (searching) {
            SongFilterField(text = filter, onChange = onFilterChange, modifier = Modifier.weight(1f))
            HeaderButton(AppIcons.close, "Close search", onCloseSearch)
        } else {
            // Lane's, Gear's and Ring's tabs stretch to fill, so they get only the space beside the search button; unbounded,
            // Ring's chips took the whole row and pushed it off screen.
            val stretched = dockedHeader || LocalSkin.current == Skin.RING
            LibraryTabBar(selected = tab, onSelect = onSelectTab, modifier = if (stretched) Modifier.weight(1f) else Modifier)
            HeaderButton(AppIcons.search, "Search songs", onOpenSearch)
        }
    }
}

/** Round, in the pill's colours and border, so it reads as part of the same bar; a hexagon in Lane, as its buttons are. */
@Composable
private fun HeaderButton(icon: ImageVector, description: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = if (dockedHeader) CutCornerShape(50) else CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.size(HeaderHeight),
    ) {
        Box(contentAlignment = Alignment.Center) { Icon(icon, contentDescription = description) }
    }
}

/** The skin's tab bar over the list, floating rather than in the layout, so content scrolls under it. */
@Composable
private fun LibraryTabBar(selected: LibraryTab, onSelect: (LibraryTab) -> Unit, modifier: Modifier = Modifier) {
    SkinTabBar(
        labels = LibraryTab.entries.map { it.label },
        selected = selected.ordinal,
        onSelect = { onSelect(LibraryTab.entries[it]) },
        modifier = modifier,
    )
}

/**
 * Loading, error and empty states for a paged list's first load; a later page that fails retries on scroll. The
 * first load shows [skeleton], read out as [loadingLabel]. A loaded list refreshes on a pull down, with the spinner
 * below whatever floats over the list's top ([topInset]).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T : Any> PagedContent(
    items: LazyPagingItems<T>,
    emptyMessage: String,
    onRefresh: () -> Unit,
    topInset: Dp,
    loadingLabel: String,
    savedState: SavedPageState = SavedPageState.NONE,
    skeleton: @Composable () -> Unit,
    content: @Composable () -> Unit,
) {
    val refresh = items.loadState.refresh
    when {
        refresh is LoadState.Loading && items.itemCount == 0 -> Skeleton(loadingLabel) { skeleton() }

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

        else -> {
            // Spins from the pull until the reload settles; Paging always passes through Loading on a refresh.
            var pulled by remember { mutableStateOf(false) }
            val reloading = refresh is LoadState.Loading
            val context = LocalContext.current
            LaunchedEffect(reloading) {
                if (reloading) return@LaunchedEffect
                // The old rows stay up on a failed refresh, so without this it looks like it worked.
                if (pulled && refresh is LoadState.Error) Notices.show("Couldn't refresh. Check your connection.")
                pulled = false
            }
            val pullState = rememberPullToRefreshState()
            PullToRefreshBox(
                isRefreshing = pulled,
                onRefresh = {
                    pulled = true
                    onRefresh()
                    items.refresh()
                },
                state = pullState,
                indicator = {
                    PullToRefreshDefaults.Indicator(
                        state = pullState,
                        isRefreshing = pulled,
                        modifier = Modifier.align(Alignment.TopCenter).padding(top = topInset),
                    )
                },
                modifier = Modifier.fillMaxSize(),
            ) {
                content()
                // The phone's copy is on screen: a change made elsewhere may be about to show up.
                if (savedState != SavedPageState.NONE) {
                    Text(
                        if (savedState == SavedPageState.UPDATING) "Updating…" else "Couldn't refresh",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(top = topInset + 4.dp)
                            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(50))
                            .padding(horizontal = 10.dp, vertical = 3.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun SongsTab(viewModel: LibraryViewModel, navController: NavHostController, listState: LazyListState) {
    val context = LocalContext.current
    var menuFor by remember { mutableStateOf<TrackSummaryDto?>(null) }
    menuFor?.let { track ->
        SongMenuSheet(
            item = viewModel.queueItem(track),
            onDismiss = { menuFor = null },
            onOpenAlbum = { navController.navigate(Routes.albumDetail(it)) },
            onOpenArtist = { navController.navigate(Routes.artistDetail(it)) },
        )
    }
    val items = viewModel.songs.collectAsLazyPagingItems()
    val letters by viewModel.letters.collectAsStateWithLifecycle()
    val filter by viewModel.songFilter.collectAsStateWithLifecycle()
    val filtering = filter.isNotBlank()
    val scope = rememberCoroutineScope()

    PagedContent(
        items,
        emptyMessage = if (filtering) "No songs match \"${filter.trim()}\"." else "No songs yet. Scan your library from the web app.",
        onRefresh = { viewModel.reloadLetters(LibraryTab.SONGS) },
        topInset = TabBarClearance,
        loadingLabel = "Loading songs",
        savedState = viewModel.savedPageState(LibraryTab.SONGS).collectAsStateWithLifecycle().value,
        skeleton = {
            SkeletonListRows(trailing = true, contentPadding = PaddingValues(top = TabBarClearance, end = ListEndPadding))
        },
    ) {
        Box(Modifier.fillMaxSize()) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = TabBarClearance, end = ListEndPadding, bottom = fabClearance(LibraryTab.SONGS)),
            ) {
                items(count = items.itemCount, key = items.itemKey { it.track.id }) { index ->
                    val row = items[index]
                    if (row != null) {
                        SongRow(
                            row.track,
                            onClick = { viewModel.playSongsFrom(index, row) },
                            onLongClick = { menuFor = row.track },
                        )
                    } else {
                        PlaceholderRow()
                    }
                }
            }
            // The letters index the whole library, so they would point at the wrong rows of a filtered list; while
            // filtering, the rail is a plain scroll bar.
            AlphabetRail(
                letters = if (filtering) emptyList() else letters[LibraryTab.SONGS].orEmpty(),
                state = listState,
                onJump = { scope.launch { listState.scrollToItem(it) } },
                topInset = TabBarClearance,
            )
        }
    }
}

/** Takes the tab bar's place while searching. Narrows the Songs list by title, artist or album, on the server. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SongFilterField(text: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val focusManager = LocalFocusManager.current
    // Closing the keyboard with back leaves the field focused and its cursor blinking; let it go with the keyboard.
    val imeVisible = WindowInsets.isImeVisible
    LaunchedEffect(imeVisible) { if (!imeVisible) focusManager.clearFocus() }
    // Opening search is a request to type, so the keyboard comes up with the field, but not again on rotation.
    val focusRequester = remember { FocusRequester() }
    var focusedOnce by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!focusedOnce) {
            focusedOnce = true
            focusRequester.requestFocus()
        }
    }
    Surface(
        modifier = modifier.height(HeaderHeight),
        shape = if (dockedHeader) MaterialTheme.shapes.medium else CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 14.dp)) {
            Icon(AppIcons.search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Box(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                if (text.isEmpty()) {
                    Text("Filter songs", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                BasicTextField(
                    value = text,
                    onValueChange = onChange,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() }),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequester)
                        .semantics { contentDescription = "Filter songs" },
                )
            }
            if (text.isNotEmpty()) {
                IconButton(onClick = { onChange("") }) {
                    Icon(AppIcons.close, contentDescription = "Clear filter")
                }
            }
        }
    }
}

@Composable
private fun SongRow(song: TrackSummaryDto, onClick: () -> Unit, onLongClick: () -> Unit) {
    SongListItem(
        title = AnnotatedString(song.title),
        subtitle = AnnotatedString(listOfNotNull(song.artist, song.album).joinToString(" · ").ifEmpty { "Unknown artist" }),
        durationSeconds = song.duration,
        onClick = onClick,
        onLongClick = onLongClick,
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
    PagedContent(
        items,
        emptyMessage = "No albums yet. Scan your library from the web app.",
        onRefresh = { viewModel.reloadLetters(LibraryTab.ALBUMS) },
        topInset = TabBarClearance,
        loadingLabel = "Loading albums",
        savedState = viewModel.savedPageState(LibraryTab.ALBUMS).collectAsStateWithLifecycle().value,
        skeleton = { SkeletonAlbumGrid(contentPadding = AlbumGridPadding) },
    ) {
        Box(Modifier.fillMaxSize()) {
            LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Adaptive(minSize = 140.dp),
                contentPadding = AlbumGridPadding,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                // Genres live behind this rather than a fifth tab: every skin's tab bar is full (v0.4 box 28).
                item(key = "by-genre", span = { GridItemSpan(maxLineSpan) }) {
                    OutlinedButton(onClick = { navController.navigate(Routes.GENRES) }) {
                        Text("By genre")
                    }
                }
                items(count = items.itemCount, key = items.itemKey { it.id }) { index ->
                    val album = items[index]
                    if (album != null) {
                        AlbumCard(
                            album = album,
                            coverUrl = viewModel.albumCoverUrl(album.id),
                            subtitle = album.artistName ?: "Unknown artist",
                            onClick = { navController.navigate(Routes.albumDetail(album.id)) },
                        )
                    } else {
                        Box(Modifier.fillMaxWidth().aspectRatio(0.8f))
                    }
                }
            }
            AlphabetRail(
                letters = letters[LibraryTab.ALBUMS].orEmpty(),
                state = gridState,
                // +1 for the By genre row above the albums.
                onJump = { scope.launch { gridState.scrollToItem(it + 1) } },
                topInset = TabBarClearance,
            )
        }
    }
}

/** Shared by the grid and its skeleton, so the placeholder covers sit where the real ones will. */
private val AlbumGridPadding = PaddingValues(start = 12.dp, end = 4.dp + ListEndPadding, top = TabBarClearance + 4.dp, bottom = fabClearance(LibraryTab.ALBUMS))

@Composable
private fun ArtistsTab(viewModel: LibraryViewModel, navController: NavHostController, listState: LazyListState) {
    val items = viewModel.artists.collectAsLazyPagingItems()
    val letters by viewModel.letters.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    PagedContent(
        items,
        emptyMessage = "No artists yet. Scan your library from the web app.",
        onRefresh = { viewModel.reloadLetters(LibraryTab.ARTISTS) },
        topInset = TabBarClearance,
        loadingLabel = "Loading artists",
        savedState = viewModel.savedPageState(LibraryTab.ARTISTS).collectAsStateWithLifecycle().value,
        skeleton = { SkeletonListRows(contentPadding = PaddingValues(top = TabBarClearance, end = ListEndPadding)) },
    ) {
        Box(Modifier.fillMaxSize()) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = TabBarClearance, end = ListEndPadding, bottom = fabClearance(LibraryTab.ARTISTS)),
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
                state = listState,
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

