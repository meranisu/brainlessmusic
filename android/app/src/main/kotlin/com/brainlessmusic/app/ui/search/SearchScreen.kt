package com.brainlessmusic.app.ui.search

import com.brainlessmusic.app.ui.common.SongListItem
import com.brainlessmusic.app.ui.common.SectionHeading
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.data.remote.dto.AlbumSummaryDto
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.data.remote.dto.GenreSummaryDto
import com.brainlessmusic.app.data.remote.dto.PersonDto
import com.brainlessmusic.app.data.remote.dto.PlaylistSearchDto
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.ui.common.Avatar
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.navigation.TabBarSpace
import com.brainlessmusic.app.ui.people.PersonRow
import com.brainlessmusic.app.ui.profile.SongMenuSheet
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.accentInk
import com.brainlessmusic.app.ui.theme.cardShape
import java.text.Normalizer

/** How many of each kind the All view shows before "See all". */
private const val SONGS_SHOWN = 5
private const val OTHERS_SHOWN = 4

/**
 * Search (Q187): a field with kind chips; before typing, recent searches and genres; on All, a top result and a few of
 * each kind with "See all"; on one kind, its whole list, loading more at the end. Nothing found offers the nearest
 * name and what to try. Matched words are picked out in the results.
 */
@Composable
fun SearchScreen(
    navController: NavHostController,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val query by viewModel.query.collectAsStateWithLifecycle()
    val kind by viewModel.kind.collectAsStateWithLifecycle()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val page by viewModel.page.collectAsStateWithLifecycle()
    val recent by viewModel.recent.collectAsStateWithLifecycle()
    val genres by viewModel.genres.collectAsStateWithLifecycle()
    val focus = LocalFocusManager.current
    var menuFor by remember { mutableStateOf<TrackSummaryDto?>(null) }
    menuFor?.let { track ->
        SongMenuSheet(
            item = viewModel.queueItem(track),
            onDismiss = { menuFor = null },
            onOpenAlbum = { navController.navigate(Routes.albumDetail(it)) },
            onOpenArtist = { navController.navigate(Routes.artistDetail(it)) },
        )
    }
    // Opening a result keeps the search among the recent ones.
    val open: (String) -> Unit = { route ->
        viewModel.remember()
        navController.navigate(route)
    }
    val actions = ResultActions(
        query = query,
        onArtist = { open(Routes.artistDetail(it)) },
        onAlbum = { open(Routes.albumDetail(it)) },
        onPlayAlbum = viewModel::playAlbum,
        onPlaylist = { open(Routes.playlistDetail(it)) },
        onPerson = { open(Routes.profile(it)) },
        onSongMenu = { menuFor = it },
        trackCover = viewModel::trackCoverUrl,
        albumCover = viewModel::albumCoverUrl,
        avatar = viewModel::avatarUrl,
    )

    // No TopAppBar: a text field in its title slot comes out cramped and unstyled.
    Scaffold(bottomBar = { TabBarSpace() }) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            TextField(
                value = query,
                onValueChange = viewModel::onQueryChange,
                placeholder = { Text("Songs, artists, albums, playlists, people") },
                singleLine = true,
                leadingIcon = { Icon(AppIcons.search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { viewModel.onQueryChange("") }) {
                            Icon(AppIcons.clear, contentDescription = "Clear search")
                        }
                    }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    viewModel.remember()
                    focus.clearFocus()
                }),
                colors = TextFieldDefaults.colors(
                    unfocusedIndicatorColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                ),
                shape = MaterialTheme.shapes.extraLarge,
                modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
            )

            if (query.isBlank()) {
                BeforeSearching(
                    recent = recent,
                    genres = genres,
                    onRecent = viewModel::searchFor,
                    onForget = viewModel::forget,
                    onClearRecent = viewModel::clearRecent,
                    onGenre = { navController.navigate(Routes.genreDetail(it)) },
                )
                return@Column
            }

            KindChips(kind, onPick = viewModel::setKind)

            if (kind == SearchKind.ALL) {
                LoadStateContent(
                    state = state,
                    onRetry = viewModel::retry,
                    modifier = Modifier.fillMaxSize(),
                    loadingLabel = "Searching",
                    skeleton = { SkeletonListRows(rows = 8, trailing = true) },
                ) { results: SearchResultsDto ->
                    if (results.isEmpty()) {
                        NothingFound(
                            query = query,
                            suggestion = results.suggestion,
                            kind = kind,
                            onSuggestion = viewModel::searchFor,
                            onAll = { viewModel.setKind(SearchKind.ALL) },
                        )
                    } else {
                        AllResults(results, actions, onSeeAll = viewModel::setKind, onPlayTracks = viewModel::playTracks)
                    }
                }
            } else {
                page?.let { pageState ->
                    LoadStateContent(
                        state = pageState,
                        onRetry = viewModel::retry,
                        modifier = Modifier.fillMaxSize(),
                        loadingLabel = "Searching",
                        skeleton = { SkeletonListRows(rows = 8, trailing = true) },
                    ) { kindResults: KindResults ->
                        if (kindResults.items.isEmpty()) {
                            NothingFound(
                                query = query,
                                suggestion = null,
                                kind = kind,
                                onSuggestion = viewModel::searchFor,
                                onAll = { viewModel.setKind(SearchKind.ALL) },
                            )
                        } else {
                            KindList(kindResults, actions, onLoadMore = viewModel::loadMore, onPlayTracks = viewModel::playTracks)
                        }
                    }
                }
            }
        }
    }
}

