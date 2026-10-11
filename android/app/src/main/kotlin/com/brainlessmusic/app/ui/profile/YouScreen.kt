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
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
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
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonLead
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.AppBottomBar
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

    val title = greeting(Calendar.getInstance().get(Calendar.HOUR_OF_DAY), if (viewModel.isGuest) null else username)

    Scaffold(
        topBar = { TopAppBar(title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) }) },
        bottomBar = { AppBottomBar(navController) },
    ) { padding ->
        if (viewModel.isGuest) {
            // Guests get something to play, and why the rest isn't here (A98).
            Column(Modifier.padding(padding)) {
                ShuffleLibraryButton(shuffle)
                GuestNote()
            }
            return@Scaffold
        }
        Column(Modifier.padding(padding)) {
            // Shuffle doesn't wait for the stats; once they land it scrolls with them, in the same place.
            if (state !is LoadState.Content) ShuffleLibraryButton(shuffle)
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
                        // Something to play first, then your listening (A97).
                        item { ShuffleLibraryButton(shuffle) }

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

                        // Not ranged, so above the range picker, where it's seen without much scrolling (A96).
                        item { LibraryTiles(stats.counts, onOpenLiked, onOpenPlaylists, onOpenLessOften) }
                        item { RangePicker(range, viewModel::setRange) }
                        item { Box(ofRange) { PlayerCard(username, stats, range) } }

                        item {
                            SectionTitle(
                                "Top songs",
                                trailing = if (stats.topTracks.isEmpty()) null else {
                                    {
                                        IconButton(onClick = { viewModel.playAllTop(stats, shuffle = false) }) {
                                            Icon(Icons.Filled.PlayArrow, contentDescription = "Play top songs")
                                        }
                                        IconButton(onClick = { viewModel.playAllTop(stats, shuffle = true) }) {
                                            Icon(Icons.Filled.Shuffle, contentDescription = "Shuffle top songs")
                                        }
                                    }
                                },
                            )
                        }
                        if (stats.topTracks.isEmpty()) {
                            item { Box(ofRange) { EmptyLine(emptyTopSongs(range)) } }
                        }
                        stats.topTracks.firstOrNull()?.let { top ->
                            item(key = "t${top.track.id}") {
                                Box(ofRange.animateItem()) {
                                    TopSongHero(
                                        top = top,
                                        coverUrl = viewModel.trackCoverUrl(top.track.id),
                                        movement = movement(1, top.previousRank, compared),
                                        onClick = { viewModel.playTop(stats, 0) },
                                        onLongClick = { menuFor = viewModel.queueItem(top.track) },
                                    )
                                }
                            }
                        }
                        itemsIndexed(stats.topTracks.drop(1), key = { _, t -> "t${t.track.id}" }) { i, top ->
                            val index = i + 1
                            Box(ofRange.animateItem()) {
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

                        if (stats.topArtists.isNotEmpty()) {
                            item { SectionTitle("Top artists") }
                            itemsIndexed(stats.topArtists, key = { _, a -> "a${a.id}" }) { index, artist ->
                                Box(ofRange.animateItem()) {
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

@Composable
private fun GuestNote() {
    Text(
        "Guests can listen, but plays, likes and playlists are only kept for accounts, so your stats and library show " +
            "here once you have one.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

/** Home's first action (A97): the whole library, shuffled on the server. */
@Composable
private fun ShuffleLibraryButton(onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).heightIn(min = 48.dp),
    ) {
        Icon(Icons.Filled.Shuffle, contentDescription = null)
        Text("Shuffle my library", modifier = Modifier.padding(start = 8.dp))
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
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(56.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(14.dp)),
                ) {
                    Text(
                        name.take(1).uppercase(),
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
                Column(Modifier.padding(start = 14.dp)) {
                    Text(name, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "Listening since ${formatMonthYear(stats.memberSince)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(vertical = 14.dp))
            val (listenedValue, listenedLabel) = listenedHeadline(stats.totals.msListened)
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
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
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                )
            }
        }
    }
}

@Composable
private fun BigStat(value: String, label: String, modifier: Modifier) {
    Column(modifier.padding(horizontal = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RecentRow(
    recent: List<HistoryEntryDto>,
    coverUrl: (Int) -> String?,
    onPlay: (Int) -> Unit,
    onMenu: (HistoryEntryDto) -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        itemsIndexed(recent, key = { _, e -> e.trackId }) { index, entry ->
            Column(
                Modifier
                    .width(112.dp)
                    .combinedClickable(
                        onClick = { onPlay(index) },
                        onLongClickLabel = "Song options",
                        onLongClick = {
                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            onMenu(entry)
                        },
                    ),
            ) {
                CoverImage(url = coverUrl(entry.trackId), contentDescription = null, modifier = Modifier.size(112.dp))
                Text(
                    entry.title,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Text(
                    entry.artist ?: "Unknown artist",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** #1 gets the big cover, like the chosen song on a music select (DESIGN.md); the rest follow as rows. */
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
