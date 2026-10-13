package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.ui.common.Notices
import androidx.media3.common.util.UnstableApi
import com.brainlessmusic.app.downloads.DownloadRepository
import com.brainlessmusic.app.downloads.GroupDownload
import com.brainlessmusic.app.downloads.groupDownload
import com.brainlessmusic.app.ui.downloads.DownloadButton
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.runtime.produceState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.platform.LocalContext
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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState
import javax.inject.Inject
import com.brainlessmusic.app.ui.theme.rowShape
import com.brainlessmusic.app.ui.theme.AppIcons

private val RemoveColor = Color(0xFFDC2626)

/** A song taken out of a playlist, and the order to put back on Undo. */
/** A swiped-away song and the row it was on, for Undo. */
data class RemovedPlaylistTrack(val track: PlaylistTrackDto, val index: Int)

@androidx.annotation.OptIn(UnstableApi::class)
@HiltViewModel
class PlaylistDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val profile: ProfileRepository,
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
    private val downloadRepository: DownloadRepository,
) : ViewModel() {

    val playlistId: Int = checkNotNull(savedStateHandle[Routes.ARG_PLAYLIST_ID])

    /** A guest can open someone else's public playlist but not copy it (A163). */
    val isGuest: Boolean get() = profile.isGuest

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

    /** Follows the playlist as it is now, so a song added since the download shows the button as not done. */
    val download: StateFlow<GroupDownload> =
        combine(state, downloadRepository.downloads) { s, downloads ->
            if (s is LoadState.Content) groupDownload(s.data.tracks.map { it.id }, downloads) else GroupDownload.None
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), GroupDownload.None)

    /** Downloads it as it is now; doing it again after an edit fetches new songs and lets go of removed ones. */
    fun download(onRefused: (String) -> Unit) {
        current()?.let { downloadRepository.downloadPlaylist(it, onRefused) }
    }

    fun removeDownload() {
        current()?.let { p -> downloadRepository.removeGroup("playlist:${p.id}", p.tracks.map { it.id }) }
    }

    fun play(startIndex: Int, shuffle: Boolean = false) {
        val playlist = current() ?: return
        if (playlist.tracks.isEmpty()) return
        // Shuffle starts from a random song; a start of 0 would always open on the first one.
        val start = if (shuffle) playlist.tracks.indices.random() else startIndex
        playbackController.playQueue(playlist.tracks.map(::queueItem), start, shuffle = if (shuffle) true else null)
    }

    /** Also for the song menu. */
    fun queueItem(track: PlaylistTrackDto) = QueueItem(
        trackId = track.id,
        title = track.title,
        artist = track.artist,
        album = track.album,
        durationSec = track.duration,
        coverUrl = libraryRepository.trackCoverUrl(track.id),
        format = track.format,
        albumId = track.albumId,
        trackNumber = track.trackNumber,
        gainDb = track.gainDb,
    )

    // This playlist's saves, one at a time and in order. A remove, an Undo and a drag otherwise race on the server:
    // an add could land before its own remove, or a reorder be judged against a song set that is about to change.
    private val edits = Mutex()

    private fun edit(block: suspend () -> Unit) {
        viewModelScope.launch { edits.withLock { block() } }
    }

    /** Your other playlists' names, for the rename dialog's duplicate warning; empty if they don't load. */
    suspend fun otherPlaylistNames(): List<String> =
        profile.playlists().getOrNull().orEmpty().filter { it.id != playlistId }.map { it.name }

    /** [onFailed] gets a short line to show. */
    fun rename(name: String, onFailed: (String) -> Unit) {
        edit {
            profile.renamePlaylist(playlistId, name).fold(
                onSuccess = { renamed -> current()?.let { _state.value = LoadState.Content(it.copy(name = renamed.name)) } },
                onFailure = { onFailed("Couldn't rename the playlist. Try again.") },
            )
        }
    }

    /** The public switch (A162), for the owner. */
    fun setPublic(isPublic: Boolean, onFailed: (String) -> Unit) {
        edit {
            profile.setPlaylistPublic(playlistId, isPublic).fold(
                onSuccess = {
                    current()?.let { _state.value = LoadState.Content(it.copy(isPublic = isPublic)) }
                    Notices.show(if (isPublic) "Public. Everyone here can find and play it." else "Private. Only you see it now.")
                },
                onFailure = { onFailed("Couldn't change that. Try again.") },
            )
        }
    }

    /** "Save a copy" (A162): your own private playlist with the same songs; [onCopied] gets its id. */
    fun saveCopy(onCopied: (Int) -> Unit, onFailed: (String) -> Unit) {
        viewModelScope.launch {
            profile.copyPlaylist(playlistId).fold(
                onSuccess = {
                    Notices.show("Saved as \"${it.name}\"")
                    onCopied(it.id)
                },
                onFailure = { onFailed("Couldn't save a copy. Try again.") },
            )
        }
    }

    fun delete(onDeleted: () -> Unit, onFailed: (String) -> Unit) {
        edit {
            profile.deletePlaylist(playlistId).fold(
                onSuccess = { onDeleted() },
                onFailure = { onFailed("Couldn't delete the playlist. Try again.") },
            )
        }
    }

    /** Shown at once, saved in the background; a failed save reloads what the server has. */
    fun remove(trackId: Int): RemovedPlaylistTrack? {
        val playlist = current() ?: return null
        val index = playlist.tracks.indexOfFirst { it.id == trackId }.takeIf { it >= 0 } ?: return null
        _state.value = LoadState.Content(playlist.copy(tracks = playlist.tracks.filter { it.id != trackId }))
        edit { profile.removeFromPlaylist(playlistId, trackId).onFailure { load() } }
        return RemovedPlaylistTrack(playlist.tracks[index], index)
    }

    /**
     * Puts the song back on its old row of the list as it is now, so a drag made since the remove is kept. On the
     * server it is added (at the end), then the order is set.
     */
    fun undoRemove(removed: RemovedPlaylistTrack) {
        val playlist = current() ?: return
        if (playlist.tracks.any { it.id == removed.track.id }) return
        val tracks = playlist.tracks.toMutableList().apply { add(removed.index.coerceIn(0, size), removed.track) }
        _state.value = LoadState.Content(playlist.copy(tracks = tracks))
        val order = tracks.map { it.id }
        edit {
            if (profile.addToPlaylist(playlistId, removed.track.id) == AddToPlaylistResult.FAILED) return@edit load()
            profile.reorderPlaylist(playlistId, order).fold(
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
        edit { profile.reorderPlaylist(playlistId, trackIds).onFailure { load() } }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistDetailScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    onOpenAlbum: (Int) -> Unit,
    onOpenArtist: (Int) -> Unit,
    onOpenPlaylist: (Int) -> Unit,
    onOpenProfile: (Int) -> Unit,
    viewModel: PlaylistDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var menuOpen by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var songMenuFor by remember { mutableStateOf<PlaylistTrackDto?>(null) }
    songMenuFor?.let { track ->
        SongMenuSheet(item = viewModel.queueItem(track), onDismiss = { songMenuFor = null }, onOpenAlbum = onOpenAlbum, onOpenArtist = onOpenArtist)
    }
    val playlist = (state as? LoadState.Content)?.data
    // Someone else's public playlist is read-only here (A162): no rename, delete, remove or reorder.
    val isMine = playlist?.isMine ?: true
    val context = LocalContext.current
    val download by viewModel.download.collectAsStateWithLifecycle()
    val showFailure: (String) -> Unit = { Notices.show(it) }

    if (renaming && playlist != null) {
        val otherNames by produceState(emptyList<String>()) { value = viewModel.otherPlaylistNames() }
        PlaylistNameDialog(
            title = "Rename playlist",
            confirmLabel = "Rename",
            initial = playlist.name,
            onConfirm = { name -> viewModel.rename(name, showFailure) },
            onDismiss = { renaming = false },
            takenNames = otherNames,
            ownName = playlist.name,
        )
    }
    if (confirmingDelete && playlist != null) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text("Delete \"${playlist.name}\"?") },
            text = { Text("The playlist goes. The songs stay in your library.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    viewModel.delete(onBack, showFailure)
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
                    IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") }
                },
                actions = {
                    if (playlist != null && (isMine || !viewModel.isGuest)) {
                        Box {
                            IconButton(onClick = { menuOpen = true }) { Icon(AppIcons.more, contentDescription = "More") }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                if (isMine) {
                                    DropdownMenuItem(text = { Text("Rename") }, onClick = {
                                        menuOpen = false
                                        renaming = true
                                    })
                                    DropdownMenuItem(
                                        text = { Text(if (playlist.isPublic) "Make private" else "Make public") },
                                        onClick = {
                                            menuOpen = false
                                            viewModel.setPublic(!playlist.isPublic, showFailure)
                                        },
                                    )
                                    DropdownMenuItem(text = { Text("Delete playlist") }, onClick = {
                                        menuOpen = false
                                        confirmingDelete = true
                                    })
                                } else {
                                    DropdownMenuItem(text = { Text("Save a copy") }, onClick = {
                                        menuOpen = false
                                        viewModel.saveCopy(onCopied = onOpenPlaylist, onFailed = showFailure)
                                    })
                                }
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
            emptyMessage = if (isMine) "No songs yet. Add some from Now Playing or an album's song menu." else "This playlist is empty.",
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
                            Icon(AppIcons.play, contentDescription = null)
                            Text("Play", modifier = Modifier.padding(start = 6.dp))
                        }
                        OutlinedButton(onClick = { viewModel.play(0, shuffle = true) }) {
                            Icon(AppIcons.shuffle, contentDescription = null)
                            Text("Shuffle", modifier = Modifier.padding(start = 6.dp))
                        }
                        Text(
                            if (rows.size == 1) "1 song" else "${rows.size} songs",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                        )
                        DownloadButton(
                            state = download,
                            what = "playlist",
                            onDownload = { viewModel.download { Notices.show(it, long = true) } },
                            onRemove = viewModel::removeDownload,
                        )
                    }
                    // Who made it, or whether yours is public (A162).
                    Text(
                        when {
                            !detail.isMine -> "by ${detail.ownerName ?: "someone"} · Hold a song for its menu, or Save a copy to change it"
                            detail.isPublic -> "Public · everyone here can find it and play it"
                            else -> "Only you"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .padding(start = 16.dp, end = 16.dp, bottom = 8.dp)
                            // Someone else's: the line opens their profile (A172).
                            .then(
                                detail.ownerId?.takeIf { !detail.isMine }?.let { id ->
                                    Modifier.clickable(onClickLabel = "Open ${detail.ownerName ?: "their"} profile") { onOpenProfile(id) }
                                } ?: Modifier,
                            ),
                    )
                }
                items(rows, key = { it.id }) { track ->
                    ReorderableItem(reorderState, key = track.id) { isDragging ->
                        val elevation by animateDpAsState(if (isDragging) 6.dp else 0.dp, label = "drag")
                        PlaylistRow(
                            track = track,
                            editable = detail.isMine,
                            elevation = elevation,
                            onClick = { viewModel.play(rows.indexOfFirst { it.id == track.id }.coerceAtLeast(0)) },
                            onLongClick = { songMenuFor = track },
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
                                    AppIcons.dragHandle,
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

/** Swipe left to remove (red, bin), drag the handle to move, hold for the song menu. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun PlaylistRow(
    track: PlaylistTrackDto,
    /** False for someone else's public playlist: no swipe to remove, no drag handle. */
    editable: Boolean,
    elevation: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onRemove: () -> Unit,
    handle: @Composable () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
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
        enableDismissFromEndToStart = editable,
        backgroundContent = {
            if (swipe.dismissDirection == SwipeToDismissBoxValue.EndToStart) {
                Box(
                    contentAlignment = Alignment.CenterEnd,
                    modifier = Modifier.fillMaxSize().background(RemoveColor, MaterialTheme.rowShape).padding(horizontal = 20.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Remove", color = Color.White, style = MaterialTheme.typography.labelLarge)
                        Icon(AppIcons.delete, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                    }
                }
            }
        },
        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp).clip(MaterialTheme.rowShape),
    ) {
        Surface(shape = MaterialTheme.rowShape, color = MaterialTheme.colorScheme.surface, shadowElevation = elevation) {
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
                        if (editable) handle()
                    }
                },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.combinedClickable(
                    onClick = onClick,
                    onLongClickLabel = "Song options",
                    onLongClick = {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        onLongClick()
                    },
                ),
            )
        }
    }
}
