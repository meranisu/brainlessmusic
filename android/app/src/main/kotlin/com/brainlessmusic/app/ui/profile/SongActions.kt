package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.ui.common.Notices
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.combinedClickable
import androidx.media3.common.util.UnstableApi
import com.brainlessmusic.app.ui.common.SkinSheet
import com.brainlessmusic.app.downloads.DownloadRepository
import com.brainlessmusic.app.downloads.TrackDownload
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.text.style.TextOverflow
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.theme.accentInk

/**
 * Liking a song and adding it to a playlist, from anywhere a song is shown (A65); accounts only. Also the long-press
 * song menu's play next, dislike and details ([SongMenuSheet]).
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
    val dislikedIds: StateFlow<Set<Int>> = profile.dislikedIds

    /** Your playlists for the add sheet, each saying whether it holds the song the sheet is for. */
    private val _playlists = MutableStateFlow<LoadState<List<PlaylistSummaryDto>>>(LoadState.Loading)
    val playlists: StateFlow<LoadState<List<PlaylistSummaryDto>>> = _playlists.asStateFlow()

    /** Playlists with an add or take-out on its way, so their rows show it and don't take a second tap. */
    private val _busyPlaylistIds = MutableStateFlow<Set<Int>>(emptySet())
    val busyPlaylistIds: StateFlow<Set<Int>> = _busyPlaylistIds.asStateFlow()

    init {
        if (canEdit) viewModelScope.launch {
            profile.loadLikedIds()
            profile.loadDislikedIds()
        }
    }

    /** The menu's Like / Unlike: says what it does, so it likes even a disliked song (which undislikes it). */
    fun setLiked(trackId: Int, liked: Boolean) {
        viewModelScope.launch {
            if (!profile.likesLoaded) {
                profile.loadLikedIds()
                if (!profile.likesLoaded) return@launch
            }
            profile.setLiked(trackId, liked)
        }
    }

    /** A tap on the heart (A153): a disliked song goes back to neither; otherwise like flips. */
    fun toggleLike(trackId: Int) {
        if (trackId in dislikedIds.value) {
            viewModelScope.launch { profile.setDisliked(trackId, false) }
            return
        }
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

    /**
     * Holding the heart, or the menu's Dislike (A153): dislikes the song, or takes the dislike back. Shuffle picks a
     * disliked song about one pass in four (A60), the same mark as a right swipe in the queue. [onDone] gets a line
     * only when it failed, since the heart shows the change.
     */
    fun toggleDislike(trackId: Int, onDone: (String) -> Unit = {}) {
        viewModelScope.launch {
            if (!profile.likesLoaded) profile.loadLikedIds()
            profile.setDisliked(trackId, trackId !in dislikedIds.value).onFailure { onDone("Couldn't change it. Try again.") }
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

    /**
     * The song the sheet's list is for. One view model serves every sheet on a screen, so an answer that arrives after
     * the sheet was closed and opened for another song is dropped rather than put on that song's list.
     */
    private var sheetTrackId: Int? = null

    fun loadPlaylists(trackId: Int) {
        sheetTrackId = trackId
        _playlists.value = LoadState.Loading
        viewModelScope.launch {
            val loaded = profile.playlists(trackId).fold(
                onSuccess = { LoadState.Content(it) },
                onFailure = { LoadState.Error("Couldn't load your playlists.") },
            )
            if (trackId == sheetTrackId) _playlists.value = loaded
        }
    }

    fun albumCoverUrl(albumId: Int): String? = library.albumCoverUrl(albumId)

    /** Moves one row's tick (and its song count) without a reload, if the list is still [trackId]'s. */
    private fun mark(trackId: Int, playlistId: Int, hasTrack: Boolean) {
        if (trackId != sheetTrackId) return
        val list = (_playlists.value as? LoadState.Content)?.data ?: return
        _playlists.value = LoadState.Content(
            list.map {
                if (it.id != playlistId || it.hasTrack == hasTrack) it
                else it.copy(hasTrack = hasTrack, trackCount = it.trackCount + if (hasTrack) 1 else -1)
            },
        )
    }

    /**
     * Adds [trackId] to [playlist], or takes it out if it's already there, as the sheet's rows are switches. [onDone]
     * gets a short line to show.
     */
    fun toggle(playlist: PlaylistSummaryDto, trackId: Int, onDone: (String) -> Unit) {
        if (playlist.id in _busyPlaylistIds.value) return
        _busyPlaylistIds.value += playlist.id
        viewModelScope.launch {
            if (playlist.hasTrack == true) {
                profile.removeFromPlaylist(playlist.id, trackId).fold(
                    onSuccess = {
                        mark(trackId, playlist.id, false)
                        onDone("Taken out of ${playlist.name}")
                    },
                    onFailure = { onDone("Couldn't take it out. Try again.") },
                )
            } else {
                when (profile.addToPlaylist(playlist.id, trackId)) {
                    AddToPlaylistResult.ADDED -> {
                        mark(trackId, playlist.id, true)
                        onDone("Added to ${playlist.name}")
                    }
                    // Added somewhere else meanwhile: it's where it was meant to go, so just show the tick.
                    AddToPlaylistResult.ALREADY_THERE -> mark(trackId, playlist.id, true)
                    AddToPlaylistResult.FAILED -> onDone("Couldn't add it. Try again.")
                }
            }
            _busyPlaylistIds.value -= playlist.id
        }
    }

    /** Makes a playlist named [name] with [trackId] in it; it goes to the top of the sheet, ticked. */
    fun createAndAdd(name: String, trackId: Int, onDone: (String) -> Unit) {
        viewModelScope.launch {
            profile.createPlaylist(name).fold(
                onSuccess = { created ->
                    val added = profile.addToPlaylist(created.id, trackId) != AddToPlaylistResult.FAILED
                    val row = PlaylistSummaryDto(created.id, created.name, if (added) 1 else 0, "", hasTrack = added)
                    if (trackId == sheetTrackId) {
                        (_playlists.value as? LoadState.Content)?.let { _playlists.value = LoadState.Content(listOf(row) + it.data) }
                    }
                    onDone(if (added) "Made ${created.name} with this song in it" else "Made ${created.name}, but couldn't add the song. Tap it to try again.")
                },
                onFailure = { onDone("Couldn't make the playlist. Try again.") },
            )
        }
    }
}

/** A heart that likes or unlikes [trackId]. Shows nothing for guests. */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun LikeButton(trackId: Int, modifier: Modifier = Modifier, viewModel: SongActionsViewModel = hiltViewModel()) {
    if (!viewModel.canEdit) return
    val liked by viewModel.likedIds.collectAsStateWithLifecycle()
    val disliked by viewModel.dislikedIds.collectAsStateWithLifecycle()
    val feeling = feelingOf(trackId, liked, disliked)
    val haptics = LocalHapticFeedback.current
    // Tap likes, hold dislikes (A153); an IconButton has no long press, so the same 48 dp target by hand.
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(48.dp)
            .clip(CircleShape)
            .combinedClickable(
                role = Role.Button,
                onClickLabel = feeling.tapLabel(),
                onLongClickLabel = if (feeling == Feeling.DISLIKED) null else "Dislike",
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.toggleDislike(trackId) { Notices.show(it) }
                },
                onClick = { viewModel.toggleLike(trackId) },
            ),
    ) {
        FeelingHeart(
            feeling,
            tint = if (feeling == Feeling.LIKED) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** From this many playlists a filter shows above the list. */
private const val FILTER_FROM = 6

/**
 * Puts one song in your playlists. Each row is a switch: a tick means the song is in it, and a tap adds it or takes it
 * out, so it can go in several at once; Done closes. New playlist names one ([PlaylistNameDialog], checked as typed)
 * and adds the song to it. The web's Add to playlist dialog works the same way.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToPlaylistSheet(
    trackId: Int,
    trackTitle: String,
    onDismiss: () -> Unit,
    trackArtist: String? = null,
    coverUrl: String? = null,
    viewModel: SongActionsViewModel = hiltViewModel(),
) {
    val state by viewModel.playlists.collectAsStateWithLifecycle()
    val busyIds by viewModel.busyPlaylistIds.collectAsStateWithLifecycle()
    // Null: not naming. A string: naming, starting from it (the filter's text, when "Make it" was tapped).
    var naming by remember { mutableStateOf<String?>(null) }
    var filter by remember { mutableStateOf("") }
    LaunchedEffect(trackId) { viewModel.loadPlaylists(trackId) }

    val playlists = (state as? LoadState.Content)?.data
    val show: (String) -> Unit = { Notices.show(it) }

    naming?.let { start ->
        PlaylistNameDialog(
            title = "New playlist",
            confirmLabel = "Create and add",
            initial = start,
            hint = "\u201C$trackTitle\u201D goes in it.",
            takenNames = playlists.orEmpty().map { it.name },
            onConfirm = { name ->
                filter = ""
                viewModel.createAndAdd(name, trackId, show)
            },
            onDismiss = { naming = null },
        )
    }

    SkinSheet(onDismissRequest = onDismiss) {
        SheetStatusBarFollowsApp()
        // The song, so it's clear what is being added.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(start = 24.dp, end = 24.dp, bottom = 12.dp),
        ) {
            CoverImage(url = coverUrl, contentDescription = null, modifier = Modifier.size(48.dp))
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text("Add to playlist", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(trackTitle, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (trackArtist != null) {
                    Text(
                        trackArtist,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        if (playlists != null && playlists.size >= FILTER_FROM) {
            OutlinedTextField(
                value = filter,
                onValueChange = { filter = it },
                placeholder = { Text("Find one of your ${playlists.size} playlists") },
                leadingIcon = { Icon(AppIcons.search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        val query = filter.trim()
        val shown = if (query.isEmpty()) playlists else playlists?.filter { it.name.contains(query, ignoreCase = true) }

        LazyColumn(modifier = Modifier.weight(1f, fill = false)) {
            if (playlists != null) {
                item(key = "new") {
                    ListItem(
                        leadingContent = {
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier
                                    .size(40.dp)
                                    .border(1.dp, MaterialTheme.colorScheme.outline, MaterialTheme.shapes.small),
                            ) { Icon(AppIcons.add, contentDescription = null, tint = MaterialTheme.accentInk) }
                        },
                        headlineContent = { Text("New playlist") },
                        supportingContent = if (playlists.isEmpty()) {
                            { Text("You have no playlists yet. Name one and this song goes in it.") }
                        } else {
                            null
                        },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        modifier = Modifier.clickable { naming = "" },
                    )
                }
            }
            when (val s = state) {
                LoadState.Loading -> item(key = "loading") {
                    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(Modifier.size(28.dp))
                    }
                }
                is LoadState.Error -> item(key = "error") {
                    Column(Modifier.padding(horizontal = 24.dp, vertical = 12.dp)) {
                        Text(s.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                        TextButton(onClick = { viewModel.loadPlaylists(trackId) }) { Text("Try again") }
                    }
                }
                is LoadState.Content -> Unit
            }
            items(shown.orEmpty(), key = { it.id }) { playlist ->
                val has = playlist.hasTrack == true
                val busy = playlist.id in busyIds
                ListItem(
                    leadingContent = {
                        CoverImage(
                            url = playlist.coverAlbumIds?.firstOrNull()?.let(viewModel::albumCoverUrl),
                            contentDescription = null,
                            modifier = Modifier.size(40.dp),
                        )
                    },
                    headlineContent = { Text(playlist.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    supportingContent = {
                        Text(
                            (if (playlist.trackCount == 1) "1 song" else "${playlist.trackCount} songs") +
                                if (playlist.isPublic) " · Public" else "",
                        )
                    },
                    trailingContent = {
                        when {
                            busy -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                            has -> Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(AppIcons.check, contentDescription = null, tint = MaterialTheme.accentInk, modifier = Modifier.size(18.dp))
                                Text("Added", color = MaterialTheme.accentInk, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = 4.dp))
                            }
                            else -> Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(AppIcons.add, contentDescription = null, modifier = Modifier.size(18.dp))
                                Text("Add", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = 4.dp))
                            }
                        }
                    },
                    colors = ListItemDefaults.colors(
                        containerColor = if (has) MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.35f) else Color.Transparent,
                    ),
                    modifier = Modifier.clickable(
                        enabled = !busy,
                        onClickLabel = if (has) "Take out of ${playlist.name}" else "Add to ${playlist.name}",
                    ) { viewModel.toggle(playlist, trackId, show) },
                )
            }
            if (query.isNotEmpty() && shown?.isEmpty() == true) {
                item(key = "nomatch") {
                    Column(Modifier.padding(horizontal = 24.dp, vertical = 12.dp)) {
                        Text(
                            "None of your playlists is called anything like \u201C$query\u201D.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        TextButton(onClick = { naming = query }) { Text("Make \u201C$query\u201D") }
                    }
                }
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.navigationBarsPadding().padding(start = 24.dp, end = 16.dp, top = 4.dp, bottom = 8.dp),
        ) {
            val inCount = playlists.orEmpty().count { it.hasTrack == true }
            Text(
                when {
                    playlists.isNullOrEmpty() -> ""
                    inCount == 0 -> "Not in any of your playlists yet"
                    else -> "In $inCount of your playlists"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onDismiss) { Text("Done") }
        }
    }
}
