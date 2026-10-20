package com.brainlessmusic.app.ui.stats

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.remote.dto.ListeningPatternsDto
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.StatsRange
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.common.segmentShape
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.profile.EmptyLine
import com.brainlessmusic.app.ui.profile.ListCard
import com.brainlessmusic.app.ui.profile.RangePicker
import com.brainlessmusic.app.ui.profile.RankedRow
import com.brainlessmusic.app.ui.profile.SectionTitle
import com.brainlessmusic.app.ui.profile.SongMenuSheet
import com.brainlessmusic.app.ui.profile.listenedDelta
import com.brainlessmusic.app.ui.profile.listenedHeadline
import com.brainlessmusic.app.ui.profile.parseSqliteTime
import com.brainlessmusic.app.ui.profile.plays
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.cardShape
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private val WEEKDAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
private val SHORT_DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)

private fun shortDay(date: String): String = runCatching { LocalDate.parse(date).format(SHORT_DAY) }.getOrDefault(date)
private fun hourLabel(h: Int) = "%02d:00".format(h)
private fun count(n: Int, one: String) = if (n == 1) "1 $one" else "$n ${one}s"

private fun rangeWindow(range: StatsRange) = when (range) {
    StatsRange.WEEK -> "last 7 days"
    StatsRange.MONTH -> "last 30 days"
    StatsRange.YEAR -> "last 365 days"
    StatsRange.ALL -> "all time"
}

