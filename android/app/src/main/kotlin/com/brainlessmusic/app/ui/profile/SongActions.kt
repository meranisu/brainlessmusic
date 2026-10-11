package com.brainlessmusic.app.ui.profile

import androidx.media3.common.util.UnstableApi
import com.brainlessmusic.app.downloads.DownloadRepository
import com.brainlessmusic.app.downloads.TrackDownload
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.PlaylistSummaryDto
import com.brainlessmusic.app.data.repository.AddToPlaylistResult
import com.brainlessmusic.app.data.remote.dto.TrackDetailDto
import com.brainlessmusic.app.data.remote.dto.TrackStatDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.theme.SheetStatusBarFollowsApp
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.brainlessmusic.app.ui.theme.AppIcons

/**
 * Liking a song and adding it to a playlist, from anywhere a song is shown (A65); accounts only. Also the long-press
 * song menu's play next, play less often and details ([SongMenuSheet]).
 */
@androidx.annotation.OptIn(UnstableApi::class)
@HiltViewModel
class SongActionsViewModel @Inject constructor(
    private val profile: ProfileRepository,
    private val library: LibraryRepository,
    private val playback: PlaybackController,
    private val downloads: DownloadRepository,
) : ViewModel() {

    /** Each song's download, for the menu's Download / Remove download row. Guests can download too. */
    val downloadStates: StateFlow<Map<Int, TrackDownload>> = downloads.downloads

    /** [onDone] gets the line to show, or why the storage limit refused it. */
    fun download(item: QueueItem, onDone: (String) -> Unit) = downloads.downloadSong(item, onDone)

    fun removeDownload(trackId: Int) = downloads.removeSong(trackId)

    val canEdit: Boolean = !profile.isGuest
    val likedIds: StateFlow<Set<Int>> = profile.likedIds

    private val _playlists = MutableStateFlow<List<PlaylistSummaryDto>?>(null)
    val playlists: StateFlow<List<PlaylistSummaryDto>?> = _playlists.asStateFlow()

    init {
        if (canEdit) viewModelScope.launch { profile.loadLikedIds() }
    }

    fun toggleLike(trackId: Int) {
        viewModelScope.launch {
            // An empty heart before the liked set ever loaded may be a liked song: load it first, or this would "like"
            // what is already liked.
            if (!profile.likesLoaded) {
                profile.loadLikedIds()
                if (!profile.likesLoaded) return@launch
            }
            profile.setLiked(trackId, trackId !in likedIds.value)
        }
    }

    /** Returns the line to show: with nothing queued, the song starts now rather than next. */
    fun playNext(item: QueueItem): String {
        val wasEmpty = playback.state.value.queue.isEmpty()
        playback.playNext(item)
        return if (wasEmpty) "Playing \"${item.title}\"" else "\"${item.title}\" plays next"
    }

    /** Fewer shuffle passes for this song from now on (A60), the same mark as a right swipe in the queue. */
    fun playLessOften(trackId: Int, title: String, onDone: (String) -> Unit) {
        viewModelScope.launch {
            onDone(
                profile.setLessOften(trackId, true).fold(
                    onSuccess = { "You'll hear \"$title\" less often" },
                    onFailure = { "Couldn't change it. Try again." },
                ),
            )
        }
    }

    private val _detail = MutableStateFlow<LoadState<TrackDetailDto>>(LoadState.Loading)
    val detail: StateFlow<LoadState<TrackDetailDto>> = _detail.asStateFlow()

    // The newest details request; a slower one for another song must not land over it.
    private var detailJob: Job? = null

    // This account's own numbers for the song (A91). Null for guests, while loading, or if it failed: the tags still show.
    private val _myStat = MutableStateFlow<TrackStatDto?>(null)
    val myStat: StateFlow<TrackStatDto?> = _myStat.asStateFlow()

    /** Your numbers for a song, for a player skin's score strip (A115). Null for guests, offline, or on failure. */
    suspend fun record(trackId: Int): TrackStatDto? = if (canEdit) profile.trackStat(trackId).getOrNull() else null

    fun loadDetail(trackId: Int) {
        detailJob?.cancel()
        _detail.value = LoadState.Loading
        _myStat.value = null
        detailJob = viewModelScope.launch {
            // Both in one update, so the dialog doesn't grow under a thumb when your numbers land late.
            val stat = if (canEdit) async { profile.trackStat(trackId).getOrNull() } else null
            val result = library.getTrackDetail(trackId)
            _myStat.value = stat?.await()
            _detail.value = result.fold(
                onSuccess = { LoadState.Content(it) },
                onFailure = { LoadState.Error(it.loadMessage()) },
            )
        }
    }

    /** Looks up the song's artist (the queue only has its name), then [onOpen]; [onFail] gets a line to show. */
    fun openArtist(trackId: Int, onOpen: (Int) -> Unit, onFail: (String) -> Unit) {
        viewModelScope.launch {
            library.getTrackDetail(trackId).fold(
                onSuccess = { detail -> detail.artistId?.let(onOpen) ?: onFail("This song has no artist page.") },
                onFailure = { onFail("Couldn't reach the server. Try again.") },
            )
        }
    }

    fun loadPlaylists() {
        viewModelScope.launch { _playlists.value = profile.playlists().getOrDefault(emptyList()) }
    }

    /** [onDone] gets a short line to show: added, already there, or failed. */
    fun addTo(playlist: PlaylistSummaryDto, trackId: Int, onDone: (String) -> Unit) {
        viewModelScope.launch {
            onDone(
                when (profile.addToPlaylist(playlist.id, trackId)) {
                    AddToPlaylistResult.ADDED -> "Added to ${playlist.name}"
                    AddToPlaylistResult.ALREADY_THERE -> "Already in ${playlist.name}"
                    AddToPlaylistResult.FAILED -> "Couldn't add it. Try again."
                },
            )
        }
    }

    fun createAndAdd(name: String, trackId: Int, onDone: (String) -> Unit) {
        viewModelScope.launch {
            profile.createPlaylist(name).fold(
                onSuccess = { created ->
                    addTo(PlaylistSummaryDto(created.id, created.name, 0, ""), trackId, onDone)
                },
                onFailure = { onDone("Couldn't make the playlist. Try again.") },
            )
        }
    }
}