private fun SearchResultsDto.isEmpty() =
    artists.isEmpty() && albums.isEmpty() && tracks.isEmpty() && playlists.isNullOrEmpty() && people.isNullOrEmpty()

/** What every result row needs, gathered so the lists stay readable. */
private class ResultActions(
    val query: String,
    val onArtist: (Int) -> Unit,
    val onAlbum: (Int) -> Unit,
    val onPlayAlbum: (Int) -> Unit,
    val onPlaylist: (Int) -> Unit,
    val onPerson: (Int) -> Unit,
    val onSongMenu: (TrackSummaryDto) -> Unit,
    val trackCover: (TrackSummaryDto) -> String?,
    val albumCover: (Int) -> String?,
    val avatar: (PersonDto) -> String?,
)

@Composable
private fun KindChips(selected: SearchKind, onPick: (SearchKind) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        items(SearchKind.entries) { kind ->
            FilterChip(selected = kind == selected, onClick = { onPick(kind) }, label = { Text(kind.label) })
        }
    }
}

// ---- Before typing ----------------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BeforeSearching(
    recent: List<String>,
    genres: List<GenreSummaryDto>,
    onRecent: (String) -> Unit,
    onForget: (String) -> Unit,
    onClearRecent: () -> Unit,
    onGenre: (Int) -> Unit,
) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        if (recent.isEmpty() && genres.isEmpty()) {
            item { CenteredNote(title = "Search your library", body = "Songs, artists, albums, playlists and people. Your recent searches will show here.") }
            return@LazyColumn
        }
        if (recent.isNotEmpty()) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp)) {
                    SectionHeading("Recent searches", Modifier.weight(1f))
                    TextButton(onClick = onClearRecent) { Text("Clear all") }
                }
            }
            items(recent, key = { "recent-$it" }) { q ->
                ListItem(
                    leadingContent = { Icon(AppIcons.history, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    headlineContent = { Text(q, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    trailingContent = {
                        IconButton(onClick = { onForget(q) }) { Icon(AppIcons.close, contentDescription = "Remove “$q” from recent searches") }
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable(onClickLabel = "Search again") { onRecent(q) },
                )
            }
        } else {
            item {
                Text(
                    "Find songs, artists, albums, playlists and people. What you search for shows here next time.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
        if (genres.isNotEmpty()) {
            item { SectionHeading("Browse by genre", Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)) }
            item {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(horizontal = 16.dp),
                ) {
                    genres.forEach { genre ->
                        AssistChip(
                            onClick = { onGenre(genre.id) },
                            label = { Text("${genre.name} · ${genre.trackCount}") },
                        )
                    }
                }
            }
        }
    }
}

// ---- Nothing found ----------------------------------------------------------------------------------------------

@Composable
private fun NothingFound(
    query: String,
    suggestion: String?,
    kind: SearchKind,
    onSuggestion: (String) -> Unit,
    onAll: () -> Unit,
) {
    val what = if (kind == SearchKind.ALL) "anything" else kind.label.lowercase()
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 40.dp),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(72.dp).background(MaterialTheme.colorScheme.surfaceContainerHigh, CircleShape),
        ) {
            Icon(AppIcons.search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(32.dp))
        }
        Text(
            "No $what for “${query.trim()}”",
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp),
        )
        if (suggestion != null) {
            Text(
                "Did you mean",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 16.dp),
            )
            Button(onClick = { onSuggestion(suggestion) }, modifier = Modifier.padding(top = 8.dp)) {
                Text(suggestion, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Text(
            "Check the spelling, try fewer words, or search by the artist or album instead.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp),
        )
        if (kind != SearchKind.ALL) {
            OutlinedButton(onClick = onAll, modifier = Modifier.padding(top = 16.dp)) { Text("Search everything") }
        }
    }
}

@Composable
private fun CenteredNote(title: String, body: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(72.dp).background(MaterialTheme.colorScheme.surfaceContainerHigh, CircleShape),
        ) {
            Icon(AppIcons.search, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

// ---- All kinds --------------------------------------------------------------------------------------------------

@Composable
private fun AllResults(
    results: SearchResultsDto,
    actions: ResultActions,
    onSeeAll: (SearchKind) -> Unit,
    onPlayTracks: (List<TrackSummaryDto>, Int) -> Unit,
) {
    val more = results.hasMore
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        results.top?.let { top ->
            item(key = "top") { TopResultCard(top.kind, top.id, results, actions, onPlayTracks) }
        }
        section(
            title = "Songs",
            key = "track",
            items = results.tracks,
            shown = SONGS_SHOWN,
            hasMore = more?.tracks == true,
            onSeeAll = { onSeeAll(SearchKind.SONGS) },
        ) { index, track -> TrackRow(track, actions, onClick = { onPlayTracks(results.tracks, index) }) }
        section("Artists", "artist", results.artists, OTHERS_SHOWN, more?.artists == true, { onSeeAll(SearchKind.ARTISTS) }) { _, artist ->
            ArtistRow(artist, actions)
        }
        section("Albums", "album", results.albums, OTHERS_SHOWN, more?.albums == true, { onSeeAll(SearchKind.ALBUMS) }) { _, album ->
            AlbumRow(album, actions)
        }
        // Yours first, then other people's public ones (A162).
        section("Playlists", "playlist", results.playlists.orEmpty(), OTHERS_SHOWN, more?.playlists == true, { onSeeAll(SearchKind.PLAYLISTS) }) { _, playlist ->
            PlaylistRow(playlist, actions)
        }
        section("People", "person", results.people.orEmpty(), OTHERS_SHOWN, more?.people == true, { onSeeAll(SearchKind.PEOPLE) }) { _, person ->
            PersonRow(person, actions.avatar(person)) { actions.onPerson(person.id) }
        }
    }
}

/** A kind's heading, its first [shown] items, and "See all" when there are more here or on the server. */
private fun <T> LazyListScope.section(
    title: String,
    key: String,
    items: List<T>,
    shown: Int,
    hasMore: Boolean,
    onSeeAll: () -> Unit,
    row: @Composable (Int, T) -> Unit,
) {
    if (items.isEmpty()) return
    val more = hasMore || items.size > shown
    item(key = "$key-title") {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 12.dp)) {
            SectionHeading(title, Modifier.weight(1f))
            if (more) TextButton(onClick = onSeeAll) { Text("See all") }
        }
    }
    itemsIndexed(items.take(shown), key = { i, _ -> "$key-$i" }) { i, item -> row(i, item) }
}