/**
 * Your listening in full (A228), opened from Home's listening card: the record (time, plays, the day combo), plays
 * over the range, the hour and weekday you listen, the top lists, and every play so far. Hours are the phone's.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun StatsScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    onOpenArtist: (Int) -> Unit,
    onOpenAlbum: (Int) -> Unit,
    viewModel: StatsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val range by viewModel.range.collectAsStateWithLifecycle()
    val switching by viewModel.switching.collectAsStateWithLifecycle()
    val history by viewModel.history.collectAsStateWithLifecycle()
    val rangeAlpha by animateFloatAsState(if (switching) 0.5f else 1f, label = "rangeAlpha")
    var menuFor by remember { mutableStateOf<QueueItem?>(null) }
    menuFor?.let { SongMenuSheet(item = it, onDismiss = { menuFor = null }) }

    androidx.compose.material3.Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Your listening") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") } },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            loadingLabel = "Loading your stats",
            skeleton = { SkeletonListRows(trailing = true) },
        ) { page ->
            val stats = page.stats
            val patterns = page.patterns
            val ofRange = Modifier.graphicsLayer { alpha = rangeAlpha }
            val nothing = if (range == StatsRange.ALL) "Nothing played yet." else "Nothing played in the ${rangeWindow(range)}."
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                item(key = "range") { RangePicker(range, viewModel::setRange) }
                item(key = "record") { Record(stats, patterns, range, ofRange) }
                if (patterns != null) {
                    item(key = "trend") { TrendCard(patterns, range, ofRange) }
                    item(key = "when") { WhenCard(patterns, ofRange) }
                } else {
                    item(key = "no-patterns") { EmptyLine("Couldn't load when you listen. Go back and open Stats again.") }
                }

                item(key = "top-songs-title") { SectionTitle("Top songs") }
                item(key = "top-songs") {
                    Column(ofRange) {
                        ListCard {
                            if (stats.topTracks.isEmpty()) EmptyLine(nothing)
                            stats.topTracks.forEachIndexed { index, top ->
                                RankedRow(
                                    rank = index + 1,
                                    coverUrl = viewModel.trackCoverUrl(top.track.id),
                                    title = top.track.title,
                                    subtitle = top.track.artist ?: "Unknown artist",
                                    plays = top.plays,
                                    msListened = top.msListened,
                                    movement = null,
                                    onClick = { viewModel.playTop(stats, index) },
                                    onLongClick = { menuFor = viewModel.queueItem(top.track) },
                                )
                            }
                        }
                    }
                }
                if (stats.topArtists.isNotEmpty()) {
                    item(key = "top-artists-title") { SectionTitle("Top artists") }
                    item(key = "top-artists") {
                        Column(ofRange) {
                            ListCard {
                                stats.topArtists.forEachIndexed { index, a ->
                                    RankedRow(index + 1, null, a.name, null, a.plays, a.msListened, null, onClick = { onOpenArtist(a.id) })
                                }
                            }
                        }
                    }
                }
                if (stats.topAlbums.isNotEmpty()) {
                    item(key = "top-albums-title") { SectionTitle("Top albums") }
                    item(key = "top-albums") {
                        Column(ofRange) {
                            ListCard {
                                stats.topAlbums.forEachIndexed { index, a ->
                                    RankedRow(index + 1, null, a.title, a.artist, a.plays, a.msListened, null, onClick = { onOpenAlbum(a.id) })
                                }
                            }
                        }
                    }
                }
                if (stats.topGenres.isNotEmpty()) {
                    item(key = "top-genres-title") { SectionTitle("Top genres") }
                    item(key = "top-genres") {
                        FlowRow(
                            ofRange.padding(horizontal = 16.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            stats.topGenres.forEach { g ->
                                Surface(
                                    shape = MaterialTheme.shapes.small,
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                    color = MaterialTheme.colorScheme.surfaceContainer,
                                ) {
                                    Text(
                                        "${g.name}  ${g.plays}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                    )
                                }
                            }
                        }
                    }
                }

                item(key = "recent-title") { SectionTitle(if (history.total > 0) "Recently played · ${history.total}" else "Recently played") }
                when {
                    history.rows.isEmpty() && history.loading -> item(key = "recent-loading") { EmptyLine("Loading your recent plays…") }
                    history.rows.isEmpty() && history.failed -> item(key = "recent-failed") { EmptyLine("Could not load your plays.") }
                    history.rows.isEmpty() -> item(key = "recent-empty") { EmptyLine("No plays yet. Songs you play show up here.") }
                }
                itemsIndexed(history.rows, key = { _, r -> "play-${r.id}" }) { _, r ->
                    val faded = r.skipped || r.missing
                    ListItem(
                        headlineContent = {
                            Text(
                                r.title,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = if (faded) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                            )
                        },
                        supportingContent = {
                            val tags = listOfNotNull(r.artist ?: "Unknown artist", "skipped".takeIf { r.skipped }, "file missing".takeIf { r.missing })
                            Text(tags.joinToString(" · "), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        },
                        trailingContent = { Text(ago(r.playedAt), style = MaterialTheme.typography.labelSmall) },
                        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
                        modifier = Modifier.clickable(enabled = !r.missing) { viewModel.playHistory(r) },
                    )
                }
                if (history.failed || (history.rows.isNotEmpty() && history.rows.size < history.total)) {
                    item(key = "recent-more") {
                        OutlinedButton(
                            onClick = viewModel::loadMoreHistory,
                            enabled = !history.loading,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        ) {
                            Text(
                                when {
                                    history.loading -> "Loading…"
                                    history.failed -> "Couldn't load. Try again"
                                    else -> "Show ${minOf(50, history.total - history.rows.size)} more"
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. Plays are stored in UTC. */
private fun ago(playedAt: String): String {
    val at = parseSqliteTime(playedAt) ?: return playedAt
    val minutes = Duration.between(at, LocalDateTime.now(ZoneOffset.UTC)).toMinutes()
    return when {
        minutes < 2 -> "just now"
        minutes < 60 -> "$minutes min ago"
        minutes < 24 * 60 -> "${minutes / 60} h ago"
        minutes < 48 * 60 -> "yesterday"
        minutes < 14 * 24 * 60 -> "${minutes / (24 * 60)} days ago"
        else -> at.toLocalDate().format(SHORT_DAY)
    }
}

/** A bordered card, like Home's listening card. */
@Composable
private fun StatsCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
    }
}

