package com.brainlessmusic.app.ui.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.PlaylistSummaryDto
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.playback.MiniPlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class PlaylistsViewModel @Inject constructor(
    private val profile: ProfileRepository,
) : ViewModel() {

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

    fun create(name: String, onCreated: (Int) -> Unit) {
        viewModelScope.launch { profile.createPlaylist(name).onSuccess { onCreated(it.id) } }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistsScreen(
    onBack: () -> Unit,
    onOpenPlaylist: (Int) -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: PlaylistsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var naming by remember { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(Unit) { viewModel.load() }

    if (naming) {
        PlaylistNameDialog(
            title = "New playlist",
            confirmLabel = "Create",
            initial = "",
            onConfirm = { name -> viewModel.create(name, onOpenPlaylist) },
            onDismiss = { naming = false },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Playlists") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    IconButton(onClick = { naming = true }) { Icon(Icons.Filled.Add, contentDescription = "New playlist") }
                },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty() },
            emptyMessage = "No playlists yet. Tap + to make one.",
            loadingLabel = "Loading playlists",
            skeleton = { SkeletonListRows() },
        ) { playlists ->
            LazyColumn(Modifier.fillMaxSize()) {
                items(playlists, key = { it.id }) { playlist ->
                    ListItem(
                        leadingContent = { Icon(Icons.AutoMirrored.Filled.QueueMusic, contentDescription = null) },
                        headlineContent = { Text(playlist.name) },
                        supportingContent = { Text(if (playlist.trackCount == 1) "1 song" else "${playlist.trackCount} songs") },
                        modifier = Modifier.clickable { onOpenPlaylist(playlist.id) },
                    )
                }
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
