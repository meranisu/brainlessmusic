package com.brainlessmusic.app.ui.playback

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.RemovedEntry
import com.brainlessmusic.app.playback.ShuffleMode
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.theme.SheetStatusBarFollowsApp
import kotlinx.coroutines.launch
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState
import com.brainlessmusic.app.ui.common.PlayingMarker
import com.brainlessmusic.app.ui.common.markPlaying
import com.brainlessmusic.app.ui.theme.rowShape
import com.brainlessmusic.app.ui.theme.AppIcons

// Rows and the header sit on the player's 24 dp sides, like its Up next card, with that card's 12 dp inside a row.
private val SidePadding = 24.dp
private val RowInnerPadding = 12.dp

// Fixed rather than themed: red and blue read as "remove" and "less" in every colour theme, and the default theme's
// accent is already orange.
private val RemoveColor = Color(0xFFDC2626)
private val LessOftenColor = Color(0xFF2563EB)

/** One queue entry as the sheet lists it: [key] is stable across moves, [queueIndex] is where it sits now. */
private data class QueueRow(val key: Long, val queueIndex: Int, val item: QueueItem)

/**
 * The queue, in play order. Swipe left to remove, right to play less often (accounts only), drag the handle to move,
 * search to narrow it down. The playing track can't be swiped or searched away from its highlight.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueSheet(
    state: PlaybackUiState,
    canPlayLessOften: Boolean,
    onSkipTo: (Int) -> Unit,
    onRemove: (Int) -> RemovedEntry?,
    onPlayLessOften: (Int) -> RemovedEntry?,
    onUndo: (RemovedEntry, lessOften: Boolean) -> Unit,
    onMove: (from: Int, to: Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val latest by rememberUpdatedState(state)
    var query by remember { mutableStateOf("") }

    // With shuffle on, the list order is not the play order; show what will actually play, in that order.
    val order = if (state.shuffle && state.playOrder.size == state.queue.size) state.playOrder else state.queue.indices.toList()
    val fromState = order.mapNotNull { i -> state.keys.getOrNull(i)?.let { QueueRow(it, i, state.queue[i]) } }

    // Dragging reorders this copy live; the player hears about it once, on drop.
    var rows by remember { mutableStateOf(fromState) }
    var dragFrom by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(fromState) { if (dragFrom == null) rows = fromState }
    // For a drop that moves nothing: no state change follows it, so the rows catch up with any change made during
    // the drag (a refill appending songs) here, or they'd stay stale until the next edit (C32).
    val latestFromState by rememberUpdatedState(fromState)

    val searching = query.isNotBlank()
    val shown = if (searching) {
        val q = query.trim()
        rows.filter { row ->
            row.item.title.contains(q, ignoreCase = true) ||
                row.item.artist?.contains(q, ignoreCase = true) == true ||
                row.item.album?.contains(q, ignoreCase = true) == true
        }
    } else {
        rows
    }

    // Opens on what is playing, not at the top of a long queue.
    val currentPosition = rows.indexOfFirst { it.queueIndex == state.currentIndex }.coerceAtLeast(0)
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = (currentPosition - 1).coerceAtLeast(0))
    val reorderState = rememberReorderableLazyListState(listState) { from, to ->
        rows = rows.toMutableList().apply { add(to.index, removeAt(from.index)) }
    }

    fun act(key: Long, lessOften: Boolean) {
        // By key, not index: the queue may have shifted since this row was drawn, and a swipe must only ever hit its own row.
        val index = latest.keys.indexOf(key).takeIf { it >= 0 } ?: return
        val removed = (if (lessOften) onPlayLessOften(index) else onRemove(index)) ?: return
        scope.launch {
            snackbar.currentSnackbarData?.dismiss()
            val result = snackbar.showSnackbar(
                message = if (lessOften) "You'll hear \"${removed.item.title}\" less often" else "Removed \"${removed.item.title}\"",
                actionLabel = "Undo",
                withDismissAction = false,
                // With an action, M3 defaults to Indefinite, which left it over the bottom rows until something else happened.
                duration = SnackbarDuration.Long,
            )
            if (result == SnackbarResult.ActionPerformed) onUndo(removed, lessOften)
        }
    }

    // Edge to edge, the fully open sheet runs under the status bar and the camera cutout. Pad the top by however much
    // of the sheet is under it, so the handle and title clear it there without a gap when the sheet is half open.
    val density = LocalDensity.current
    val statusBarTop = WindowInsets.statusBars.getTop(density)
    val sheetTop = runCatching { sheetState.requireOffset() }.getOrDefault(Float.MAX_VALUE)
    val underStatusBar = with(density) { (statusBarTop - sheetTop).coerceAtLeast(0f).toDp() }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        dragHandle = {
            Box(Modifier.padding(top = underStatusBar)) { BottomSheetDefaults.DragHandle() }
        },
    ) {
        SheetStatusBarFollowsApp()
        Box {
            Column {
                // One line: the title on the left edge, the count and shuffle mode on the right, sharing a baseline.
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = SidePadding),
                ) {
                    Text(
                        "Queue",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.alignByBaseline(),
                    )
                    Text(
                        "${state.queue.size} track${if (state.queue.size == 1) "" else "s"}" + when (state.shuffleMode) {
                            ShuffleMode.OFF -> ""
                            ShuffleMode.SHUFFLE -> " · shuffled"
                            // A fixed queue (album, playlist, search) has no play history to go on, so it plays shuffled.
                            ShuffleMode.REDISCOVER -> if (state.fromLibrary) " · rediscover" else " · shuffled"
                            ShuffleMode.ALBUMS -> " · album shuffle"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.End,
                        maxLines = 1,
                        modifier = Modifier.weight(1f).padding(start = 12.dp).alignByBaseline(),
                    )
                }
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search the queue") },
                    leadingIcon = { Icon(AppIcons.search, contentDescription = null) },
                    trailingIcon = if (searching) {
                        {
                            IconButton(onClick = { query = "" }) { Icon(AppIcons.clear, contentDescription = "Clear search") }
                        }
                    } else {
                        null
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(28.dp),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = SidePadding, vertical = 12.dp),
                )

                if (searching && shown.isEmpty()) {
                    Text(
                        "Nothing in the queue matches.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(24.dp).navigationBarsPadding(),
                    )
                }

                LazyColumn(state = listState, modifier = Modifier.navigationBarsPadding()) {
                    items(shown, key = { it.key }) { row ->
                        ReorderableItem(reorderState, key = row.key, enabled = !searching) { isDragging ->
                            val isCurrent = row.queueIndex == state.currentIndex
                            val elevation by animateDpAsState(if (isDragging) 6.dp else 0.dp, label = "drag")
                            QueueRowItem(
                                row = row,
                                isCurrent = isCurrent,
                                canPlayLessOften = canPlayLessOften,
                                elevation = elevation,
                                onClick = { onSkipTo(row.queueIndex) },
                                onRemove = { act(row.key, lessOften = false) },
                                onPlayLessOften = { act(row.key, lessOften = true) },
                                handle = if (searching) {
                                    null
                                } else {
                                    {
                                        Icon(
                                            AppIcons.dragHandle,
                                            contentDescription = "Drag to move",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.draggableHandle(
                                                onDragStarted = { dragFrom = rows.indexOfFirst { it.key == row.key } },
                                                onDragStopped = {
                                                    val from = dragFrom
                                                    val to = rows.indexOfFirst { it.key == row.key }
                                                    dragFrom = null
                                                    if (from != null && to >= 0 && from != to) onMove(from, to) else rows = latestFromState
                                                },
                                            ).padding(8.dp),
                                        )
                                    }
                                },
                            )
                        }
                    }
                }
            }
            SnackbarHost(snackbar, modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QueueRowItem(
    row: QueueRow,
    isCurrent: Boolean,
    canPlayLessOften: Boolean,
    elevation: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
    onRemove: () -> Unit,
    onPlayLessOften: () -> Unit,
    handle: (@Composable () -> Unit)?,
) {
    val swipe = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.EndToStart -> onRemove()
                SwipeToDismissBoxValue.StartToEnd -> onPlayLessOften()
                SwipeToDismissBoxValue.Settled -> Unit
            }
            // The row leaves with the queue change; snapping back covers a removal that didn't happen.
            false
        },
    )
    SwipeToDismissBox(
        state = swipe,
        enableDismissFromStartToEnd = !isCurrent && canPlayLessOften,
        enableDismissFromEndToStart = !isCurrent,
        backgroundContent = { SwipeBackground(swipe.dismissDirection) },
        modifier = Modifier.padding(horizontal = SidePadding, vertical = 2.dp).clip(MaterialTheme.rowShape),
    ) {
        Surface(
            shape = MaterialTheme.rowShape,
            color = if (isCurrent) MaterialTheme.colorScheme.secondaryContainer else BottomSheetDefaults.ContainerColor,
            shadowElevation = elevation,
        ) {
            // The handle brings its own 8 dp of touch room, so the row's end padding is smaller with it.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onClick)
                    .padding(start = RowInnerPadding, end = if (handle != null) 4.dp else RowInnerPadding)
                    .heightIn(min = 56.dp),
            ) {
                if (isCurrent && markPlaying) PlayingMarker(Modifier.padding(end = 12.dp))
                Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
                    Text(
                        row.item.title,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (isCurrent) FontWeight.Bold else null,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    row.item.artist?.let { artist ->
                        Text(
                            artist,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Text(
                    formatDuration(row.item.durationSec),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 12.dp),
                )
                handle?.invoke()
            }
        }
    }
}

/** Red with a bin to remove, blue with a falling line for less often; the label says it too, not just the colour. */
@Composable
private fun SwipeBackground(direction: SwipeToDismissBoxValue) {
    val (color, alignment) = when (direction) {
        SwipeToDismissBoxValue.EndToStart -> RemoveColor to Alignment.CenterEnd
        SwipeToDismissBoxValue.StartToEnd -> LessOftenColor to Alignment.CenterStart
        SwipeToDismissBoxValue.Settled -> Color.Transparent to Alignment.Center
    }
    Box(
        modifier = Modifier.fillMaxSize().background(color, MaterialTheme.rowShape).padding(horizontal = 20.dp),
        contentAlignment = alignment,
    ) {
        when (direction) {
            SwipeToDismissBoxValue.EndToStart -> SwipeLabel(AppIcons.delete, "Remove", iconFirst = false)
            SwipeToDismissBoxValue.StartToEnd -> SwipeLabel(AppIcons.lessOften, "Less often", iconFirst = true)
            SwipeToDismissBoxValue.Settled -> Unit
        }
    }
}

@Composable
private fun SwipeLabel(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, iconFirst: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (iconFirst) Icon(icon, contentDescription = null, tint = Color.White)
        Text(label, color = Color.White, style = MaterialTheme.typography.labelLarge)
        if (!iconFirst) Icon(icon, contentDescription = null, tint = Color.White)
    }
}
