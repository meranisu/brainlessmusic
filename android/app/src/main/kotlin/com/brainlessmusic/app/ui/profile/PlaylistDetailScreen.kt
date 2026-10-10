package com.brainlessmusic.app.ui.profile

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.PlaylistDetailDto
import com.brainlessmusic.app.data.remote.dto.PlaylistTrackDto
import com.brainlessmusic.app.data.repository.AddToPlaylistResult
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.playback.MiniPlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState
import javax.inject.Inject

private val RowShape = RoundedCornerShape(12.dp)
private val RemoveColor = Color(0xFFDC2626)

/** A song taken out of a playlist, and the order to put back on Undo. */
data class RemovedPlaylistTrack(val track: PlaylistTrackDto, val orderBefore: List<Int>)

@HiltViewModel
class PlaylistDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val profile: ProfileRepository,
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
) : ViewModel() {

    val playlistId: Int = checkNotNull(savedStateHandle[Routes.ARG_PLAYLIST_ID])

    private val _state = MutableStateFlow<LoadState<PlaylistDetailDto>>(LoadState.Loading)
    val state: StateFlow<LoadState<PlaylistDetailDto>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            profile.playlist(playlistId).fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { _state.value = LoadState.Error(it.loadMessage()) },
            )
        }
    }

    private fun current(): PlaylistDetailDto? = (_state.value as? LoadState.Content)?.data

    fun play(startIndex: Int, shuffle: Boolean = false) {
        val playlist = current() ?: return
        if (playlist.tracks.isEmpty()) return
        playbackController.playQueue(playlist.tracks.map(::queueItem), startIndex, shuffle = if (shuffle) true else null)
    }

    private fun queueItem(track: PlaylistTrackDto) = QueueItem(
        trackId = track.id,
        title = track.title,
        artist = track.artist,
        album = track.album,
        durationSec = track.duration,
        coverUrl = libraryRepository.trackCoverUrl(track.id),
        format = track.format,
    )

    fun rename(name: String) {
        viewModelScope.launch {
            profile.renamePlaylist(playlistId, name).onSuccess { renamed ->
                current()?.let { _state.value = LoadState.Content(it.copy(name = renamed.name)) }
            }
        }
    }

    fun delete(onDeleted: () -> Unit) {
        viewModelScope.launch { profile.deletePlaylist(playlistId).onSuccess { onDeleted() } }
    }

    /** Shown at once, saved in the background; a failed save reloads what the server has. */
    fun remove(trackId: Int): RemovedPlaylistTrack? {
        val playlist = current() ?: return null
        val track = playlist.tracks.firstOrNull { it.id == trackId } ?: return null
        val before = playlist.tracks.map { it.id }
        _state.value = LoadState.Content(playlist.copy(tracks = playlist.tracks.filter { it.id != trackId }))
        viewModelScope.launch { profile.removeFromPlaylist(playlistId, trackId).onFailure { load() } }
        return RemovedPlaylistTrack(track, before)
    }

    /** Adds the song back (it lands at the end) and restores the order it had. */
    fun undoRemove(removed: RemovedPlaylistTrack) {
        viewModelScope.launch {
            if (profile.addToPlaylist(playlistId, removed.track.id) == AddToPlaylistResult.FAILED) return@launch load()
            profile.reorderPlaylist(playlistId, removed.orderBefore).fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { load() },
            )
        }
    }

    /** The order after a drag, saved once on drop. */
    fun saveOrder(trackIds: List<Int>) {
        val playlist = current() ?: return
        val byId = playlist.tracks.associateBy { it.id }
        _state.value = LoadState.Content(playlist.copy(tracks = trackIds.mapNotNull { byId[it] }))
        viewModelScope.launch {
            profile.reorderPlaylist(playlistId, trackIds).onFailure { load() }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistDetailScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: PlaylistDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var menuOpen by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    val playlist = (state as? LoadState.Content)?.data

    if (renaming && playlist != null) {
        PlaylistNameDialog("Rename playlist", "Rename", playlist.name, viewModel::rename) { renaming = false }
    }
    if (confirmingDelete && playlist != null) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text("Delete \"${playlist.name}\"?") },
            text = { Text("The playlist goes. The songs stay in your library.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    viewModel.delete(onBack)
                }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { confirmingDelete = false }) { Text("Keep") } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(playlist?.name ?: "Playlist", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    if (playlist != null) {
                        Box {
                            IconButton(onClick = { menuOpen = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "More") }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                DropdownMenuItem(text = { Text("Rename") }, onClick = {
                                    menuOpen = false
                                    renaming = true
                                })
                                DropdownMenuItem(text = { Text("Delete playlist") }, onClick = {
                                    menuOpen = false
                                    confirmingDelete = true
                                })
                            }
                        }
                    }
                },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { it.tracks.isEmpty() },
            emptyMessage = "No songs yet. Add some from Now Playing or an album's song menu.",
            loadingLabel = "Loading playlist",
            skeleton = { SkeletonListRows(trailing = true) },
        ) { detail ->
            // Dragging reorders this copy; the server hears about it once, on drop.
            var rows by remember { mutableStateOf(detail.tracks) }
            var dragging by remember { mutableStateOf(false) }
            LaunchedEffect(detail.tracks) { if (!dragging) rows = detail.tracks }
            val listState = rememberLazyListState()
            // The header is item 0, so list positions are one behind lazy indices.
            val reorderState = rememberReorderableLazyListState(listState) { from, to ->
                if (from.index == 0 || to.index == 0) return@rememberReorderableLazyListState
                rows = rows.toMutableList().apply { add(to.index - 1, removeAt(from.index - 1)) }
            }

            LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                item(key = "header") {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    ) {
                        Button(onClick = { viewModel.play(0) }) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null)
                            Text("Play", modifier = Modifier.padding(start = 6.dp))
                        }
                        OutlinedButton(onClick = { viewModel.play(0, shuffle = true) }) {
                            Icon(Icons.Filled.Shuffle, contentDescription = null)
                            Text("Shuffle", modifier = Modifier.padding(start = 6.dp))
                        }
                        Text(
                            if (rows.size == 1) "1 song" else "${rows.size} songs",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                        )
                    }
                }
                items(rows, key = { it.id }) { track ->
                    ReorderableItem(reorderState, key = track.id) { isDragging ->
                        val elevation by animateDpAsState(if (isDragging) 6.dp else 0.dp, label = "drag")
                        PlaylistRow(
                            track = track,
                            elevation = elevation,
                            onClick = { viewModel.play(rows.indexOfFirst { it.id == track.id }.coerceAtLeast(0)) },
                            onRemove = {
                                val removed = viewModel.remove(track.id) ?: return@PlaylistRow
                                scope.launch {
                                    snackbar.currentSnackbarData?.dismiss()
                                    val result = snackbar.showSnackbar("Removed \"${track.title}\"", actionLabel = "Undo")
                                    if (result == SnackbarResult.ActionPerformed) viewModel.undoRemove(removed)
                                }
                            },
                            handle = {
                                Icon(
                                    Icons.Filled.DragHandle,
                                    contentDescription = "Drag to move",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.draggableHandle(
                                        onDragStarted = { dragging = true },
                                        onDragStopped = {
                                            dragging = false
                                            val order = rows.map { it.id }
                                            if (order != detail.tracks.map { it.id }) viewModel.saveOrder(order)
                                        },
                                    ),
                                )
                            },
                        )
                    }
                }
            }
        }
    }
}

