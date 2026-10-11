package com.brainlessmusic.app.ui.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.playback.MiniPlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.brainlessmusic.app.ui.theme.AppIcons

/** The two song lists under You: what you liked, and what you asked to hear less (A60). */
enum class SongListKind(val route: String, val title: String, val empty: String) {
    LIKED("liked", "Liked songs", "No liked songs yet. Tap the heart on Now Playing to like one."),
    LESS_OFTEN("less-often", "Songs you hear less", "Nothing here. Swipe a song right in the queue to hear it less."),
}

@HiltViewModel
class SongListViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val profile: ProfileRepository,
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
) : ViewModel() {

    val kind: SongListKind = SongListKind.entries.first { it.route == savedStateHandle.get<String>(Routes.ARG_SONG_LIST) }

    private val _state = MutableStateFlow<LoadState<List<TrackSummaryDto>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<TrackSummaryDto>>> = _state.asStateFlow()

    init {
        load()
    }

    /** One page of up to the server's cap (200); more than that is a later problem for a handful of listeners. */
    fun load() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            val result = when (kind) {
                SongListKind.LIKED -> profile.likedPage(0, PAGE).map { it.favorites }
                SongListKind.LESS_OFTEN -> profile.lessOftenPage(0, PAGE).map { it.tracks }
            }
            result.fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { _state.value = LoadState.Error(it.loadMessage()) },
            )
        }
    }

    fun play(index: Int) {
        val tracks = (_state.value as? LoadState.Content)?.data ?: return
        playbackController.playQueue(tracks.map(libraryRepository::queueItem), index)
    }

    /** Takes the song off this list: unlike, or back to normal in shuffle. */
    fun takeOff(trackId: Int) {
        val tracks = (_state.value as? LoadState.Content)?.data ?: return
        _state.value = LoadState.Content(tracks.filter { it.id != trackId })
        viewModelScope.launch {
            val result = when (kind) {
                SongListKind.LIKED -> profile.setLiked(trackId, false)
                SongListKind.LESS_OFTEN -> profile.setLessOften(trackId, false)
            }
            result.onFailure { load() }
        }
    }

    private companion object {
        const val PAGE = 200
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongListScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: SongListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val kind = viewModel.kind

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(kind.title) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") }
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
            emptyMessage = kind.empty,
            loadingLabel = "Loading ${kind.title.lowercase()}",
            skeleton = { SkeletonListRows(trailing = true) },
        ) { tracks ->
            LazyColumn(Modifier.fillMaxSize()) {
                items(tracks.size, key = { tracks[it].id }) { index ->
                    val track = tracks[index]
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
                            when (kind) {
                                SongListKind.LIKED -> LikeButton(track.id)
                                SongListKind.LESS_OFTEN -> TextButton(onClick = { viewModel.takeOff(track.id) }) {
                                    Text("Undo")
                                }
                            }
                        },
                        modifier = Modifier.clickable { viewModel.play(index) },
                    )
                }
            }
        }
    }
}