@Composable
private fun CardTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun Caption(text: String) {
    Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** The focal point: time listened large, then plays, songs and artists, then the day combo (a streak, in the skins' word). */
@Composable
private fun Record(stats: UserStatsDto, patterns: ListeningPatternsDto?, range: StatsRange, modifier: Modifier) {
    val (value, label) = listenedHeadline(stats.totals.msListened)
    StatsCard(modifier) {
        Text(value, style = MaterialTheme.typography.displayLarge, fontWeight = FontWeight.ExtraBold)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        listenedDelta(stats, range)?.let { Caption(it) }
        Row(horizontalArrangement = Arrangement.spacedBy(20.dp), modifier = Modifier.padding(top = 4.dp)) {
            listOf("Plays" to stats.totals.plays, "Songs" to stats.totals.tracks, "Artists" to stats.totals.artists).forEach { (name, n) ->
                Column {
                    Caption(name)
                    Text("%,d".format(n), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        val streak = patterns?.streak ?: return@StatsCard
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(vertical = 4.dp))
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column {
                Caption("DAY COMBO")
                Text("${streak.current}", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.ExtraBold)
            }
            val best = if (streak.longest > 0) {
                val ended = streak.longestEndedOn?.takeIf { streak.longest > streak.current }?.let { ", ended ${shortDay(it)}" } ?: ""
                " Best ${count(streak.longest, "day")}$ended."
            } else {
                ""
            }
            Text(
                (if (streak.current == 0) "Play something today to start one." else "${count(streak.current, "day")} in a row.") + best,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 6.dp),
            )
        }
    }
}

/**
 * Flat bars, the tallest scaled to the box. The busiest bar takes the accent; the rest stay in the muted ink. The
 * summary is read out instead of the shape.
 */
@Composable
private fun Bars(values: List<Int>, summary: String, height: Int = 112) {
    val accent = MaterialTheme.colorScheme.primary
    val ink = MaterialTheme.colorScheme.onSurfaceVariant
    val empty = MaterialTheme.colorScheme.outlineVariant
    val max = values.maxOrNull() ?: 0
    val top = if (max > 0) values.indexOf(max) else -1
    Canvas(
        Modifier
            .fillMaxWidth()
            .height(height.dp)
            .semantics { contentDescription = summary },
    ) {
        if (values.isEmpty()) return@Canvas
        val slot = size.width / values.size
        val gap = if (values.size > 60) 0f else minOf(2.dp.toPx(), slot * 0.2f)
        values.forEachIndexed { i, v ->
            val h = if (v > 0) maxOf(3.dp.toPx(), size.height * v / max) else 1.dp.toPx()
            drawRect(
                color = when {
                    i == top -> accent
                    v > 0 -> ink
                    else -> empty
                },
                topLeft = Offset(i * slot + gap / 2, size.height - h),
                size = Size(slot - gap, h),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TrendCard(patterns: ListeningPatternsDto, range: StatsRange, modifier: Modifier) {
    var minutes by rememberSaveable { mutableStateOf(false) }
    val weekly = patterns.bucket == "week"
    val values = patterns.trend.map { if (minutes) (it.msListened / 60_000).toInt() else it.plays }
    val unit = if (minutes) "minute" else "play"
    val title = "${if (minutes) "Minutes" else "Plays"} per ${if (weekly) "week" else "day"}, ${rangeWindow(range)}"
    val max = values.maxOrNull() ?: 0
    val peak = if (max > 0) patterns.trend[values.indexOf(max)] else null
    val peakText = peak?.let { "Most: ${count(max, unit)}, ${if (weekly) "week of " else ""}${shortDay(it.date)}" }
    StatsCard(modifier) {
        CardTitle(title)
        SingleChoiceSegmentedButtonRow {
            listOf(false to "Plays", true to "Minutes").forEachIndexed { index, (m, label) ->
                SegmentedButton(selected = minutes == m, onClick = { minutes = m }, shape = segmentShape(index, 2)) { Text(label) }
            }
        }
        if (patterns.trend.isEmpty()) {
            Caption("Nothing played yet. Your first play starts the chart.")
        } else {
            Bars(values, "$title. ${peakText ?: "None yet."}")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Caption(shortDay(patterns.trend.first().date))
                Caption(if (weekly) "this week" else "today")
            }
            peakText?.let { Caption(it) }
        }
    }
}

@Composable
private fun WhenCard(patterns: ListeningPatternsDto, modifier: Modifier) {
    val hour = patterns.busiest.hour
    val day = patterns.busiest.weekday
    val hourSummary = hour?.let { "Busiest hour ${hourLabel(it)}, ${plays(patterns.byHour[it].plays)}." } ?: "No plays in this range."
    val daySummary = day?.let { "Busiest day ${WEEKDAYS[it]}, ${plays(patterns.byWeekday[it].plays)}." } ?: "No plays in this range."
    StatsCard(modifier) {
        CardTitle("What time you listen")
        Bars(patterns.byHour.map { it.plays }, "Plays by hour of day. $hourSummary", height = 96)
        Row(Modifier.fillMaxWidth()) {
            listOf(0, 6, 12, 18).forEach { Text(hourLabel(it), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f)) }
        }
        Caption(hourSummary)
    }
    StatsCard(modifier) {
        CardTitle("Which days you listen")
        Bars(patterns.byWeekday.map { it.plays }, "Plays by day of the week. $daySummary", height = 96)
        Row(Modifier.fillMaxWidth()) {
            WEEKDAYS.forEach {
                Text(
                    it.take(2),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
        Caption(daySummary)
    }
}