/** Swipe left to remove (red, bin), drag the handle to move. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlaylistRow(
    track: PlaylistTrackDto,
    elevation: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
    onRemove: () -> Unit,
    handle: @Composable () -> Unit,
) {
    val swipe = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) onRemove()
            // The row leaves with the list change; snapping back covers a removal that didn't happen.
            false
        },
    )
    SwipeToDismissBox(
        state = swipe,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            if (swipe.dismissDirection == SwipeToDismissBoxValue.EndToStart) {
                Box(
                    contentAlignment = Alignment.CenterEnd,
                    modifier = Modifier.fillMaxSize().background(RemoveColor, RowShape).padding(horizontal = 20.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Remove", color = Color.White, style = MaterialTheme.typography.labelLarge)
                        Icon(Icons.Filled.Delete, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                    }
                }
            }
        },
        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp).clip(RowShape),
    ) {
        Surface(shape = RowShape, color = MaterialTheme.colorScheme.surface, shadowElevation = elevation) {
            ListItem(
                headlineContent = { Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                supportingContent = {
                    Text(
                        listOfNotNull(track.artist, track.album).joinToString(" · ").ifEmpty { "Unknown artist" },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                trailingContent = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(formatDuration(track.duration), style = MaterialTheme.typography.bodySmall)
                        handle()
                    }
                },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.clickable(onClick = onClick),
            )
        }
    }
}
