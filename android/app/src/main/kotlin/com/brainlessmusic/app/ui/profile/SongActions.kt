package com.brainlessmusic.app.ui.profile

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
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
import com.brainlessmusic.app.data.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Liking a song and adding it to a playlist, from anywhere a song is shown (A65). Accounts only. */
@HiltViewModel
class SongActionsViewModel @Inject constructor(
    private val profile: ProfileRepository,
) : ViewModel() {

    val canEdit: Boolean = !profile.isGuest
    val likedIds: StateFlow<Set<Int>> = profile.likedIds

    private val _playlists = MutableStateFlow<List<PlaylistSummaryDto>?>(null)
    val playlists: StateFlow<List<PlaylistSummaryDto>?> = _playlists.asStateFlow()

    init {
        if (canEdit) viewModelScope.launch { profile.loadLikedIds() }
    }

    fun toggleLike(trackId: Int) {
        val liked = trackId in likedIds.value
        viewModelScope.launch { profile.setLiked(trackId, !liked) }
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
            if (isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
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
        Text(
            "Add \"$trackTitle\" to",
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
        )
        LazyColumn(modifier = Modifier.navigationBarsPadding()) {
            item {
                ListItem(
                    leadingContent = { Icon(Icons.Filled.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    headlineContent = { Text("New playlist") },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable { naming = true },
                )
            }
            items(playlists.orEmpty(), key = { it.id }) { playlist ->
                ListItem(
                    leadingContent = { Icon(Icons.AutoMirrored.Filled.QueueMusic, contentDescription = null) },
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
