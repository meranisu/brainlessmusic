package com.brainlessmusic.app.ui.profile

import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.data.remote.dto.HistoryEntryDto
import com.brainlessmusic.app.data.remote.dto.ProfileCountsDto
import com.brainlessmusic.app.data.remote.dto.TopTrackDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.StatsRange
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonLead
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.AppBottomBar
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.theme.DisplayFontFamily
import java.util.Calendar

// Flat outlined cards, like Settings and the Library header (DESIGN.md, Android).
private val CardShape = RoundedCornerShape(20.dp)

// Wide enough for "10" in the display face, so every title in a list starts at the same x.
private val RankWidth = 32.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YouScreen(
    navController: NavHostController,
    onOpenArtist: (Int) -> Unit,
    onOpenAlbum: (Int) -> Unit,
    onOpenLiked: () -> Unit,
    onOpenLessOften: () -> Unit,
    onOpenPlaylists: () -> Unit,
    viewModel: YouViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val range by viewModel.range.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    val username by viewModel.username.collectAsStateWithLifecycle()
    val recent by viewModel.recent.collectAsStateWithLifecycle()
    val switching by viewModel.switching.collectAsStateWithLifecycle()
    // Picking another range keeps this one up, faded, until the new numbers land.
    val rangeAlpha by animateFloatAsState(if (switching) 0.5f else 1f, label = "rangeAlpha")
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.onResume() }

    var menuFor by remember { mutableStateOf<QueueItem?>(null) }
    menuFor?.let { item -> SongMenuSheet(item = item, onDismiss = { menuFor = null }, onOpenAlbum = onOpenAlbum, onOpenArtist = onOpenArtist) }

    val context = LocalContext.current
    val shuffle = { viewModel.shuffleLibrary { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() } }
    val together = { navController.navigate(Routes.TOGETHER) { launchSingleTop = true } }

    val title = greeting(Calendar.getInstance().get(Calendar.HOUR_OF_DAY), if (viewModel.isGuest) null else username)

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) })
        },
        bottomBar = { AppBottomBar(navController) },
    ) { padding ->
        if (viewModel.isGuest) {
            // No stats for guests (A98), so the library and some random picks to start from.
            GuestHomeList(viewModel, refreshing, onOpenAlbum, onMenu = { menuFor = it }, shuffle, together, Modifier.padding(padding))
            return@Scaffold
        }
        Column(Modifier.padding(padding)) {
            LoadStateContent(
                state = state,
                onRetry = viewModel::load,
                modifier = Modifier.weight(1f),
                loadingLabel = "Loading your stats",
                skeleton = { SkeletonListRows(lead = SkeletonLead.COVER, trailing = true) },
            ) { stats: UserStatsDto ->
                // Rank changes only mean something when the server compared with a window before that had plays (A91);
                // with nothing played then, every song would read NEW.
                val compared = (stats.previousTotals?.plays ?: 0) > 0
                val ofRange = Modifier.graphicsLayer { alpha = rangeAlpha }
                PullToRefreshBox(isRefreshing = refreshing, onRefresh = viewModel::refresh) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 16.dp),
                    ) {
                        // Who you are, the two ways to start, your library, then what you've played (owner's order,
                        // 2026-10-11; Shuffle and Listen together moved here from the top bar the same day).
                        item { Box(ofRange) { PlayerCard(username, stats, range) } }
                        item { StartRow(onShuffle = shuffle, onTogether = together) }
                        item { LibraryTiles(stats.counts, onOpenLiked, onOpenPlaylists, onOpenLessOften) }
                        item { RangePicker(range, viewModel::setRange) }

                        if (recent.isNotEmpty()) {
                            item { SectionTitle("Recently played") }
                            item {
                                RecentRow(
                                    recent = recent,
                                    coverUrl = viewModel::trackCoverUrl,
                                    onPlay = { index -> viewModel.playRecent(recent, index) },
                                    onMenu = { menuFor = viewModel.queueItem(it) },
                                )
                            }
                        }

                        item { SectionTitle("Top songs") }
                        item {
                            Box(ofRange) {
                                ListCard {
                                    if (stats.topTracks.isEmpty()) EmptyLine(emptyTopSongs(range))
                                    stats.topTracks.forEachIndexed { index, top ->
                                        key(top.track.id) {
                                            if (index == 0) {
                                                TopSongHero(
                                                    top = top,
                                                    coverUrl = viewModel.trackCoverUrl(top.track.id),
                                                    movement = movement(1, top.previousRank, compared),
                                                    onClick = { viewModel.playTop(stats, 0) },
                                                    onLongClick = { menuFor = viewModel.queueItem(top.track) },
                                                )
                                            } else {
                                                RankedRow(
                                                    rank = index + 1,
                                                    coverUrl = viewModel.trackCoverUrl(top.track.id),
                                                    title = top.track.title,
                                                    subtitle = top.track.artist ?: "Unknown artist",
                                                    plays = top.plays,
                                                    msListened = top.msListened,
                                                    movement = movement(index + 1, top.previousRank, compared),
                                                    onClick = { viewModel.playTop(stats, index) },
                                                    onLongClick = { menuFor = viewModel.queueItem(top.track) },
                                                )
                                            }
                                        }
                                    }
                                    if (stats.topTracks.isNotEmpty()) {
                                        CardActions(
                                            onPlay = { viewModel.playAllTop(stats, shuffle = false) },
                                            onShuffle = { viewModel.playAllTop(stats, shuffle = true) },
                                            what = "top songs",
                                        )
                                    }
                                }
                            }
                        }

                        if (stats.topArtists.isNotEmpty()) {
                            item { SectionTitle("Top artists") }
                            item {
                                Box(ofRange) {
                                    ListCard {
                                        stats.topArtists.forEachIndexed { index, artist ->
                                            key(artist.id) {
                                                RankedRow(
                                                    rank = index + 1,
                                                    coverUrl = null,
                                                    title = artist.name,
                                                    subtitle = null,
                                                    plays = artist.plays,
                                                    msListened = artist.msListened,
                                                    movement = movement(index + 1, artist.previousRank, compared),
                                                    onClick = { onOpenArtist(artist.id) },
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** A guest's Home: what the library holds, then songs and albums picked at random. Pull or New picks rerolls them. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GuestHomeList(
    viewModel: YouViewModel,
    refreshing: Boolean,
    onOpenAlbum: (Int) -> Unit,
    onMenu: (QueueItem) -> Unit,
    onShuffle: () -> Unit,
    onTogether: () -> Unit,
    modifier: Modifier,
) {
    val state by viewModel.guest.collectAsStateWithLifecycle()
    LoadStateContent(
        state = state,
        onRetry = { viewModel.loadGuest() },
        modifier = modifier,
        loadingLabel = "Loading the library",
        skeleton = { SkeletonListRows(lead = SkeletonLead.COVER) },
    ) { home: GuestHome ->
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = viewModel::refresh) {
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                item { GuestCard(home) }
                item { StartRow(onShuffle = onShuffle, onTogether = onTogether) }
                if (home.picks.isEmpty()) {
                    item { EmptyLine("Nothing in the library yet. Songs show up here once the server has some.") }
                } else {
                    item {
                        SectionTitle("Songs to try") {
                            IconButton(onClick = viewModel::refresh) {
                                Icon(Icons.Filled.Refresh, contentDescription = "New picks")
                            }
                        }
                    }
                    item {
                        CoverRow(
                            items = home.picks,
                            key = { it.id },
                            cover = { viewModel.trackCoverUrl(it.id) },
                            title = { it.title },
                            subtitle = { it.artist ?: "Unknown artist" },
                            onClick = { index -> viewModel.playPick(home.picks, index) },
                            onLongClick = { onMenu(viewModel.queueItem(it)) },
                        )
                    }
                }
                if (home.albumPicks.isNotEmpty()) {
                    item { SectionTitle("Albums to try") }
                    item {
                        CoverRow(
                            items = home.albumPicks,
                            key = { it.id },
                            cover = { viewModel.albumCoverUrl(it.id) },
                            title = { it.title },
                            subtitle = { it.artist ?: "Unknown artist" },
                            onClick = { index -> onOpenAlbum(home.albumPicks[index].id) },
                            onClickLabel = "Open album",
                        )
                    }
                }
            }
        }
    }
}

/**
 * The player card's guest version: no name or listening numbers to show, so the library's size instead, and why
 * nothing of theirs is kept.
 */
@Composable
private fun GuestCard(home: GuestHome) {
    Surface(
        shape = CardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar {
                    Icon(
                        Icons.Filled.Person,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(24.dp),
                    )
                }
                Column(Modifier.padding(start = 12.dp)) {
                    Text("Guest", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Plays, likes and playlists are only kept for accounts.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Text(
                "In this library",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 4.dp),
            )
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                BigStat("%,d".format(home.songs), if (home.songs == 1) "song" else "songs", Modifier.weight(1f))
                VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.fillMaxHeight())
                BigStat("%,d".format(home.albums), if (home.albums == 1) "album" else "albums", Modifier.weight(1f))
                VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.fillMaxHeight())
                BigStat("%,d".format(home.artists), if (home.artists == 1) "artist" else "artists", Modifier.weight(1f))
            }
        }
    }
}

/**
 * Home's two ways to start, side by side under the player card (owner, 2026-10-11): the whole library shuffled on the
 * server, in the accent as the page's main action, and Listen together. Both were small icons in the top bar before.
 */
@Composable
private fun StartRow(onShuffle: () -> Unit, onTogether: () -> Unit) {
    val padding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Button(onClick = onShuffle, contentPadding = padding, modifier = Modifier.weight(1f)) {
            Icon(Icons.Filled.Shuffle, contentDescription = null, modifier = Modifier.size(18.dp))
            Text("Shuffle library", maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 8.dp))
        }
        OutlinedButton(onClick = onTogether, contentPadding = padding, modifier = Modifier.weight(1f)) {
            Icon(Icons.Filled.Groups, contentDescription = null, modifier = Modifier.size(18.dp))
            Text("Listen together", maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

/** The player card's initial or icon, in a small rounded square. */
@Composable
private fun Avatar(content: @Composable () -> Unit) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.size(40.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(10.dp)),
    ) { content() }
}

/** A bordered card holding a ranked list, like the player card, so a list reads as one block (owner, 2026-10-11). */
@Composable
private fun ListCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = CardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Column(Modifier.padding(vertical = 4.dp), content = content)
    }
}

/** Play and Shuffle along a card's foot, labelled, instead of loose icons beside the heading. */
@Composable
private fun CardActions(onPlay: () -> Unit, onShuffle: () -> Unit, what: String) {
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(top = 4.dp))
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilledTonalButton(
            onClick = onPlay,
            modifier = Modifier.weight(1f).semantics { contentDescription = "Play $what" },
        ) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
            Text("Play", modifier = Modifier.padding(start = 8.dp))
        }
        FilledTonalButton(
            onClick = onShuffle,
            modifier = Modifier.weight(1f).semantics { contentDescription = "Shuffle $what" },
        ) {
            Icon(Icons.Filled.Shuffle, contentDescription = null, modifier = Modifier.size(18.dp))
            Text("Shuffle", modifier = Modifier.padding(start = 8.dp))
        }
    }
}

