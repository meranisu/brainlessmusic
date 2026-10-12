package com.brainlessmusic.app.ui.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.Notices
import com.brainlessmusic.app.ui.common.PlayingMarker
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.common.markPlaying
import com.brainlessmusic.app.ui.downloads.CoverMosaic
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.theme.cardShape
import com.brainlessmusic.app.ui.theme.coverShape
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject

/** The two song lists: what you liked, and what you disliked (A60, A153). */
enum class SongListKind(val route: String, val title: String, val empty: String) {
    LIKED("liked", "Liked songs", "No liked songs yet. Tap the heart on Now Playing to like one."),
    LESS_OFTEN("less-often", "Disliked songs", "Nothing disliked. Hold the heart in the player, or swipe a song right in the queue."),
}

@HiltViewModel
class SongListViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val profile: ProfileRepository,
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
) : ViewModel() {

    val kind: SongListKind = SongListKind.entries.first { it.route == savedStateHandle.get<String>(Routes.ARG_SONG_LIST) }

    private val _state = MutableStateFlow<LoadState<List<TrackSummaryDto>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<TrackSummaryDto>>> = _state.asStateFlow()

    init {
        load()
    }

    /** One page of up to the server's cap (200); more than that is a later problem for a handful of listeners. */
    fun load() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            val result = when (kind) {
                SongListKind.LIKED -> profile.likedPage(0, PAGE).map { it.favorites }
                SongListKind.LESS_OFTEN -> profile.lessOftenPage(0, PAGE).map { it.tracks }
            }
            result.fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { _state.value = LoadState.Error(it.loadMessage()) },
            )
        }
    }

    /** The song playing now, to mark its row. */
    val playingId: StateFlow<Int?> = playbackController.state.map { it.current?.trackId }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun play(index: Int, shuffle: Boolean? = null) {
        val tracks = (_state.value as? LoadState.Content)?.data ?: return
        val items = tracks.map(libraryRepository::queueItem)
        if (items.isEmpty()) return
        playbackController.playQueue(items, if (shuffle == true) items.indices.random() else index, shuffle = shuffle)
    }

    fun queueItem(track: TrackSummaryDto): QueueItem = libraryRepository.queueItem(track)

    fun coverUrl(track: TrackSummaryDto): String? =
        track.albumId?.let(libraryRepository::albumCoverUrl) ?: libraryRepository.trackCoverUrl(track.id)

    /** Up to six different albums, newest first, for the header's picture. */
    fun headerCovers(tracks: List<TrackSummaryDto>): List<String?> =
        tracks.distinctBy { it.albumId ?: -it.id }.take(6).map(::coverUrl)

    /** Disliked songs' "Undislike all", the same as Settings' Reset. */
    fun clearAll() {
        viewModelScope.launch {
            profile.clearDisliked().fold(
                onSuccess = { _state.value = LoadState.Content(emptyList()) },
                onFailure = { Notices.show("Couldn't reach the server. Try again.") },
            )
        }
    }

    /** Takes the song off this list: unlike, or undislike (back to normal in shuffle). */
    fun takeOff(trackId: Int) {
        val tracks = (_state.value as? LoadState.Content)?.data ?: return
        _state.value = LoadState.Content(tracks.filter { it.id != trackId })
        viewModelScope.launch {
            val result = when (kind) {
                SongListKind.LIKED -> profile.setLiked(trackId, false)
                SongListKind.LESS_OFTEN -> profile.setDisliked(trackId, false)
            }
            result.onFailure { load() }
        }
    }

    private companion object {
        const val PAGE = 200
    }
}

/**
 * Liked songs and Disliked songs (A152, A153): a header card with the list's picture, its size and length, then the
 * songs with their covers. Liked plays or shuffles all and groups songs by when you liked them; Disliked explains what
 * a dislike does and can undo them all. Each row's heart is the player's (tap, hold), so a song can be moved between
 * the lists from here; long press opens the song menu.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongListScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: SongListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val playingId by viewModel.playingId.collectAsStateWithLifecycle()
    val kind = viewModel.kind
    var menuFor by remember { mutableStateOf<QueueItem?>(null) }
    var confirmClear by remember { mutableStateOf(false) }

    menuFor?.let { SongMenuSheet(item = it, onDismiss = { menuFor = null }) }
    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Undislike every song?") },
            text = { Text("They all go back into shuffle as normal.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmClear = false
                    viewModel.clearAll()
                }) { Text("Undislike all") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(kind.title) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") }
                },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            loadingLabel = "Loading ${kind.title.lowercase()}",
            skeleton = { SkeletonListRows(trailing = true) },
        ) { tracks ->
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                item(key = "header") {
                    when (kind) {
                        SongListKind.LIKED -> LikedHeader(
                            tracks,
                            covers = viewModel.headerCovers(tracks),
                            onPlay = { viewModel.play(0, shuffle = false) },
                            onShuffle = { viewModel.play(0, shuffle = true) },
                        )
                        SongListKind.LESS_OFTEN -> DislikedHeader(tracks, onClearAll = { confirmClear = true })
                    }
                }
                if (tracks.isEmpty()) {
                    item(key = "empty") {
                        Text(
                            kind.empty,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 16.dp),
                        )
                    }
                }
                val groups = if (kind == SongListKind.LIKED) likedGroups(tracks) else listOf(null to tracks.indices.toList())
                groups.forEach { (label, indices) ->
                    if (label != null) {
                        item(key = "group-$label") {
                            Text(
                                label,
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(start = 20.dp, top = 16.dp, bottom = 4.dp).semantics { heading() },
                            )
                        }
                    }
                    items(indices, key = { tracks[it].id }) { index ->
                        val track = tracks[index]
                        SongListRow(
                            track,
                            cover = viewModel.coverUrl(track),
                            isCurrent = track.id == playingId,
                            dim = kind == SongListKind.LESS_OFTEN,
                            onClick = { viewModel.play(index) },
                            onMenu = { menuFor = viewModel.queueItem(track) },
                        )
                    }
                }
            }
        }
    }
}

/** Liked songs' header: the picture, the label in the skin's game, how many and how long, Play and Shuffle. */
@Composable
private fun LikedHeader(tracks: List<TrackSummaryDto>, covers: List<String?>, onPlay: () -> Unit, onShuffle: () -> Unit) {
    HeaderCard {
        SkinLabel(LocalSkin.current)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(120.dp)) {
                if (covers.isEmpty()) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.fillMaxSize().clip(coverShape(14.dp)).background(MaterialTheme.colorScheme.primaryContainer),
                    ) { FeelingHeart(Feeling.LIKED, tint = MaterialTheme.colorScheme.onPrimaryContainer, size = 48.dp) }
                } else {
                    CoverMosaic(covers, Modifier.fillMaxSize())
                }
            }
            Column(Modifier.padding(start = 16.dp).weight(1f)) {
                Text("Liked songs", style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(sizeLine(tracks), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                newestLine(tracks)?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
                }
            }
        }
        if (tracks.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onPlay, modifier = Modifier.weight(1f)) {
                    Icon(AppIcons.play, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Play")
                }
                OutlinedButton(onClick = onShuffle, modifier = Modifier.weight(1f)) {
                    Icon(AppIcons.shuffle, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Shuffle")
                }
            }
        }
    }
}

