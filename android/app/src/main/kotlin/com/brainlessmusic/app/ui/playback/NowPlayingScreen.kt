package com.brainlessmusic.app.ui.playback

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
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
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.Repeat
import com.brainlessmusic.app.playback.StreamInfo
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.formatDuration

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowPlayingScreen(
    onBack: () -> Unit,
    viewModel: PlaybackViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val seekStyle by viewModel.seekStyle.collectAsStateWithLifecycle()
    val current = state.current
    var showQueue by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Now playing") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Close")
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
        ) {
            CoverImage(
                url = current.coverUrl,
                contentDescription = current.album,
                cornerRadius = 20.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f),
            )

            // Three lines, left-aligned: what it is, who made it, what it came from.
            Column(modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
                Text(
                    current.title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
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

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 16.dp).navigationBarsPadding(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                StreamReadout(state.stream, modifier = Modifier.weight(1f))
                IconButton(onClick = { showQueue = true }) {
                    Icon(Icons.AutoMirrored.Filled.QueueMusic, contentDescription = "Queue")
                }
            }
        }
    }

    if (showQueue) {
        QueueSheet(state = state, onSkipTo = viewModel::skipTo, onDismiss = { showQueue = false })
    }
}

@Composable
private fun TransportRow(state: PlaybackUiState, viewModel: PlaybackViewModel) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        // Lit while on, so the state reads at a glance without a label.
        IconButton(
            onClick = viewModel::toggleShuffle,
            colors = IconButtonDefaults.iconButtonColors(
                contentColor = if (state.shuffle) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        ) {
            Icon(Icons.Filled.Shuffle, contentDescription = if (state.shuffle) "Shuffle on" else "Shuffle off")
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

/** What is actually coming down the wire, in two short lines. Hidden until the player knows anything. */
@Composable
private fun StreamReadout(stream: StreamInfo?, modifier: Modifier = Modifier) {
    val format = stream?.let { info ->
        listOfNotNull(
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
        modifier = modifier.padding(end = 12.dp),
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QueueSheet(state: PlaybackUiState, onSkipTo: (Int) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState()) {
        Text(
            "Queue · ${state.queue.size} track${if (state.queue.size == 1) "" else "s"}",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
        )
        // Opens on what is playing, not at the top of a long queue.
        val listState = rememberLazyListState(initialFirstVisibleItemIndex = (state.currentIndex - 1).coerceAtLeast(0))
        LazyColumn(state = listState, modifier = Modifier.navigationBarsPadding()) {
            itemsIndexed(state.queue, key = { index, item -> "$index-${item.trackId}" }) { index, item ->
                val isCurrent = index == state.currentIndex
                ListItem(
                    headlineContent = {
                        Text(
                            item.title,
                            fontWeight = if (isCurrent) FontWeight.Bold else null,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    supportingContent = item.artist?.let { artist -> { Text(artist, maxLines = 1, overflow = TextOverflow.Ellipsis) } },
                    trailingContent = { Text(formatDuration(item.durationSec), style = MaterialTheme.typography.bodySmall) },
                    colors = ListItemDefaults.colors(
                        containerColor = if (isCurrent) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent,
                    ),
                    modifier = Modifier.clickable { onSkipTo(index) },
                )
            }
        }
    }
}