/** A heart that likes or unlikes [trackId]. Shows nothing for guests. */
@Composable
fun LikeButton(trackId: Int, modifier: Modifier = Modifier, viewModel: SongActionsViewModel = hiltViewModel()) {
    if (!viewModel.canEdit) return
    val liked by viewModel.likedIds.collectAsStateWithLifecycle()
    val isLiked = trackId in liked
    IconButton(onClick = { viewModel.toggleLike(trackId) }, modifier = modifier) {
        Icon(
            if (isLiked) AppIcons.favorite else AppIcons.favoriteBorder,
            contentDescription = if (isLiked) "Unlike" else "Like",
            tint = if (isLiked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Picks one of your playlists for [trackId], or makes a new one with it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToPlaylistSheet(
    trackId: Int,
    trackTitle: String,
    onDismiss: () -> Unit,
    viewModel: SongActionsViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val playlists by viewModel.playlists.collectAsStateWithLifecycle()
    var naming by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { viewModel.loadPlaylists() }

    val done: (String) -> Unit = { message ->
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        onDismiss()
    }

    if (naming) {
        PlaylistNameDialog(
            title = "New playlist",
            confirmLabel = "Create and add",
            initial = "",
            onConfirm = { name -> viewModel.createAndAdd(name, trackId, done) },
            onDismiss = { naming = false },
        )
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        SheetStatusBarFollowsApp()
        Text(
            "Add \"$trackTitle\" to",
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
        )
        LazyColumn(modifier = Modifier.navigationBarsPadding()) {
            item {
                ListItem(
                    leadingContent = { Icon(AppIcons.add, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    headlineContent = { Text("New playlist") },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable { naming = true },
                )
            }
            items(playlists.orEmpty(), key = { it.id }) { playlist ->
                ListItem(
                    leadingContent = { Icon(AppIcons.queue, contentDescription = null) },
                    headlineContent = { Text(playlist.name) },
                    supportingContent = { Text(if (playlist.trackCount == 1) "1 song" else "${playlist.trackCount} songs") },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable { viewModel.addTo(playlist, trackId, done) },
                )
            }
            if (playlists?.isEmpty() == true) {
                item {
                    Text(
                        "No playlists yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
                    )
                }
            }
        }
        Row(Modifier.padding(bottom = 8.dp)) {
            TextButton(onClick = onDismiss, modifier = Modifier.padding(horizontal = 16.dp)) { Text("Cancel") }
        }
    }
}
