package com.brainlessmusic.app.ui.profile

import androidx.compose.foundation.clickable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Alignment
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ListItemDefaults
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.PlaylistSummaryDto
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.brainlessmusic.app.ui.theme.AppIcons

@HiltViewModel
class PlaylistsViewModel @Inject constructor(
    private val profile: ProfileRepository,
) : ViewModel() {

    val isGuest: Boolean get() = profile.isGuest

    private val _state = MutableStateFlow<LoadState<List<PlaylistSummaryDto>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<PlaylistSummaryDto>>> = _state.asStateFlow()

    /** Reloaded each time the screen shows, so a playlist renamed or emptied on its page is current here. */
    fun load() {
        viewModelScope.launch {
            if (_state.value !is LoadState.Content) _state.value = LoadState.Loading
            profile.playlists().fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { if (_state.value !is LoadState.Content) _state.value = LoadState.Error(it.loadMessage()) },
            )
        }
    }

    fun create(name: String, onCreated: (Int) -> Unit, onFailed: (String) -> Unit) {
        viewModelScope.launch {
            profile.createPlaylist(name).fold(
                onSuccess = { onCreated(it.id) },
                onFailure = { onFailed("Couldn't make the playlist. Try again.") },
            )
        }
    }
}

/**
 * The Library's Playlists tab (A134, A137; it was a page off Home): Liked songs pinned first, then a row to make a
 * playlist, then yours. Reloaded each time it shows, so a playlist renamed or emptied on its page is current here.
 * Guests keep neither likes nor playlists (A37), so they get a line saying so.
 */
@Composable
fun PlaylistsTab(
    topInset: Dp,
    onOpenLiked: () -> Unit,
    onOpenPlaylist: (Int) -> Unit,
    viewModel: PlaylistsViewModel = hiltViewModel(),
) {
    if (viewModel.isGuest) {
        Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
            Text(
                "Guests can't keep liked songs or playlists.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    val state by viewModel.state.collectAsStateWithLifecycle()
    var naming by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    androidx.compose.runtime.LaunchedEffect(Unit) { viewModel.load() }

    if (naming) {
        PlaylistNameDialog(
            title = "New playlist",
            confirmLabel = "Create",
            initial = "",
            onConfirm = { name ->
                viewModel.create(
                    name,
                    // Answered after the request: open it only if this screen is still the one showing, or the new
                    // playlist would be pushed on top of wherever the user went meanwhile.
                    onCreated = { id -> if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) onOpenPlaylist(id) },
                    onFailed = { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() },
                )
            },
            onDismiss = { naming = false },
        )
    }

    LoadStateContent(
        state = state,
        onRetry = viewModel::load,
        loadingLabel = "Loading playlists",
        // The list scrolls under the Library's floating header, so the inset is padding inside it, not around it.
        skeleton = { SkeletonListRows(contentPadding = PaddingValues(top = topInset)) },
    ) { playlists ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = topInset)) {
            item(key = "liked") {
                ListItem(
                    leadingContent = { Icon(AppIcons.favorite, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    headlineContent = { Text("Liked songs") },
                    supportingContent = { Text("Every song you've liked") },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable(onClick = onOpenLiked),
                )
            }
            item(key = "new") {
                ListItem(
                    leadingContent = { Icon(AppIcons.add, contentDescription = null) },
                    headlineContent = { Text("New playlist") },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable { naming = true },
                )
            }
            items(playlists, key = { it.id }) { playlist ->
                ListItem(
                    leadingContent = { Icon(AppIcons.queue, contentDescription = null) },
                    headlineContent = { Text(playlist.name) },
                    supportingContent = { Text(if (playlist.trackCount == 1) "1 song" else "${playlist.trackCount} songs") },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.clickable { onOpenPlaylist(playlist.id) },
                )
            }
        }
    }
}

/** Asks for a playlist name; blank can't be confirmed. Used for new playlists and renames. */
@Composable
fun PlaylistNameDialog(
    title: String,
    confirmLabel: String,
    initial: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Name") },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onConfirm(name.trim())
                    onDismiss()
                },
                enabled = name.isNotBlank(),
            ) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