/** The best match, big, with Play for a song or album and Open for an artist. */
@Composable
private fun TopResultCard(
    kind: String,
    id: Int,
    results: SearchResultsDto,
    actions: ResultActions,
    onPlayTracks: (List<TrackSummaryDto>, Int) -> Unit,
) {
    data class Top(val title: String, val label: String, val cover: @Composable () -> Unit, val open: () -> Unit, val play: (() -> Unit)?)
    val top = when (kind) {
        "track" -> results.tracks.indexOfFirst { it.id == id }.takeIf { it >= 0 }?.let { i ->
            val t = results.tracks[i]
            Top(
                title = t.title,
                label = listOfNotNull("Song", t.artist).joinToString(" · "),
                cover = { CoverImage(actions.trackCover(t), contentDescription = null, modifier = Modifier.size(96.dp)) },
                open = { onPlayTracks(results.tracks, i) },
                play = { onPlayTracks(results.tracks, i) },
            )
        }
        "album" -> results.albums.firstOrNull { it.id == id }?.let { a ->
            Top(
                title = a.title,
                label = listOfNotNull("Album", a.artistName, a.year?.toString()).joinToString(" · "),
                cover = { CoverImage(actions.albumCover(a.id), contentDescription = null, modifier = Modifier.size(96.dp)) },
                open = { actions.onAlbum(a.id) },
                play = { actions.onPlayAlbum(a.id) },
            )
        }
        "artist" -> results.artists.firstOrNull { it.id == id }?.let { a ->
            Top(
                title = a.name,
                label = "Artist · ${songs(a.trackCount)}",
                cover = { Avatar(url = null, name = a.name, size = 96.dp) },
                open = { actions.onArtist(a.id) },
                play = null,
            )
        }
        else -> null
    } ?: return

    Surface(
        onClick = top.open,
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(12.dp)) {
            top.cover()
            Column(Modifier.weight(1f).padding(start = 16.dp)) {
                Text("Top result", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.accentInk)
                Text(
                    highlighted(top.title, actions.query),
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    top.label,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(8.dp))
                if (top.play != null) {
                    Button(onClick = top.play, contentPadding = PaddingValues(horizontal = 16.dp)) {
                        Icon(AppIcons.play, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Play")
                    }
                } else {
                    OutlinedButton(onClick = top.open) { Text("Open artist") }
                }
            }
        }
    }
}

