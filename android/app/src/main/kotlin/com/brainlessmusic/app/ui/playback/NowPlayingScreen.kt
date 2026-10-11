package com.brainlessmusic.app.ui.playback

import android.widget.Toast
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.DataSaverOff
import androidx.compose.material.icons.filled.DataSaverOn
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.Repeat
import com.brainlessmusic.app.playback.ShuffleMode
import com.brainlessmusic.app.playback.StreamInfo
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.profile.AddToPlaylistSheet
import com.brainlessmusic.app.ui.profile.LikeButton
import com.brainlessmusic.app.ui.profile.SongActionsViewModel
import com.brainlessmusic.app.ui.profile.SongMenuSheet
import com.brainlessmusic.app.ui.theme.accentInk
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowPlayingScreen(
    onBack: () -> Unit,
    onOpenAlbum: (Int) -> Unit,
    viewModel: PlaybackViewModel = hiltViewModel(),
    songActions: SongActionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val seekStyle by viewModel.seekStyle.collectAsStateWithLifecycle()
    val dataSaver by viewModel.dataSaver.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val current = state.current
    var showQueue by remember { mutableStateOf(false) }
    var addingToPlaylist by remember { mutableStateOf(false) }
    var showMenu by remember { mutableStateOf(false) }
    val haptics = LocalHapticFeedback.current
    // The screen follows a downward drag and closes past 96 dp; the cover follows a sideways one to skip.
    val dismiss = remember { Animatable(0f) }
    val skip = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()

    Scaffold(
        modifier = Modifier
            .graphicsLayer { translationY = dismiss.value }
            .verticalSwipe(
                down = true,
                distance = 96.dp,
                offset = dismiss,
                onSwipe = {
                    onBack()
                    // Back is ignored mid-transition; if the screen is still here, it comes back down rather than stick.
                    scope.launch {
                        delay(600)
                        dismiss.animateTo(0f)
                    }
                },
            ),
        topBar = {
            TopAppBar(
                title = { Text("Now playing") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Close")
                    }
                },
                // Data saver, lit while on, for everyone; like and add to a playlist (A65) hide themselves for guests.
                actions = {
                    IconButton(
                        onClick = {
                            viewModel.setDataSaver(!dataSaver)
                            Toast.makeText(
                                context,
                                if (dataSaver) "Data saver off. Next songs stream as the originals." else "Data saver on. Next songs stream smaller.",
                                Toast.LENGTH_SHORT,
                            ).show()
                        },
                        colors = IconButtonDefaults.iconButtonColors(
                            contentColor = if (dataSaver) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    ) {
                        Icon(
                            if (dataSaver) Icons.Filled.DataSaverOn else Icons.Filled.DataSaverOff,
                            contentDescription = if (dataSaver) "Data saver on" else "Data saver off",
                        )
                    }
                    if (current != null && songActions.canEdit) {
                        LikeButton(current.trackId, viewModel = songActions)
                        IconButton(onClick = { addingToPlaylist = true }) {
                            Icon(Icons.AutoMirrored.Filled.PlaylistAdd, contentDescription = "Add to playlist")
                        }
                    }
                },
            )
        },
    ) { padding ->
        if (current == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Nothing is playing.", style = MaterialTheme.typography.bodyMedium)
            }
            return@Scaffold
        }

        // Held while dragging so the thumb follows the finger instead of fighting the ticking position.
        var dragFraction by remember { mutableStateOf<Float?>(null) }
        val durationMs = state.durationMs.coerceAtLeast(1)
        val fraction = dragFraction ?: (state.positionMs.toFloat() / durationMs)
        val shownMs = fraction.coerceIn(0f, 1f) * durationMs

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp),
        ) {
            // The cover is the largest square that fits above the controls. Swipe it to skip, hold it for the song menu.
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .swipeToSkip(
                        offset = skip,
                        canNext = state.hasNext,
                        canPrevious = state.hasPrevious,
                        onNext = viewModel::next,
                        onPrevious = viewModel::previousTrack,
                    )
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onLongPress = {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                showMenu = true
                            },
                        )
                    }
                    .semantics { onLongClick(label = "Song options") { showMenu = true; true } },
                contentAlignment = Alignment.Center,
            ) {
                CoverImage(
                    url = current.coverUrl,
                    contentDescription = current.album,
                    cornerRadius = 20.dp,
                    modifier = Modifier
                        .aspectRatio(1f)
                        .graphicsLayer {
                            translationX = skip.value
                            alpha = 1f - (abs(skip.value) / size.width.coerceAtLeast(1f)).coerceIn(0f, 0.6f)
                        },
                )
            }

            // Three lines, left-aligned: what it is, who made it, what it came from.
            Column(modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
                Text(
                    current.title,
                    style = MaterialTheme.typography.headlineMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    current.artist ?: "Unknown artist",
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    current.album ?: "Unknown album",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            SeekBar(
                style = seekStyle,
                fraction = fraction,
                playing = state.isPlaying,
                enabled = state.durationMs > 0,
                onFraction = { dragFraction = it },
                onFinished = {
                    dragFraction?.let { viewModel.seekTo((it * durationMs).toLong()) }
                    dragFraction = null
                },
                modifier = Modifier.padding(top = 12.dp),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatDuration(shownMs / 1000.0), style = MaterialTheme.typography.bodySmall)
                Text(formatDuration(state.durationMs / 1000.0), style = MaterialTheme.typography.bodySmall)
            }

            TransportRow(state, viewModel)

            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            // Clear air under the transport, so a thumb reaching for play/pause doesn't land on the readout.
            StreamReadout(state.stream, modifier = Modifier.fillMaxWidth().padding(top = 16.dp))

            // The way into the queue: the card says what is next and how much follows.
            UpNextCard(
                next = state.next,
                remaining = remainingInQueue(state),
                onClick = { showQueue = true },
                modifier = Modifier.padding(top = 8.dp, bottom = 16.dp).navigationBarsPadding(),
            )
        }
    }

    if (addingToPlaylist && current != null) {
        AddToPlaylistSheet(
            trackId = current.trackId,
            trackTitle = current.title,
            onDismiss = { addingToPlaylist = false },
            viewModel = songActions,
        )
    }

    if (showMenu && current != null) {
        SongMenuSheet(
            item = current,
            onDismiss = { showMenu = false },
            onOpenAlbum = onOpenAlbum,
            showPlayNext = false,
            viewModel = songActions,
        )
    }

    if (showQueue) {
        QueueSheet(
            state = state,
            canPlayLessOften = viewModel.canPlayLessOften,
            onSkipTo = viewModel::skipTo,
            onRemove = viewModel::removeFromQueue,
            onPlayLessOften = viewModel::playLessOften,
            onUndo = viewModel::undoRemove,
            onMove = viewModel::moveInQueue,
            onDismiss = { showQueue = false },
        )
    }
}

