package com.brainlessmusic.app.ui.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.StatsRange
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonLead
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.AppBottomBar

// Flat outlined cards, like Settings and the Library header (DESIGN.md, Android).
private val CardShape = RoundedCornerShape(20.dp)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YouScreen(
    navController: NavHostController,
    onOpenArtist: (Int) -> Unit,
    onOpenLiked: () -> Unit,
    onOpenLessOften: () -> Unit,
    onOpenPlaylists: () -> Unit,
    viewModel: YouViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val range by viewModel.range.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    val username by viewModel.username.collectAsStateWithLifecycle()

    Scaffold(
        topBar = { TopAppBar(title = { Text("You") }) },
        bottomBar = { AppBottomBar(navController) },
    ) { padding ->
        if (viewModel.isGuest) {
            GuestNote(Modifier.padding(padding))
            return@Scaffold
        }
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            loadingLabel = "Loading your profile",
            skeleton = { SkeletonListRows(lead = SkeletonLead.COVER, trailing = true) },
        ) { stats: UserStatsDto ->
            PullToRefreshBox(isRefreshing = refreshing, onRefresh = viewModel::refresh) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 16.dp),
                ) {
                    item { Header(username, stats) }
                    item { RangePicker(range, viewModel::setRange) }

                    item { SectionTitle("Top songs") }
                    if (stats.topTracks.isEmpty()) {
                        item { EmptyLine(emptyTopSongs(range)) }
                    }
                    itemsIndexed(stats.topTracks, key = { _, t -> "t${t.track.id}" }) { index, top ->
                        RankedRow(
                            rank = index + 1,
                            coverUrl = viewModel.trackCoverUrl(top.track.id),
                            title = top.track.title,
                            subtitle = top.track.artist ?: "Unknown artist",
                            plays = top.plays,
                            msListened = top.msListened,
                            onClick = { viewModel.playTop(stats, index) },
                        )
                    }

                    if (stats.topArtists.isNotEmpty()) {
                        item { SectionTitle("Top artists") }
                        itemsIndexed(stats.topArtists, key = { _, a -> "a${a.id}" }) { index, artist ->
                            RankedRow(
                                rank = index + 1,
                                coverUrl = null,
                                title = artist.name,
                                subtitle = null,
                                plays = artist.plays,
                                msListened = artist.msListened,
                                onClick = { onOpenArtist(artist.id) },
                            )
                        }
                    }

                    item { SectionTitle("Your library") }
                    item {
                        Surface(
                            shape = CardShape,
                            color = MaterialTheme.colorScheme.surfaceContainer,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                        ) {
                            Column {
                                LibraryRow(Icons.Filled.Favorite, "Liked songs", stats.counts.liked, onOpenLiked)
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                                LibraryRow(Icons.AutoMirrored.Filled.QueueMusic, "Playlists", stats.counts.playlists, onOpenPlaylists)
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                                LibraryRow(Icons.AutoMirrored.Filled.TrendingDown, "Songs you hear less", stats.counts.lessOften, onOpenLessOften)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GuestNote(modifier: Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Your profile needs an account", style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Text(
            "Guests can listen, but plays, likes and playlists are only kept for accounts.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

/** Initial in a circle, the name, since when, and the range's totals. */
@Composable
private fun Header(username: String?, stats: UserStatsDto) {
    val name = username ?: "You"
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(64.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
        ) {
            Text(
                name.take(1).uppercase(),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
        Column(Modifier.padding(start = 16.dp)) {
            Text(name, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "Listening since ${formatMonthYear(stats.memberSince)}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Stat(formatListened(stats.totals.msListened), "listened", Modifier.weight(1f))
        Stat(stats.totals.plays.toString(), if (stats.totals.plays == 1) "play" else "plays", Modifier.weight(1f))
        Stat(stats.totals.tracks.toString(), if (stats.totals.tracks == 1) "song" else "songs", Modifier.weight(1f))
    }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier,
    ) {
        Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
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

private fun emptyTopSongs(range: StatsRange): String = when (range) {
    StatsRange.WEEK -> "Nothing played in the last 7 days."
    StatsRange.MONTH -> "Nothing played in the last 30 days."
    StatsRange.YEAR -> "Nothing played in the last year."
    StatsRange.ALL -> "Nothing played yet. Your top songs show up here once you start listening."
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 20.dp, end = 16.dp, top = 20.dp, bottom = 4.dp).semantics { heading() },
    )
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

/** Rank, optional cover, name, and what it adds up to: plays and time listened. */
@Composable
private fun RankedRow(
    rank: Int,
    coverUrl: String?,
    title: String,
    subtitle: String?,
    plays: Int,
    msListened: Long,
    onClick: () -> Unit,
) {
    ListItem(
        leadingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    rank.toString(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.End,
                    modifier = Modifier.padding(end = 12.dp),
                )
                if (coverUrl != null) CoverImage(url = coverUrl, contentDescription = null, modifier = Modifier.size(44.dp))
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
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@Composable
private fun LibraryRow(icon: ImageVector, title: String, count: Int, onClick: () -> Unit) {
    ListItem(
        leadingContent = { Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
        headlineContent = { Text(title) },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(count.toString(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick),
    )
}
