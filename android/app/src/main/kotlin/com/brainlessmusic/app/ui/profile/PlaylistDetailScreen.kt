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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
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
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.material3.LocalContentColor
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import com.brainlessmusic.app.ui.common.SkinFab
import com.brainlessmusic.app.ui.common.SkinExtendedFab
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.theme.accentInk

private val RemoveColor = Color(0xFFDC2626)

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

    /** Plays [tracks] as shown, so a sorted or searched list plays in the order on screen. */
    fun play(tracks: List<PlaylistTrackDto>, startIndex: Int, shuffle: Boolean = false) {
        if (tracks.isEmpty()) return
        // Shuffle starts from a random song; a start of 0 would always open on the first one.
        val start = if (shuffle) tracks.indices.random() else startIndex.coerceIn(tracks.indices)
        playbackController.playQueue(tracks.map(::queueItem), start, shuffle = if (shuffle) true else null)
    }

    fun coverUrl(track: PlaylistTrackDto): String? = libraryRepository.trackCoverUrl(track.id)

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

    /** Name and description in one save (A185); an empty [description] clears it. [onFailed] gets a short line to show. */
    fun editDetails(name: String, description: String, onFailed: (String) -> Unit) {
        edit {
            profile.editPlaylistDetails(playlistId, name, description).fold(
                onSuccess = { saved ->
                    current()?.let { _state.value = LoadState.Content(it.copy(name = saved.name, description = saved.description)) }
                },
                onFailure = { onFailed("Couldn't save the changes. Try again.") },
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

/** How the songs are listed. Only the playlist's own order can be dragged. */
enum class PlaylistSort(val label: String) {
    CUSTOM("Playlist order"),
    RECENT("Recently added"),
    TITLE("Title"),
    ARTIST("Artist"),
    ALBUM("Album"),
    LENGTH("Length"),
}

private val byText: Comparator<String?> = nullsLast(String.CASE_INSENSITIVE_ORDER)

/** The songs in [sort] order; ties keep the playlist's order. */
internal fun sortTracks(tracks: List<PlaylistTrackDto>, sort: PlaylistSort): List<PlaylistTrackDto> = when (sort) {
    PlaylistSort.CUSTOM -> tracks
    // SQLite's "YYYY-MM-DD HH:MM:SS" sorts as text.
    PlaylistSort.RECENT -> tracks.sortedByDescending { it.addedAt.orEmpty() }
    PlaylistSort.TITLE -> tracks.sortedWith(compareBy(byText) { it.title })
    PlaylistSort.ARTIST -> tracks.sortedWith(
        compareBy<PlaylistTrackDto, String?>(byText) { it.artist }.thenBy(byText) { it.album }.thenBy { it.trackNumber ?: Int.MAX_VALUE },
    )
    PlaylistSort.ALBUM -> tracks.sortedWith(compareBy<PlaylistTrackDto, String?>(byText) { it.album }.thenBy { it.trackNumber ?: Int.MAX_VALUE })
    PlaylistSort.LENGTH -> tracks.sortedBy { it.duration ?: Double.MAX_VALUE }
}

/** Search within the playlist: title, artist or album holds [query], ignoring case. */
internal fun matchesQuery(track: PlaylistTrackDto, query: String): Boolean {
    val q = query.trim()
    return q.isEmpty() || listOfNotNull(track.title, track.artist, track.album).any { it.contains(q, ignoreCase = true) }
}

/** "12 songs · 48 min": the count and the whole length. */
internal fun playlistTotals(tracks: List<PlaylistTrackDto>): String {
    val count = if (tracks.size == 1) "1 song" else "${tracks.size} songs"
    val seconds = tracks.sumOf { it.duration ?: 0.0 }
    return if (seconds > 0) "$count · ${formatListened((seconds * 1000).toLong())}" else count
}

/** Room under the list for the Play and Shuffle buttons stacked at the bottom right. */
private val FabsClearance = 152.dp

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
    var sortOpen by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var sort by rememberSaveable { mutableStateOf(PlaylistSort.CUSTOM) }
    var songMenuFor by remember { mutableStateOf<PlaylistTrackDto?>(null) }
    songMenuFor?.let { track ->
        SongMenuSheet(item = viewModel.queueItem(track), onDismiss = { songMenuFor = null }, onOpenAlbum = onOpenAlbum, onOpenArtist = onOpenArtist)
    }
    val playlist = (state as? LoadState.Content)?.data
    // Someone else's public playlist is read-only here (A162): no editing, remove or reorder.
    val isMine = playlist?.isMine ?: true
    val download by viewModel.download.collectAsStateWithLifecycle()
    val showFailure: (String) -> Unit = { Notices.show(it) }
    val closeSearch = {
        searching = false
        query = ""
    }
    // Back closes the search before it leaves the page.
    BackHandler(enabled = searching, onBack = closeSearch)

    if (editing && playlist != null) {
        val otherNames by produceState(emptyList<String>()) { value = viewModel.otherPlaylistNames() }
        PlaylistDetailsDialog(
            initialName = playlist.name,
            initialDescription = playlist.description.orEmpty(),
            takenNames = otherNames,
            onConfirm = { name, description -> viewModel.editDetails(name, description, showFailure) },
            onDismiss = { editing = false },
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

    // Dragging reorders this copy; the server hears about it once, on drop.
    var rows by remember { mutableStateOf(playlist?.tracks.orEmpty()) }
    var dragging by remember { mutableStateOf(false) }
    LaunchedEffect(playlist?.tracks) { if (!dragging) rows = playlist?.tracks.orEmpty() }
    val shown = remember(rows, sort, query) { sortTracks(rows, sort).filter { matchesQuery(it, query) } }
    // Moving a song only means something in the playlist's own order, with every song showing.
    val canDrag = isMine && sort == PlaylistSort.CUSTOM && query.isBlank()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (searching) {
                        PlaylistSearchField(query, onChange = { query = it })
                    } else {
                        Text(playlist?.name ?: "Playlist", maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = if (searching) closeSearch else onBack) {
                        Icon(AppIcons.back, contentDescription = if (searching) "Close search" else "Back")
                    }
                },
                actions = {
                    if (playlist != null && playlist.tracks.isNotEmpty()) {
                        if (!searching) {
                            IconButton(onClick = { searching = true }) { Icon(AppIcons.search, contentDescription = "Search this playlist") }
                        }
                        Box {
                            IconButton(onClick = { sortOpen = true }) {
                                Icon(
                                    AppIcons.sort,
                                    contentDescription = "Sort: ${sort.label}",
                                    // Lit while the list is in another order than the playlist's own.
                                    tint = if (sort != PlaylistSort.CUSTOM) MaterialTheme.colorScheme.primary else LocalContentColor.current,
                                )
                            }
                            DropdownMenu(expanded = sortOpen, onDismissRequest = { sortOpen = false }) {
                                PlaylistSort.entries.forEach { option ->
                                    DropdownMenuItem(
                                        text = { Text(option.label) },
                                        trailingIcon = { if (option == sort) Icon(AppIcons.check, contentDescription = "Current") },
                                        onClick = {
                                            sort = option
                                            sortOpen = false
                                        },
                                    )
                                }
                            }
                        }
                    }
                    if (playlist != null && (isMine || !viewModel.isGuest)) {
                        Box {
                            IconButton(onClick = { menuOpen = true }) { Icon(AppIcons.more, contentDescription = "More") }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                if (isMine) {
                                    DropdownMenuItem(text = { Text("Edit name and description") }, onClick = {
                                        menuOpen = false
                                        editing = true
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
        // Play and Shuffle float at the bottom right, in the skin's button shapes, and play the list as it's shown.
        floatingActionButton = {
            if (shown.isNotEmpty()) {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SkinFab(AppIcons.shuffle, "Shuffle", onClick = { viewModel.play(shown, 0, shuffle = true) }, small = true)
                    SkinExtendedFab(AppIcons.play, "Play", onClick = { viewModel.play(shown, 0) })
                }
            }
        },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { false },
            loadingLabel = "Loading playlist",
            skeleton = { SkeletonListRows(trailing = true) },
        ) { detail ->
            val listState = rememberLazyListState()
            // Keys find the songs, so the header rows above them don't shift the positions.
            val reorderState = rememberReorderableLazyListState(listState) { from, to ->
                val fromIndex = rows.indexOfFirst { it.id == from.key }
                val toIndex = rows.indexOfFirst { it.id == to.key }
                if (fromIndex < 0 || toIndex < 0) return@rememberReorderableLazyListState
                rows = rows.toMutableList().apply { add(toIndex, removeAt(fromIndex)) }
            }

            LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = FabsClearance)) {
                item(key = "header") {
                    PlaylistHeader(
                        detail = detail,
                        totals = playlistTotals(rows),
                        download = download,
                        onDownload = { viewModel.download { Notices.show(it, long = true) } },
                        onRemoveDownload = viewModel::removeDownload,
                        onEdit = { editing = true },
                        onOpenProfile = onOpenProfile,
                    )
                }
                if (sort != PlaylistSort.CUSTOM || query.isNotBlank()) {
                    item(key = "view") {
                        // What the list shows now, and why the handles are gone.
                        Text(
                            buildList {
                                if (query.isNotBlank()) add("${shown.size} of ${rows.size} match")
                                if (sort != PlaylistSort.CUSTOM) add("Sorted by ${sort.label.lowercase()}")
                                if (isMine) add("Drag only in playlist order")
                            }.joinToString(" · "),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                        )
                    }
                }
                if (rows.isEmpty()) {
                    item(key = "empty") {
                        EmptyNote(if (isMine) "No songs yet. Hold any song and pick Add to playlist." else "This playlist is empty.")
                    }
                } else if (shown.isEmpty()) {
                    item(key = "no-match") { EmptyNote("No songs here match \u201c${query.trim()}\u201d.") }
                }
                itemsIndexed(shown, key = { _, track -> track.id }) { index, track ->
                    ReorderableItem(reorderState, key = track.id, enabled = canDrag) { isDragging ->
                        val elevation by animateDpAsState(if (isDragging) 6.dp else 0.dp, label = "drag")
                        PlaylistRow(
                            track = track,
                            coverUrl = viewModel.coverUrl(track),
                            editable = detail.isMine,
                            draggable = canDrag,
                            elevation = elevation,
                            onClick = { viewModel.play(shown, index) },
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

/**
 * The top of the page: the description (or, on yours without one, a way to add it), the song count and length, who
 * made it or whether yours is public, and the download button.
 */
@Composable
private fun PlaylistHeader(
    detail: PlaylistDetailDto,
    totals: String,
    download: GroupDownload,
    onDownload: () -> Unit,
    onRemoveDownload: () -> Unit,
    onEdit: () -> Unit,
    onOpenProfile: (Int) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 8.dp)) {
        val description = detail.description
        when {
            description != null -> Text(
                description,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(end = 8.dp, bottom = 8.dp).then(
                    if (detail.isMine) Modifier.clickable(onClickLabel = "Edit the description", onClick = onEdit) else Modifier,
                ),
            )
            detail.isMine -> TextButton(onClick = onEdit, contentPadding = PaddingValues(horizontal = 0.dp)) {
                Text("+ Add a description")
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(totals, style = MaterialTheme.typography.titleSmall)
                // Who made it, or whether yours is public (A162).
                Text(
                    when {
                        !detail.isMine -> "by ${detail.ownerName ?: "someone"} · Save a copy to change it"
                        detail.isPublic -> "Public · everyone here can find it and play it"
                        else -> "Private · only you see it"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        // Someone else's: the line opens their profile (A172).
                        .then(
                            detail.ownerId?.takeIf { !detail.isMine }?.let { id ->
                                Modifier.clickable(onClickLabel = "Open ${detail.ownerName ?: "their"} profile") { onOpenProfile(id) }
                            } ?: Modifier,
                        ),
                )
            }
            if (detail.tracks.isNotEmpty()) {
                DownloadButton(state = download, what = "playlist", onDownload = onDownload, onRemove = onRemoveDownload)
            }
        }
    }
}

@Composable
private fun EmptyNote(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp),
    )
}

/** The top bar's search field: narrows the songs by title, artist or album as you type. */
@Composable
private fun PlaylistSearchField(query: String, onChange: (String) -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    TextField(
        value = query,
        onValueChange = onChange,
        placeholder = { Text("Search this playlist") },
        singleLine = true,
        trailingIcon = {
            if (query.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(AppIcons.clear, contentDescription = "Clear search") }
        },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
        modifier = Modifier.fillMaxWidth().focusRequester(focus),
    )
}

/** Longest playlist description, in characters. Matches `MAX_DESCRIPTION_LENGTH` in `backend/src/routes/playlists.ts`. */
const val PLAYLIST_DESCRIPTION_MAX = 300

/** Name and description together (A185), with the same name checks as the new-playlist dialog. */
@Composable
private fun PlaylistDetailsDialog(
    initialName: String,
    initialDescription: String,
    takenNames: List<String>,
    onConfirm: (name: String, description: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(initialName) }
    var description by remember { mutableStateOf(initialDescription) }
    val check = checkPlaylistName(name, takenNames, ownName = initialName)
    val descriptionLength = description.trim().let { it.codePointCount(0, it.length) }
    val descriptionTooLong = descriptionLength > PLAYLIST_DESCRIPTION_MAX
    val canSave = check.canSave && !descriptionTooLong

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit playlist") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                    isError = check.error != null,
                    supportingText = (check.error ?: check.warning)?.let { line ->
                        {
                            Text(
                                line,
                                color = if (check.error != null) MaterialTheme.colorScheme.error else MaterialTheme.accentInk,
                            )
                        }
                    },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Description") },
                    placeholder = { Text("What it's for, like \u201cslow songs for the drive home\u201d") },
                    minLines = 3,
                    maxLines = 6,
                    isError = descriptionTooLong,
                    supportingText = {
                        Text(
                            "$descriptionLength/$PLAYLIST_DESCRIPTION_MAX",
                            color = if (descriptionTooLong) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(enabled = canSave, onClick = {
                val newDescription = description.trim()
                if (check.trimmed != initialName || newDescription != initialDescription) onConfirm(check.trimmed, newDescription)
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Swipe left to remove (red, bin), drag the handle to move, hold for the song menu. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun PlaylistRow(
    track: PlaylistTrackDto,
    coverUrl: String?,
    /** False for someone else's public playlist: no swipe to remove. */
    editable: Boolean,
    /** The drag handle shows only in the playlist's own order, unsearched, on yours. */
    draggable: Boolean,
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
                leadingContent = { CoverImage(url = coverUrl, contentDescription = null, modifier = Modifier.size(44.dp)) },
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
                        if (draggable) handle()
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