/** "Good morning" to "Good evening" by the phone's clock, with the name when there is one. */
internal fun greeting(hour: Int, name: String?): String {
    val part = when (hour) {
        in 5..11 -> "Good morning"
        in 12..17 -> "Good afternoon"
        else -> "Good evening"
    }
    return if (name.isNullOrBlank()) part else "$part, $name"
}

/**
 * The rhythm-game player card (A91): who you are on top, then the range's three numbers large in the display face, and
 * how the listening time compares with the window before.
 */
@Composable
private fun PlayerCard(username: String?, stats: UserStatsDto, range: StatsRange) {
    val name = username ?: "You"
    Surface(
        shape = CardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        // Compact (owner, 2026-10-11): a small avatar beside the name, the numbers straight under it.
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar {
                    Text(
                        name.take(1).uppercase(),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
                Column(Modifier.padding(start = 12.dp)) {
                    Text(name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "Listening since ${formatMonthYear(stats.memberSince)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            val (listenedValue, listenedLabel) = listenedHeadline(stats.totals.msListened)
            Row(Modifier.fillMaxWidth().padding(top = 12.dp).height(IntrinsicSize.Min)) {
                BigStat(listenedValue, listenedLabel, Modifier.weight(1f))
                VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.fillMaxHeight())
                BigStat(stats.totals.plays.toString(), if (stats.totals.plays == 1) "play" else "plays", Modifier.weight(1f))
                VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.fillMaxHeight())
                BigStat(stats.totals.tracks.toString(), if (stats.totals.tracks == 1) "song" else "songs", Modifier.weight(1f))
            }
            listenedDelta(stats, range)?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun BigStat(value: String, label: String, modifier: Modifier) {
    Column(modifier.padding(horizontal = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun RangePicker(range: StatsRange, onPick: (StatsRange) -> Unit) {
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        StatsRange.entries.forEachIndexed { index, r ->
            SegmentedButton(
                selected = r == range,
                onClick = { onPick(r) },
                shape = SegmentedButtonDefaults.itemShape(index, StatsRange.entries.size),
            ) { Text(r.label, maxLines = 1) }
        }
    }
}

/** The last songs played, as covers in a row. Not tied to the range: it is what you just heard. */
@Composable
private fun RecentRow(
    recent: List<HistoryEntryDto>,
    coverUrl: (Int) -> String?,
    onPlay: (Int) -> Unit,
    onMenu: (HistoryEntryDto) -> Unit,
) {
    CoverRow(
        items = recent,
        key = { it.trackId },
        cover = { coverUrl(it.trackId) },
        title = { it.title },
        subtitle = { it.artist ?: "Unknown artist" },
        onClick = onPlay,
        onLongClick = onMenu,
    )
}

/** Covers in a row, each with a name and a line under it; long press, when given, opens the song menu. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun <T> CoverRow(
    items: List<T>,
    key: (T) -> Any,
    cover: (T) -> String?,
    title: (T) -> String,
    subtitle: (T) -> String,
    onClick: (Int) -> Unit,
    onClickLabel: String? = null,
    onLongClick: ((T) -> Unit)? = null,
) {
    val haptics = LocalHapticFeedback.current
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        itemsIndexed(items, key = { _, item -> key(item) }) { index, item ->
            Column(
                Modifier
                    .width(112.dp)
                    .combinedClickable(
                        onClickLabel = onClickLabel,
                        onClick = { onClick(index) },
                        onLongClickLabel = if (onLongClick != null) "Song options" else null,
                        onLongClick = onLongClick?.let {
                            {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                it(item)
                            }
                        },
                    ),
            ) {
                CoverImage(url = cover(item), contentDescription = null, modifier = Modifier.size(112.dp))
                Text(
                    title(item),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Text(
                    subtitle(item),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** #1 gets the big cover, like the chosen song on a music select (DESIGN.md); the rest follow as rows in the same card. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TopSongHero(
    top: TopTrackDto,
    coverUrl: String?,
    movement: Movement?,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = onClick,
                onLongClickLabel = "Song options",
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    onLongClick()
                },
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        CoverImage(url = coverUrl, contentDescription = null, modifier = Modifier.size(120.dp), cornerRadius = 12.dp)
        Column(Modifier.weight(1f).padding(start = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "#1",
                    style = MaterialTheme.typography.displaySmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.semantics { contentDescription = "Number 1" },
                )
                movement?.let { MovementTag(it, Modifier.padding(start = 10.dp)) }
            }
            Text(top.track.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                top.track.artist ?: "Unknown artist",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "${plays(top.plays)} · ${formatListened(top.msListened)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

private fun emptyTopSongs(range: StatsRange): String = when (range) {
    StatsRange.WEEK -> "Nothing played in the last 7 days."
    StatsRange.MONTH -> "Nothing played in the last 30 days."
    StatsRange.YEAR -> "Nothing played in the last year."
    StatsRange.ALL -> "Nothing played yet. Your top songs show up here once you start listening."
}

@Composable
private fun SectionTitle(title: String, trailing: (@Composable () -> Unit)? = null) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = if (trailing == null) 20.dp else 8.dp),
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .weight(1f)
                .padding(bottom = if (trailing == null) 4.dp else 0.dp)
                .semantics { heading() },
        )
        trailing?.invoke()
    }
}

@Composable
private fun EmptyLine(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
    )
}

/** Where a song or artist moved since the window before (A91). The same place shows nothing. */
sealed interface Movement {
    data class Up(val places: Int) : Movement
    data class Down(val places: Int) : Movement
    data object New : Movement
}

fun movement(rank: Int, previousRank: Int?, compared: Boolean): Movement? = when {
    !compared -> null
    previousRank == null -> Movement.New
    previousRank > rank -> Movement.Up(previousRank - rank)
    previousRank < rank -> Movement.Down(rank - previousRank)
    else -> null
}

/** Fits the rank column: a song that was 150th last month shows "▲99+", and the spoken label keeps the real number. */
fun shortPlaces(places: Int): String = if (places > 99) "99+" else places.toString()

/** Up and new in the accent, as the news; down stays quiet. */
@Composable
private fun MovementTag(movement: Movement, modifier: Modifier = Modifier) {
    val (text, spoken) = when (movement) {
        is Movement.Up -> "▲${shortPlaces(movement.places)}" to "Up ${movement.places}"
        is Movement.Down -> "▼${shortPlaces(movement.places)}" to "Down ${movement.places}"
        Movement.New -> "NEW" to "New this time"
    }
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        color = if (movement is Movement.Down) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary,
        maxLines = 1,
        modifier = modifier.clearAndSetSemantics { contentDescription = spoken },
    )
}

/** Rank in the display face, like a leaderboard, then optional cover, name, and what it adds up to. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RankedRow(
    rank: Int,
    coverUrl: String?,
    title: String,
    subtitle: String?,
    plays: Int,
    msListened: Long,
    movement: Movement?,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
) {
    val haptics = LocalHapticFeedback.current
    ListItem(
        leadingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.width(RankWidth), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        rank.toString(),
                        style = MaterialTheme.typography.titleLarge.copy(fontFamily = DisplayFontFamily),
                        color = if (rank <= 3) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    movement?.let { MovementTag(it) }
                }
                if (coverUrl != null) {
                    CoverImage(url = coverUrl, contentDescription = null, modifier = Modifier.padding(start = 8.dp).size(44.dp))
                }
            }
        },
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = subtitle?.let { { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis) } },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                Text(plays(plays), style = MaterialTheme.typography.bodySmall)
                Text(
                    formatListened(msListened),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = if (onLongClick == null) {
            Modifier.combinedClickable(onClick = onClick)
        } else {
            Modifier.combinedClickable(
                onClick = onClick,
                onLongClickLabel = "Song options",
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    onLongClick()
                },
            )
        },
    )
}

/** Liked, Playlists and Hear less as three tiles: icon and count, then the name (A96). */
@Composable
private fun LibraryTiles(counts: ProfileCountsDto, onOpenLiked: () -> Unit, onOpenPlaylists: () -> Unit, onOpenLessOften: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LibraryTile(Icons.Filled.Favorite, counts.liked, "Liked", "Liked songs", onOpenLiked, Modifier.weight(1f))
        LibraryTile(Icons.AutoMirrored.Filled.QueueMusic, counts.playlists, "Playlists", "Playlists", onOpenPlaylists, Modifier.weight(1f))
        LibraryTile(Icons.AutoMirrored.Filled.TrendingDown, counts.lessOften, "Hear less", "Songs you hear less", onOpenLessOften, Modifier.weight(1f))
    }
}

@Composable
private fun LibraryTile(icon: ImageVector, count: Int, label: String, spoken: String, onClick: () -> Unit, modifier: Modifier) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = modifier.fillMaxHeight(),
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp).clearAndSetSemantics { contentDescription = "$spoken, $count" }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Text(count.toString(), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = 8.dp))
            }
            Text(
                label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
