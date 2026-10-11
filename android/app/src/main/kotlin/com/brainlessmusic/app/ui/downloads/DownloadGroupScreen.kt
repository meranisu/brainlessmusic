package com.brainlessmusic.app.ui.downloads

import android.widget.Toast
import androidx.annotation.OptIn
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.brainlessmusic.app.data.remote.NetworkMonitor
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.downloads.DownloadDao
import com.brainlessmusic.app.downloads.DownloadGroup
import com.brainlessmusic.app.downloads.DownloadRepository
import com.brainlessmusic.app.downloads.DownloadedTrack
import com.brainlessmusic.app.downloads.GroupDownload
import com.brainlessmusic.app.downloads.TrackDownload
import com.brainlessmusic.app.downloads.groupDownload
import com.brainlessmusic.app.downloads.toQueueItem
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.playback.MiniPlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import java.io.File
import javax.inject.Inject

/** A downloaded album or playlist as its page shows it; [group] null once it has been removed. */
data class GroupPage(
    val group: DownloadGroup?,
    val songs: List<Pair<DownloadedTrack, TrackDownload?>>,
    val state: GroupDownload,
) {
    val doneCount: Int get() = songs.count { it.second?.isDone == true }
}

@OptIn(UnstableApi::class)
@HiltViewModel
class DownloadGroupViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    dao: DownloadDao,
    private val downloads: DownloadRepository,
    private val playbackController: PlaybackController,
    private val libraryRepository: LibraryRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    val groupId: String = checkNotNull(savedStateHandle[Routes.ARG_DOWNLOAD_GROUP])

    val page: StateFlow<LoadState<GroupPage>> =
        combine(dao.groupFlow(groupId), dao.tracksOfFlow(groupId), downloads.downloads) { group, tracks, states ->
            val songs = tracks.map { it to states[it.trackId] }
            LoadState.Content(GroupPage(group, songs, groupDownload(tracks.map { it.trackId }, states)))
        }.stateIn<LoadState<GroupPage>>(viewModelScope, SharingStarted.WhileSubscribed(5_000), LoadState.Loading)

    /**
     * Plays the page from [index] (or shuffled). With no signal only the songs on the phone go in, starting from the
     * nearest one at or after [index]. [onNothingToPlay] says why nothing started.
     */
    fun play(page: GroupPage, index: Int, shuffle: Boolean, onNothingToPlay: (String) -> Unit) {
        val cover = page.group?.coverPath?.let { File(it).toUri().toString() }
        val usable = page.songs.withIndex().filter { (_, s) -> networkMonitor.online.value || s.second?.isDone == true }
        if (usable.isEmpty()) {
            onNothingToPlay("None of these songs are on the phone yet.")
            return
        }
        val start = if (shuffle) usable.indices.random() else usable.indexOfFirst { it.index >= index }.coerceAtLeast(0)
        val items = usable.map { (_, s) -> s.first.toQueueItem(cover ?: libraryRepository.trackCoverUrl(s.first.trackId)) }
        playbackController.playQueue(items, start, shuffle = if (shuffle) true else null)
    }

    /** Takes one song off the phone; it stays on this page as not downloaded. */
    fun removeSong(trackId: Int) = downloads.removeSong(trackId)

    fun downloadAgain(trackIds: List<Int>, onRefused: (String) -> Unit) = downloads.downloadAgain(trackIds, onRefused)

    fun removeAll(page: GroupPage) = downloads.removeGroup(groupId, page.songs.map { it.first.trackId })
}

/** One downloaded album or playlist: its songs, each with its own state, play from any of them (A90). */
@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadGroupScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: DownloadGroupViewModel = hiltViewModel(),
) {
    val state by viewModel.page.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val toast: (String) -> Unit = { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() }
    var confirmRemove by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    val page = (state as? LoadState.Content)?.data

    // Removed (from here, or Delete all in Settings): nothing left to show.
    LaunchedEffect(page?.group) { if (page != null && page.group == null) onBack() }

    if (confirmRemove && page?.group != null) {
        RemoveGroupDialog(page.group.name, onConfirm = { viewModel.removeAll(page) }, onDismiss = { confirmRemove = false })
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(page?.group?.name ?: "Download", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    if (page?.group != null) {
                        Box {
                            IconButton(onClick = { menuOpen = true }) {
                                Icon(Icons.Filled.MoreVert, contentDescription = "Options for ${page.group.name}")
                            }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                val missing = page.songs.filter { it.second?.isDone != true && it.second?.isActive != true }
                                if (missing.isNotEmpty()) {
                                    DropdownMenuItem(
                                        text = { Text("Download the rest") },
                                        onClick = {
                                            menuOpen = false
                                            viewModel.downloadAgain(missing.map { it.first.trackId }, toast)
                                        },
                                    )
                                }
                                DropdownMenuItem(
                                    text = { Text("Remove download") },
                                    onClick = { menuOpen = false; confirmRemove = true },
                                )
                            }
                        }
                    }
                },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = {},
            modifier = Modifier.padding(padding),
            isEmpty = { it.songs.isEmpty() },
            emptyMessage = "Nothing left here.",
            loadingLabel = "Loading",
            skeleton = { SkeletonListRows() },
        ) { p ->
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    GroupHeader(
                        p,
                        onPlay = { viewModel.play(p, 0, shuffle = false, toast) },
                        onShuffle = { viewModel.play(p, 0, shuffle = true, toast) },
                    )
                }
                itemsIndexed(p.songs, key = { _, s -> s.first.trackId }) { index, (track, download) ->
                    SongRow(
                        title = track.title,
                        supporting = when {
                            download?.isFailed == true -> "Download failed"
                            download?.isActive == true -> "Downloading, ${download.percent.toInt()}%"
                            download?.isDone != true -> "Not on the phone"
                            else -> track.artist ?: "Unknown artist"
                        },
                        coverUri = null,
                        download = download,
                        onClick = { viewModel.play(p, index, shuffle = false, toast) },
                        leading = {
                            Text(
                                "${index + 1}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.End,
                                modifier = Modifier.width(24.dp),
                            )
                        },
                        menu = { close ->
                            when {
                                download?.isDone == true -> DropdownMenuItem(
                                    text = { Text("Remove from phone") },
                                    onClick = { close(); viewModel.removeSong(track.trackId) },
                                )
                                download?.isActive == true -> DropdownMenuItem(
                                    text = { Text("Stop download") },
                                    onClick = { close(); viewModel.removeSong(track.trackId) },
                                )
                                else -> DropdownMenuItem(
                                    text = { Text("Download") },
                                    onClick = { close(); viewModel.downloadAgain(listOf(track.trackId), toast) },
                                )
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun GroupHeader(page: GroupPage, onPlay: () -> Unit, onShuffle: () -> Unit) {
    val group = page.group ?: return
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box {
                CoverImage(
                    url = group.coverPath?.let { File(it).toUri().toString() },
                    contentDescription = null,
                    modifier = Modifier.size(112.dp),
                    cornerRadius = 14.dp,
                )
                StateBadge(page.state, Modifier.align(Alignment.BottomEnd).padding(6.dp))
            }
            Column(Modifier.padding(start = 16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(group.name, style = MaterialTheme.typography.headlineSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                group.subtitle?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(
                    songCount(page.doneCount, page.songs.size) + " on the phone",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onPlay) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Text("Play", modifier = Modifier.padding(start = 6.dp))
            }
            OutlinedButton(onClick = onShuffle) {
                Icon(Icons.Filled.Shuffle, contentDescription = null)
                Text("Shuffle", modifier = Modifier.padding(start = 6.dp))
            }
        }
    }
}