@Composable
private fun TransportRow(state: PlaybackUiState, viewModel: PlaybackViewModel) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        // Lit while on, and the icon changes per mode, like repeat; the queue sheet names the mode in words.
        IconButton(
            onClick = viewModel::cycleShuffle,
            colors = IconButtonDefaults.iconButtonColors(
                contentColor = if (state.shuffle) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        ) {
            Icon(
                imageVector = when (state.shuffleMode) {
                    ShuffleMode.OFF, ShuffleMode.SHUFFLE -> Icons.Filled.Shuffle
                    ShuffleMode.REDISCOVER -> Icons.Filled.History
                    ShuffleMode.ALBUMS -> Icons.Filled.Album
                },
                contentDescription = when (state.shuffleMode) {
                    ShuffleMode.OFF -> "Shuffle off"
                    ShuffleMode.SHUFFLE -> "Shuffle on"
                    ShuffleMode.REDISCOVER -> "Rediscover: songs you have not played in a while first"
                    ShuffleMode.ALBUMS -> "Album shuffle: random albums, in track order"
                },
            )
        }
        IconButton(onClick = viewModel::previous, enabled = state.hasPrevious || state.positionMs > 3_000) {
            Icon(Icons.Filled.SkipPrevious, contentDescription = "Previous", modifier = Modifier.size(36.dp))
        }
        FilledIconButton(onClick = viewModel::togglePlayPause, modifier = Modifier.size(72.dp)) {
            if (state.isBuffering && !state.isPlaying) {
                CircularProgressIndicator(
                    modifier = Modifier.size(32.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 3.dp,
                )
            } else {
                Icon(
                    imageVector = if (state.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = if (state.isPlaying) "Pause" else "Play",
                    modifier = Modifier.size(40.dp),
                )
            }
        }
        IconButton(onClick = viewModel::next, enabled = state.hasNext) {
            Icon(Icons.Filled.SkipNext, contentDescription = "Next", modifier = Modifier.size(36.dp))
        }
        IconButton(
            onClick = viewModel::cycleRepeat,
            colors = IconButtonDefaults.iconButtonColors(
                contentColor = if (state.repeat != Repeat.OFF) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        ) {
            Icon(
                imageVector = if (state.repeat == Repeat.ONE) Icons.Filled.RepeatOne else Icons.Filled.Repeat,
                contentDescription = when (state.repeat) {
                    Repeat.OFF -> "Repeat off"
                    Repeat.ALL -> "Repeating the queue"
                    Repeat.ONE -> "Repeating this track"
                },
            )
        }
    }
}

/** Tracks after the current one, in play order (the shuffled order when shuffle is on). */
private fun remainingInQueue(state: PlaybackUiState): Int {
    val order = if (state.shuffle && state.playOrder.size == state.queue.size) state.playOrder else state.queue.indices.toList()
    val position = order.indexOf(state.currentIndex)
    return if (position < 0) 0 else order.size - position - 1
}

/** What plays next, in play order (shuffled when shuffle is on), and how many follow. Tapping opens the queue. */
@Composable
private fun UpNextCard(next: QueueItem?, remaining: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClickLabel = "Open queue", onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (next != null) {
                CoverImage(url = next.coverUrl, contentDescription = null, cornerRadius = 8.dp, modifier = Modifier.size(44.dp))
            }
            Column(modifier = Modifier.weight(1f).padding(start = if (next != null) 12.dp else 4.dp)) {
                Text("UP NEXT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.accentInk)
                Text(
                    next?.title ?: "End of the queue",
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                next?.artist?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(start = 8.dp)) {
                Icon(
                    Icons.AutoMirrored.Filled.QueueMusic,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (remaining > 0) {
                    Text(
                        "$remaining",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics { contentDescription = "$remaining tracks queued" },
                    )
                }
            }
        }
    }
}

/** What is actually coming down the wire, in two short lines. Hidden until the player knows anything. */
@Composable
private fun StreamReadout(stream: StreamInfo?, modifier: Modifier = Modifier) {
    val format = stream?.let { info ->
        listOfNotNull(
            if (info.dataSaver) "Data saver" else null,
            info.codec,
            info.sampleRateHz?.let { "%.1f kHz".format(it / 1000.0) },
            info.channels?.let { if (it == 2) "stereo" else if (it == 1) "mono" else "$it ch" },
            info.bitrateKbps?.let { "$it kbps" },
        ).joinToString(" · ")
    }?.takeIf { it.isNotEmpty() }
    val network = stream?.let { info ->
        listOfNotNull(
            "buffered ${formatDuration(info.bufferedAheadMs / 1000.0)} ahead",
            info.networkKbps?.let { "network ~%.1f Mbps".format(it / 1000.0) },
        ).joinToString(" · ")
    }
    if (format == null && network == null) return

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = modifier,
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            format?.let { Text(it, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            network?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
