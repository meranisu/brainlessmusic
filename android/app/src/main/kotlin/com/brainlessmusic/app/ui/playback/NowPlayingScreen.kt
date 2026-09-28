package com.brainlessmusic.app.ui.playback

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.formatDuration

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowPlayingScreen(
    onBack: () -> Unit,
    viewModel: PlaybackViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val current = state.current

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
        var dragMs by remember { mutableStateOf<Float?>(null) }
        val durationMs = state.durationMs.coerceAtLeast(1)
        val shownMs = (dragMs ?: state.positionMs.toFloat()).coerceIn(0f, durationMs.toFloat())

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CoverImage(
                        url = current.coverUrl,
                        contentDescription = current.album,
                        cornerRadius = 16.dp,
                        modifier = Modifier
                            .fillMaxWidth(0.8f)
                            .aspectRatio(1f),
                    )
                    Text(
                        current.title,
                        style = MaterialTheme.typography.titleLarge,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 24.dp),
                    )
                    Text(
                        listOfNotNull(current.artist, current.album).joinToString(" — "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )

                    Slider(
                        value = shownMs,
                        onValueChange = { dragMs = it },
                        onValueChangeFinished = {
                            dragMs?.let { viewModel.seekTo(it.toLong()) }
                            dragMs = null
                        },
                        valueRange = 0f..durationMs.toFloat(),
                        enabled = state.durationMs > 0,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(formatDuration(shownMs / 1000.0), style = MaterialTheme.typography.bodySmall)
                        Text(formatDuration(state.durationMs / 1000.0), style = MaterialTheme.typography.bodySmall)
                    }

                    Row(
                        modifier = Modifier.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(24.dp),
                    ) {
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
                    }

                    state.error?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }

                    Text(
                        "Queue",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp, bottom = 4.dp),
                    )
                }
            }

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
                    modifier = Modifier.clickable { viewModel.skipTo(index) },
                )
            }
        }
    }
}
