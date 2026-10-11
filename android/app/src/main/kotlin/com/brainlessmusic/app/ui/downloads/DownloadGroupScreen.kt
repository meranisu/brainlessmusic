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
import com.brainlessmusic.app.downloads.KIND_ALBUM
import com.brainlessmusic.app.downloads.KIND_SONGS
import com.brainlessmusic.app.downloads.TrackDownload
import com.brainlessmusic.app.downloads.groupDownload
import com.brainlessmusic.app.downloads.toQueueItem
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.playback.MiniPlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import java.io.File
import javax.inject.Inject
import com.brainlessmusic.app.ui.theme.AppIcons

/** A downloaded album or playlist as its page shows it; [group] null once it has been removed. */
data class GroupPage(
    val group: DownloadGroup?,
    val songs: List<Pair<DownloadedTrack, TrackDownload?>>,
    val state: GroupDownload,
    /** The group's cover, or for "Songs" each song's own, by track id. */
    val songCovers: Map<Int, String?> = emptyMap(),
) {
    /** The header's covers: the group's own, or a mosaic of the newest songs' for "Songs". */
    val covers: List<String?>
        get() = if (group?.kind == KIND_SONGS) {
            mosaicCovers(songs.asReversed().map { it.first.albumId to songCovers[it.first.trackId] })
        } else {
            listOf(group?.coverPath?.let { File(it).toUri().toString() })
        }

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
            val songCovers = if (group?.kind == KIND_SONGS) tracks.associate { it.trackId to downloads.songCoverUri(it.trackId) } else emptyMap()
            LoadState.Content(GroupPage(group, songs, groupDownload(tracks.map { it.trackId }, states), songCovers))
        }.flowOn(Dispatchers.IO).stateIn<LoadState<GroupPage>>(viewModelScope, SharingStarted.WhileSubscribed(5_000), LoadState.Loading)

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
        val items = usable.map { (_, s) ->
            val id = s.first.trackId
            s.first.toQueueItem(cover ?: page.songCovers[id] ?: libraryRepository.trackCoverUrl(id))
        }
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
                    IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") }
                },
                actions = {
                    if (page?.group != null) {
                        Box {
                            IconButton(onClick = { menuOpen = true }) {
                                Icon(AppIcons.more, contentDescription = "Options for ${page.group.name}")
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
                            // An album page's header already names the album.
                            p.group?.kind == KIND_ALBUM -> track.artist ?: "Unknown artist"
                            else -> listOfNotNull(track.artist ?: "Unknown artist", track.album).joinToString(" · ")
                        },
                        coverUri = p.songCovers[track.trackId],
                        download = download,
                        onClick = { viewModel.play(p, index, shuffle = false, toast) },
                        // "Songs" has no order of its own, so each row shows its cover; the rest are numbered.
                        leading = if (p.group?.kind == KIND_SONGS) null else {
                            {
                                Text(
                                    "${index + 1}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = TextAlign.End,
                                    modifier = Modifier.width(24.dp),
                                )
                            }
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
                CoverMosaic(page.covers, Modifier.size(112.dp))
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
                Icon(AppIcons.play, contentDescription = null)
                Text("Play", modifier = Modifier.padding(start = 6.dp))
            }
            OutlinedButton(onClick = onShuffle) {
                Icon(AppIcons.shuffle, contentDescription = null)
                Text("Shuffle", modifier = Modifier.padding(start = 6.dp))
            }
        }
    }
}
