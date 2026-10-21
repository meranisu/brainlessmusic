package com.brainlessmusic.app.ui.profile

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.hilt.navigation.compose.hiltViewModel
import com.brainlessmusic.app.data.remote.dto.DailyMixDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.QueueSource
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkinExtendedFab
import com.brainlessmusic.app.ui.common.SkinFab
import com.brainlessmusic.app.ui.downloads.CoverMosaic
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.theme.AppIcons
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Covers for a mix's picture: the first four different albums (a song's own cover when it has no album). */
fun mixCovers(mix: DailyMixDto, library: LibraryRepository): List<String?> =
    mix.tracks.map { t -> t.albumId?.let(library::albumCoverUrl) ?: library.trackCoverUrl(t.id) }.distinct().take(4)

/**
 * A mix's picture, as Spotify and YouTube Music draw theirs (owner, 2026-10-21): its songs' covers in a grid, and a
 * radio mark at the bottom left, on a solid disc so it reads over any cover, saying it is a mix and not an album.
 */
@Composable
fun MixCover(covers: List<String?>, modifier: Modifier = Modifier, badge: Dp = 24.dp) {
    Box(modifier) {
        if (covers.size >= 2) {
            CoverMosaic(covers, Modifier.fillMaxSize())
        } else {
            CoverImage(url = covers.firstOrNull(), contentDescription = null, modifier = Modifier.fillMaxSize())
        }
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(6.dp)
                .size(badge)
                .background(MaterialTheme.colorScheme.primary, CircleShape)
                .border(1.5.dp, MaterialTheme.colorScheme.surface, CircleShape),
        ) {
            Icon(Icons.Filled.Radio, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(badge * 0.6f))
        }
    }
}

@HiltViewModel
class MixViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val library: LibraryRepository,
    private val playback: PlaybackController,
) : ViewModel() {

    private val mixId: Int = checkNotNull(savedStateHandle.get<Int>(Routes.ARG_MIX_ID))

    private val _state = MutableStateFlow<LoadState<DailyMixDto?>>(LoadState.Loading)
    val state: StateFlow<LoadState<DailyMixDto?>> = _state.asStateFlow()

    init {
        load()
    }

    /** The server builds the day's mixes once and keeps them, so this is the same list Home showed. */
    fun load() {
        _state.value = LoadState.Loading
        viewModelScope.launch {
            library.getDailyMixes()
                .onSuccess { daily -> _state.value = LoadState.Content(daily.mixes.firstOrNull { it.id == mixId }) }
                .onFailure { _state.value = LoadState.Error(it.loadMessage()) }
        }
    }

    fun covers(mix: DailyMixDto): List<String?> = mixCovers(mix, library)

    fun cover(track: TrackSummaryDto): String? = track.albumId?.let(library::albumCoverUrl) ?: library.trackCoverUrl(track.id)

    fun queueItem(track: TrackSummaryDto): QueueItem = library.queueItem(track)

    /** Plays the mix from song [index], then keeps going as a radio from its first song, as Home's cards did. */
    fun play(mix: DailyMixDto, index: Int, shuffle: Boolean = false) {
        val items = mix.tracks.map { library.queueItem(it) }
        if (items.isEmpty()) return
        playback.playQueue(items, index, QueueSource.Radio(items.first().trackId), shuffle = shuffle)
    }
}

/** One mix as a list of its songs (owner, 2026-10-21), opened from "Mixes for you" on Home. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun MixScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    onOpenAlbum: (Int) -> Unit,
    onOpenArtist: (Int) -> Unit,
    viewModel: MixViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val mix = (state as? LoadState.Content)?.data
    var menuFor by remember { mutableStateOf<QueueItem?>(null) }
    menuFor?.let { SongMenuSheet(item = it, onDismiss = { menuFor = null }, onOpenAlbum = onOpenAlbum, onOpenArtist = onOpenArtist) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(mix?.let { "${it.name} mix" } ?: "Mix", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") } },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
        // Play and Shuffle float at the bottom right, as on a playlist.
        floatingActionButton = {
            if (mix != null && mix.tracks.isNotEmpty()) {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SkinFab(AppIcons.shuffle, "Shuffle", onClick = { viewModel.play(mix, 0, shuffle = true) }, small = true)
                    SkinExtendedFab(AppIcons.play, "Play", onClick = { viewModel.play(mix, 0) })
                }
            }
        },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { it == null },
            // Mixes change with the day; one opened before midnight may be gone after it.
            emptyMessage = "This mix isn't in today's mixes any more. Go back to Home for today's.",
            loadingLabel = "Loading mix",
        ) { found ->
            val m = found ?: return@LoadStateContent
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 160.dp)) {
                item(key = "header") {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                    ) {
                        MixCover(viewModel.covers(m), Modifier.width(200.dp).aspectRatio(1f), badge = 36.dp)
                        Text(
                            "${m.name} mix",
                            style = MaterialTheme.typography.headlineSmall,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                        Text(
                            "${if (m.tracks.size == 1) "1 song" else "${m.tracks.size} songs"} · today, from what you play",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                itemsIndexed(m.tracks, key = { _, t -> t.id }) { index, track ->
                    ListItem(
                        leadingContent = { CoverImage(url = viewModel.cover(track), contentDescription = null, modifier = Modifier.size(48.dp)) },
                        headlineContent = { Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        supportingContent = { Text(track.artist ?: "Unknown artist", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        modifier = Modifier.combinedClickable(
                            onClickLabel = "Play from this song",
                            onClick = { viewModel.play(m, index) },
                            onLongClickLabel = "Song options",
                            onLongClick = { menuFor = viewModel.queueItem(track) },
                        ),
                    )
                }
            }
        }
    }
}