// ---- One kind -----------------------------------------------------------------------------------------------------

@Suppress("UNCHECKED_CAST")
@Composable
private fun KindList(
    results: KindResults,
    actions: ResultActions,
    onLoadMore: () -> Unit,
    onPlayTracks: (List<TrackSummaryDto>, Int) -> Unit,
) {
    val listState = rememberLazyListState()
    // Near the end, the next page.
    LaunchedEffect(listState, results) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { last -> if (last >= results.items.size - 5) onLoadMore() }
    }
    LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        when (results.kind) {
            SearchKind.SONGS -> {
                val tracks = results.items as List<TrackSummaryDto>
                itemsIndexed(tracks, key = { _, t -> "track-${t.id}" }) { i, t -> TrackRow(t, actions, onClick = { onPlayTracks(tracks, i) }) }
            }
            SearchKind.ARTISTS -> items(results.items as List<ArtistSummaryDto>, key = { "artist-${it.id}" }) { ArtistRow(it, actions) }
            SearchKind.ALBUMS -> items(results.items as List<AlbumSummaryDto>, key = { "album-${it.id}" }) { AlbumRow(it, actions) }
            SearchKind.PLAYLISTS -> items(results.items as List<PlaylistSearchDto>, key = { "playlist-${it.id}" }) { PlaylistRow(it, actions) }
            SearchKind.PEOPLE -> items(results.items as List<PersonDto>, key = { "person-${it.id}" }) { p ->
                PersonRow(p, actions.avatar(p)) { actions.onPerson(p.id) }
            }
            SearchKind.ALL -> Unit
        }
        if (results.loadingMore) {
            item(key = "more") {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                }
            }
        } else if (!results.hasMore) {
            item(key = "end") {
                Text(
                    "That's everything for “${actions.query.trim()}”.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                )
            }
        }
    }
}