/** Disliked songs' header: the cracked heart, how many, what a dislike does, and Undislike all. */
@Composable
private fun DislikedHeader(tracks: List<TrackSummaryDto>, onClearAll: () -> Unit) {
    HeaderCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(96.dp).clip(coverShape(14.dp)).background(MaterialTheme.colorScheme.surfaceContainerHighest),
            ) { FeelingHeart(Feeling.DISLIKED, tint = MaterialTheme.colorScheme.onSurfaceVariant, size = 48.dp) }
            Column(Modifier.padding(start = 16.dp).weight(1f)) {
                Text("Disliked songs", style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(sizeLine(tracks), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Text(
            "Shuffle picks these about one pass in four. They still play when you pick them. Tap a heart to undislike one.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp),
        )
        if (tracks.isNotEmpty()) {
            OutlinedButton(onClick = onClearAll, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text("Undislike all") }
        }
    }
}

@Composable
private fun HeaderCard(content: @Composable () -> Unit) {
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Column(Modifier.padding(14.dp)) { content() }
    }
}

/**
 * A song: its cover, title, artist and album, its length, and the heart. A disliked song's cover and text are dimmed.
 * The playing song is marked as in the album and queue lists.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SongListRow(
    track: TrackSummaryDto,
    cover: String?,
    isCurrent: Boolean,
    dim: Boolean,
    onClick: () -> Unit,
    onMenu: () -> Unit,
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
                    onMenu()
                },
            )
            .padding(start = 16.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            CoverImage(
                url = cover,
                contentDescription = null,
                cornerRadius = 8.dp,
                modifier = Modifier.size(48.dp).alpha(if (dim) 0.5f else 1f),
            )
            if (isCurrent && markPlaying) PlayingMarker()
        }
        Column(Modifier.padding(start = 14.dp).weight(1f).alpha(if (dim) 0.7f else 1f)) {
            Text(
                track.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (isCurrent) FontWeight.Bold else null,
                color = if (isCurrent) MaterialTheme.colorScheme.primary else Color.Unspecified,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(track.artist, track.album).joinToString(" · ").ifEmpty { "Unknown artist" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            formatDuration(track.duration),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 8.dp),
        )
        LikeButton(track.id)
    }
}

/** "128 songs · 8 h 12 min". */
private fun sizeLine(tracks: List<TrackSummaryDto>): String {
    val count = if (tracks.size == 1) "1 song" else "${tracks.size} songs"
    val seconds = tracks.sumOf { it.duration ?: 0.0 }.toLong()
    if (seconds <= 0) return count
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val length = if (hours > 0) "$hours h $minutes min" else "$minutes min"
    return "$count · $length"
}

/** "Last liked today", from the newest like; null when the server didn't say. */
private fun newestLine(tracks: List<TrackSummaryDto>): String? {
    val newest = tracks.firstOrNull()?.favoritedAt?.let(::likedAt) ?: return null
    val days = Duration.between(newest, LocalDateTime.now(ZoneOffset.UTC)).toDays()
    return when {
        days < 1 -> "Last liked today"
        days < 2 -> "Last liked yesterday"
        days < 30 -> "Last liked $days days ago"
        else -> null
    }
}

private val SqliteTime = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

private fun likedAt(text: String): LocalDateTime? = runCatching { LocalDateTime.parse(text, SqliteTime) }.getOrNull()

/**
 * Liked songs by when they were liked, newest first: This week, This month, Earlier. One group, or no dates from an
 * older server, means no headings.
 */
private fun likedGroups(tracks: List<TrackSummaryDto>): List<Pair<String?, List<Int>>> {
    val now = LocalDateTime.now(ZoneOffset.UTC)
    val labelled = tracks.indices.groupBy { i ->
        val at = tracks[i].favoritedAt?.let(::likedAt) ?: return listOf(null to tracks.indices.toList())
        val days = Duration.between(at, now).toDays()
        when {
            days < 7 -> "This week"
            days < 30 -> "This month"
            else -> "Earlier"
        }
    }
    if (labelled.size <= 1) return listOf(null to tracks.indices.toList())
    return listOf("This week", "This month", "Earlier").mapNotNull { label -> labelled[label]?.let { label to it } }
}
