package com.brainlessmusic.app.ui.people

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.FeedItemDto
import com.brainlessmusic.app.data.remote.dto.FriendListeningDto
import com.brainlessmusic.app.data.remote.dto.SocialPersonDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.Avatar
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.profile.ListCard
import com.brainlessmusic.app.ui.profile.formatDay
import com.brainlessmusic.app.ui.profile.loadMessage
import com.brainlessmusic.app.ui.theme.AppIcons
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Players check in every 10 s, so polling faster than this would show nothing new. */
private const val NOW_PLAYING_POLL_MS = 15_000L

data class FriendsState(
    val listening: List<FriendListeningDto> = emptyList(),
    val feed: List<FeedItemDto> = emptyList(),
    val nextBefore: String? = null,
    val loading: Boolean = true,
    val loadingMore: Boolean = false,
    val error: String? = null,
    val hideActivity: Boolean = false,
)

@HiltViewModel
class FriendsViewModel @Inject constructor(
    private val profile: ProfileRepository,
    private val library: LibraryRepository,
    private val playback: PlaybackController,
) : ViewModel() {
    private val _state = MutableStateFlow(FriendsState())
    val state: StateFlow<FriendsState> = _state.asStateFlow()
    private var polling: Job? = null

    init {
        load()
        viewModelScope.launch { profile.hideActivity().onSuccess { h -> _state.update { it.copy(hideActivity = h) } } }
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            profile.friendsFeed(null).fold(
                onSuccess = { page -> _state.update { it.copy(feed = page.items, nextBefore = page.nextBefore, loading = false) } },
                onFailure = { e -> _state.update { it.copy(loading = false, error = e.loadMessage()) } },
            )
        }
    }

    fun loadMore() {
        val before = _state.value.nextBefore ?: return
        if (_state.value.loadingMore) return
        viewModelScope.launch {
            _state.update { it.copy(loadingMore = true) }
            profile.friendsFeed(before).fold(
                onSuccess = { page ->
                    _state.update { it.copy(feed = it.feed + page.items, nextBefore = page.nextBefore, loadingMore = false) }
                },
                onFailure = { _state.update { it.copy(loadingMore = false) } },
            )
        }
    }

    /** Only while the screen is showing: a poll in the background would cost battery for a list no one sees. */
    fun startPolling() {
        polling?.cancel()
        polling = viewModelScope.launch {
            while (isActive) {
                profile.friendsNowPlaying().onSuccess { l -> _state.update { it.copy(listening = l) } }
                delay(NOW_PLAYING_POLL_MS)
            }
        }
    }

    fun stopPolling() {
        polling?.cancel()
        polling = null
    }

    fun setHideActivity(hidden: Boolean) {
        _state.update { it.copy(hideActivity = hidden) }
        viewModelScope.launch {
            profile.setActivityHidden(hidden).onFailure { _state.update { it.copy(hideActivity = !hidden) } }
        }
    }

    fun play(track: TrackSummaryDto) = playback.playQueue(listOf(library.queueItem(track)), 0)

    fun avatarUrl(person: SocialPersonDto): String? = profile.avatarUrl(person.id, person.avatarId)

    fun coverUrl(track: TrackSummaryDto): String? =
        track.albumId?.let(library::albumCoverUrl) ?: library.trackCoverUrl(track.id)
}

/**
 * Friends' now playing and the activity feed (A239-A241). Everyone on the server sees everyone; "Hide my activity"
 * takes you out of both. A tab on your own profile (owner, 2026-10-21), so guests, who have none, never see it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FriendsContent(
    onOpenProfile: (Int) -> Unit,
    onOpenPlaylist: (Int) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: FriendsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    DisposableEffect(Unit) {
        viewModel.startPolling()
        onDispose { viewModel.stopPolling() }
    }
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Hide my activity", style = MaterialTheme.typography.bodyLarge)
                Switch(checked = state.hideActivity, onCheckedChange = viewModel::setHideActivity)
            }
        }
        item { Section("Listening now") }
        if (state.listening.isEmpty()) {
            item { Hint("Nobody else is playing anything.") }
        } else {
            item {
                ListCard {
                    state.listening.forEach { l ->
                        ActivityRow(
                            person = l.person,
                            avatarUrl = viewModel.avatarUrl(l.person),
                            line = "${l.person.name} is playing",
                            track = l.track,
                            coverUrl = viewModel.coverUrl(l.track),
                            progress = l.track.duration?.takeIf { it > 0 }?.let { (l.positionSeconds / it).toFloat().coerceIn(0f, 1f) },
                            onOpenProfile = onOpenProfile,
                            onClick = { viewModel.play(l.track) },
                        )
                    }
                }
            }
        }
        item { Section("Recently") }
        when {
            state.loading -> item { Hint("Loading activity…") }
            state.error != null -> item {
                Hint(state.error!!)
                TextButton(onClick = viewModel::load, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Try again") }
            }
            state.feed.isEmpty() -> item { Hint("No activity in the last 30 days.") }
            else -> {
                items(state.feed, key = { "${it.kind}:${it.person.id}:${it.track?.id ?: it.playlist?.id}:${it.at}" }) { item ->
                    val verb = when (item.kind) {
                        "play" -> "played"
                        "like" -> "liked"
                        else -> "shared a playlist"
                    }
                    val line = "${item.person.name} $verb · ${formatDay(item.at)}"
                    val track = item.track
                    val playlist = item.playlist
                    if (track != null) {
                        ActivityRow(
                            person = item.person,
                            avatarUrl = viewModel.avatarUrl(item.person),
                            line = line,
                            track = track,
                            coverUrl = viewModel.coverUrl(track),
                            progress = null,
                            onOpenProfile = onOpenProfile,
                            onClick = { viewModel.play(track) },
                        )
                    } else if (playlist != null) {
                        ListItem(
                            leadingContent = {
                                Avatar(
                                    url = viewModel.avatarUrl(item.person),
                                    name = item.person.name,
                                    size = 44.dp,
                                    modifier = Modifier.clickable { onOpenProfile(item.person.id) },
                                )
                            },
                            overlineContent = { Text(line, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            headlineContent = { Text(playlist.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            supportingContent = { Text(if (playlist.trackCount == 1) "1 song" else "${playlist.trackCount} songs") },
                            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                            modifier = Modifier.clickable { onOpenPlaylist(playlist.id) },
                        )
                    }
                }
                if (state.nextBefore != null) {
                    item {
                        TextButton(onClick = viewModel::loadMore, modifier = Modifier.padding(horizontal = 8.dp)) {
                            Text(if (state.loadingMore) "Loading…" else "Show older")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Section(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
    )
}

@Composable
private fun Hint(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun ActivityRow(
    person: SocialPersonDto,
    avatarUrl: String?,
    line: String,
    track: TrackSummaryDto,
    coverUrl: String?,
    progress: Float?,
    onOpenProfile: (Int) -> Unit,
    onClick: () -> Unit,
) {
    ListItem(
        leadingContent = {
            Avatar(url = avatarUrl, name = person.name, size = 44.dp, modifier = Modifier.clickable { onOpenProfile(person.id) })
        },
        overlineContent = { Text(line, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        headlineContent = { Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(track.artist ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (progress != null) {
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().padding(top = 22.dp))
            }
        },
        trailingContent = { CoverImage(url = coverUrl, contentDescription = null, modifier = Modifier.size(40.dp)) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick),
    )
}