// ---- Rows ---------------------------------------------------------------------------------------------------------

private fun songs(count: Int) = if (count == 1) "1 song" else "$count songs"

@Composable
private fun TrackRow(track: TrackSummaryDto, actions: ResultActions, onClick: () -> Unit) {
    SongListItem(
        title = highlighted(track.title, actions.query),
        subtitle = highlighted(listOfNotNull(track.artist, track.album).joinToString(" · ").ifEmpty { "Unknown artist" }, actions.query),
        durationSeconds = track.duration,
        onClick = onClick,
        onLongClick = { actions.onSongMenu(track) },
        showCover = true,
        coverUrl = actions.trackCover(track),
        transparent = true,
    )
}

@Composable
private fun ArtistRow(artist: ArtistSummaryDto, actions: ResultActions) {
    ListItem(
        leadingContent = { Avatar(url = null, name = artist.name, size = 44.dp) },
        headlineContent = { Text(highlighted(artist.name, actions.query), maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text("Artist · ${songs(artist.trackCount)} · ${artist.albumCount} album${if (artist.albumCount == 1) "" else "s"}")
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clickable { actions.onArtist(artist.id) },
    )
}

@Composable
private fun AlbumRow(album: AlbumSummaryDto, actions: ResultActions) {
    ListItem(
        leadingContent = { CoverImage(actions.albumCover(album.id), contentDescription = null, modifier = Modifier.size(44.dp)) },
        headlineContent = { Text(highlighted(album.title, actions.query), maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(
                highlighted(listOfNotNull(album.artistName ?: "Unknown artist", album.year?.toString()).joinToString(" · "), actions.query),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
        trailingContent = {
            IconButton(onClick = { actions.onPlayAlbum(album.id) }) { Icon(AppIcons.playCircle, contentDescription = "Play ${album.title}") }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clickable { actions.onAlbum(album.id) },
    )
}

@Composable
private fun PlaylistRow(playlist: PlaylistSearchDto, actions: ResultActions) {
    val count = songs(playlist.trackCount)
    ListItem(
        leadingContent = {
            CoverImage(playlist.coverAlbumIds?.firstOrNull()?.let(actions.albumCover), contentDescription = null, modifier = Modifier.size(44.dp))
        },
        headlineContent = { Text(highlighted(playlist.name, actions.query), maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(
                when {
                    !playlist.isOwner -> "Playlist by ${playlist.ownerName ?: "someone"} · $count"
                    playlist.isPublic -> "Your playlist, public · $count"
                    else -> "Your playlist · $count"
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clickable { actions.onPlaylist(playlist.id) },
    )
}

// ---- Highlighting -------------------------------------------------------------------------------------------------

/** One character as search compares it: no accents, lower case. Keeps a 1:1 index with the original text. */
private fun foldChar(c: Char): Char =
    Normalizer.normalize(c.toString(), Normalizer.Form.NFD).firstOrNull()?.lowercaseChar() ?: c

/** [text] with every word of [query] picked out in bold accent, ignoring case and accents. */
@Composable
private fun highlighted(text: String, query: String): AnnotatedString {
    val style = SpanStyle(fontWeight = FontWeight.Bold, color = MaterialTheme.accentInk)
    return remember(text, query, style) { highlight(text, query, style) }
}

internal fun highlight(text: String, query: String, style: SpanStyle): AnnotatedString {
    val folded = String(CharArray(text.length) { foldChar(text[it]) })
    val marked = BooleanArray(text.length)
    query.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.forEach { word ->
        val w = String(CharArray(word.length) { foldChar(word[it]) })
        var from = folded.indexOf(w)
        while (from >= 0) {
            for (i in from until from + w.length) marked[i] = true
            from = folded.indexOf(w, from + w.length)
        }
    }
    if (marked.none { it }) return AnnotatedString(text)
    return buildAnnotatedString {
        var i = 0
        while (i < text.length) {
            val on = marked[i]
            var j = i
            while (j < text.length && marked[j] == on) j++
            if (on) withStyle(style) { append(text, i, j) } else append(text, i, j)
            i = j
        }
    }
}
