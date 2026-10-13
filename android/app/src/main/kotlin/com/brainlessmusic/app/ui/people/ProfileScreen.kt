package com.brainlessmusic.app.ui.people

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.ProfileDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.data.repository.StatsRange
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.rooms.RoomSession
import com.brainlessmusic.app.ui.common.Avatar
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.Notices
import com.brainlessmusic.app.ui.common.SkeletonLead
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.profile.EmptyLine
import com.brainlessmusic.app.ui.profile.ListCard
import com.brainlessmusic.app.ui.profile.RangePicker
import com.brainlessmusic.app.ui.profile.RankedRow
import com.brainlessmusic.app.ui.profile.SectionTitle
import com.brainlessmusic.app.ui.profile.SongMenuSheet
import com.brainlessmusic.app.ui.profile.formatDay
import com.brainlessmusic.app.ui.profile.formatListened
import com.brainlessmusic.app.ui.profile.loadMessage
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.DisplayFontFamily
import com.brainlessmusic.app.ui.theme.cardShape
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** Liked or disliked songs shown before "Show all", as on the web. */
private const val PREVIEW = 12

/** The server's own cap on a picture (`PUT /me/avatar`). */
private const val MAX_PICTURE_BYTES = 5 * 1024 * 1024

private const val MAX_BIO = 300

@HiltViewModel
class ProfileViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val profile: ProfileRepository,
    private val library: LibraryRepository,
    private val playback: PlaybackController,
    private val rooms: RoomSession,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    val userId: Int = checkNotNull(savedStateHandle.get<Int>(Routes.ARG_USER_ID))

    private val _range = MutableStateFlow(StatsRange.MONTH)
    val range: StateFlow<StatsRange> = _range.asStateFlow()

    private val _state = MutableStateFlow<LoadState<ProfileDto>>(LoadState.Loading)
    val state: StateFlow<LoadState<ProfileDto>> = _state.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    /** "Show all" lists, by liked (true) or disliked (false), once loaded. */
    private val _fullLists = MutableStateFlow<Map<Boolean, List<TrackSummaryDto>>>(emptyMap())
    val fullLists: StateFlow<Map<Boolean, List<TrackSummaryDto>>> = _fullLists.asStateFlow()

    private val _saving = MutableStateFlow(false)
    val saving: StateFlow<Boolean> = _saving.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun load() = fetch(showLoading = true)

    fun refresh() = fetch(showLoading = false)

    fun setRange(range: StatsRange) {
        if (range == _range.value) return
        _range.value = range
        fetch(showLoading = false)
    }

    private fun fetch(showLoading: Boolean) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            if (showLoading) _state.value = LoadState.Loading else _refreshing.value = true
            profile.profile(userId, _range.value).fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { if (showLoading || _state.value !is LoadState.Content) _state.value = LoadState.Error(it.loadMessage()) },
            )
            _refreshing.value = false
        }
    }

    fun showAll(liked: Boolean) {
        viewModelScope.launch {
            profile.profileSongs(userId, liked).fold(
                onSuccess = { list -> _fullLists.value = _fullLists.value + (liked to list) },
                onFailure = { Notices.show(it.loadMessage()) },
            )
        }
    }

    /** The room you're in, if any: playing from here then adds to everyone's queue, so the screen asks first (A173). */
    fun roomCode(): String? = rooms.state.value.room?.code

    fun play(tracks: List<TrackSummaryDto>, index: Int) {
        if (index in tracks.indices) playback.playQueue(tracks.map(library::queueItem), index)
    }

    fun queueItem(track: TrackSummaryDto): QueueItem = library.queueItem(track)

    fun coverUrl(track: TrackSummaryDto): String? =
        track.albumId?.let(library::albumCoverUrl) ?: library.trackCoverUrl(track.id)

    fun avatarUrl(p: ProfileDto): String? = profile.avatarUrl(p.id, p.avatarId)

    /** Reads the picked image and uploads it; the server crops and scales it. */
    fun setPicture(uri: Uri) {
        viewModelScope.launch {
            _saving.value = true
            val resolver = context.contentResolver
            val bytes = withContext(Dispatchers.IO) {
                runCatching { resolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            }
            when {
                bytes == null -> Notices.show("Couldn't read that picture.")
                bytes.size > MAX_PICTURE_BYTES -> Notices.show("That picture is over 5 MB. Pick a smaller one.")
                else -> profile.setAvatar(bytes, resolver.getType(uri)).fold(
                    onSuccess = { Notices.show("Picture updated"); refresh() },
                    onFailure = { Notices.show(it.loadMessage()) },
                )
            }
            _saving.value = false
        }
    }

    fun removePicture() {
        viewModelScope.launch {
            _saving.value = true
            profile.setAvatar(null, null).fold(
                onSuccess = { Notices.show("Picture removed"); refresh() },
                onFailure = { Notices.show(it.loadMessage()) },
            )
            _saving.value = false
        }
    }

    fun save(bio: String, trackId: Int?, artistId: Int?, onDone: () -> Unit) {
        viewModelScope.launch {
            _saving.value = true
            profile.updateProfile(bio.trim().ifEmpty { null }, trackId, artistId).fold(
                onSuccess = {
                    Notices.show("Profile saved")
                    onDone()
                    refresh()
                },
                onFailure = { Notices.show(it.loadMessage()) },
            )
            _saving.value = false
        }
    }
}

/**
 * Someone's profile (A167-A170): picture, bio and pins, what they listen to most over a range, their playlists, and
 * their liked and disliked songs, which everyone sees (A168). Your own has Edit and "See everyone" (A172). Opening one
 * during Listen together leaves the room playing; playing a song from here asks first (A173).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    onOpenArtist: (Int) -> Unit,
    onOpenAlbum: (Int) -> Unit,
    onOpenGenre: (Int) -> Unit,
    onOpenPlaylist: (Int) -> Unit,
    onOpenPeople: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val range by viewModel.range.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    val fullLists by viewModel.fullLists.collectAsStateWithLifecycle()
    val saving by viewModel.saving.collectAsStateWithLifecycle()

    var menuFor by remember { mutableStateOf<QueueItem?>(null) }
    var askRoom by remember { mutableStateOf<Triple<String, List<TrackSummaryDto>, Int>?>(null) }
    var editing by remember { mutableStateOf(false) }

    menuFor?.let { SongMenuSheet(item = it, onDismiss = { menuFor = null }, onOpenAlbum = onOpenAlbum, onOpenArtist = onOpenArtist) }

    val play: (List<TrackSummaryDto>, Int) -> Unit = { tracks, index ->
        val code = viewModel.roomCode()
        if (code == null) viewModel.play(tracks, index) else askRoom = Triple(code, tracks, index)
    }
    askRoom?.let { (code, tracks, index) ->
        val more = tracks.size - index - 1
        AlertDialog(
            onDismissRequest = { askRoom = null },
            title = { Text("Play this in room $code?") },
            text = {
                Text(
                    "${tracks[index].title}${if (more > 0) " and the ${if (more == 1) "song" else "songs"} after it" else ""} " +
                        "will go next in the room's queue, for everyone listening.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.play(tracks, index)
                    askRoom = null
                }) { Text("Play in the room") }
            },
            dismissButton = { TextButton(onClick = { askRoom = null }) { Text("Cancel") } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    val name = (state as? LoadState.Content)?.data?.name ?: "Profile"
                    Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                },
                navigationIcon = { IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") } },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            loadingLabel = "Loading profile",
            skeleton = { SkeletonListRows(lead = SkeletonLead.COVER, trailing = true) },
        ) { p ->
            if (editing && p.isSelf) {
                EditProfileDialog(
                    profile = p,
                    pictureUrl = viewModel.avatarUrl(p),
                    saving = saving,
                    onPicture = viewModel::setPicture,
                    onRemovePicture = viewModel::removePicture,
                    onSave = { bio, track, artist -> viewModel.save(bio, track, artist) { editing = false } },
                    onDismiss = { editing = false },
                )
            }
            PullToRefreshBox(isRefreshing = refreshing, onRefresh = viewModel::refresh) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                    item(key = "header") {
                        ProfileHeader(
                            p = p,
                            pictureUrl = viewModel.avatarUrl(p),
                            onPlayFavorite = { p.favoriteTrack?.let { play(listOf(it), 0) } },
                            onOpenArtist = onOpenArtist,
                            onEdit = { editing = true },
                            onOpenPeople = onOpenPeople,
                        )
                    }
                    item(key = "range") { RangePicker(range, viewModel::setRange) }
                    item(key = "totals") {
                        Text(
                            "${formatListened(p.totals.msListened)} listened · ${p.totals.plays} plays · ${p.totals.tracks} songs",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 20.dp),
                        )
                    }

                    item(key = "top-songs-title") { SectionTitle("Top songs") }
                    item(key = "top-songs") {
                        ListCard {
                            if (p.topTracks.isEmpty()) EmptyLine("Nothing played in this range.")
                            val tracks = p.topTracks.map { it.track }
                            p.topTracks.forEachIndexed { index, top ->
                                RankedRow(
                                    rank = index + 1,
                                    coverUrl = viewModel.coverUrl(top.track),
                                    title = top.track.title,
                                    subtitle = top.track.artist ?: "Unknown artist",
                                    plays = top.plays,
                                    msListened = top.msListened,
                                    movement = null,
                                    onClick = { play(tracks, index) },
                                    onLongClick = { menuFor = viewModel.queueItem(top.track) },
                                )
                            }
                        }
                    }

                    if (p.topArtists.isNotEmpty()) {
                        item(key = "top-artists-title") { SectionTitle("Top artists") }
                        item(key = "top-artists") {
                            ListCard {
                                p.topArtists.forEachIndexed { index, artist ->
                                    RankedRow(
                                        rank = index + 1,
                                        coverUrl = null,
                                        title = artist.name,
                                        subtitle = null,
                                        plays = artist.plays,
                                        msListened = artist.msListened,
                                        movement = null,
                                        onClick = { onOpenArtist(artist.id) },
                                    )
                                }
                            }
                        }
                    }

                    val genres = p.topGenres.orEmpty()
                    if (genres.isNotEmpty()) {
                        item(key = "genres-title") { SectionTitle("Top genres") }
                        item(key = "genres") {
                            ListCard {
                                genres.forEach { genre ->
                                    PlainRow(
                                        title = genre.name,
                                        detail = if (genre.plays == 1) "1 play" else "${genre.plays} plays",
                                        onClick = { onOpenGenre(genre.id) },
                                    )
                                }
                            }
                        }
                    }

                    item(key = "playlists-title") { SectionTitle(if (p.isSelf) "Your playlists" else "Public playlists") }
                    item(key = "playlists") {
                        ListCard {
                            if (p.playlists.isEmpty()) {
                                EmptyLine(if (p.isSelf) "No playlists yet." else "No public playlists.")
                            }
                            p.playlists.forEach { playlist ->
                                val count = if (playlist.trackCount == 1) "1 song" else "${playlist.trackCount} songs"
                                PlainRow(
                                    title = playlist.name,
                                    detail = if (p.isSelf) "$count · ${if (playlist.isPublic) "Public" else "Only you"}" else count,
                                    onClick = { onOpenPlaylist(playlist.id) },
                                )
                            }
                        }
                    }

                    listOf(true, false).forEach { liked ->
                        val section = if (liked) p.liked else p.disliked
                        val full = fullLists[liked]
                        val tracks = full ?: section.tracks.take(PREVIEW)
                        item(key = "songs-title-$liked") {
                            SectionTitle("${if (liked) "Liked" else "Disliked"} songs · ${section.total}")
                        }
                        item(key = "songs-$liked") {
                            ListCard {
                                if (section.total == 0) EmptyLine(if (liked) "No liked songs yet." else "None.")
                                tracks.forEachIndexed { index, track ->
                                    SongRow(
                                        track = track,
                                        cover = viewModel.coverUrl(track),
                                        onClick = { play(tracks, index) },
                                    )
                                }
                                if (full == null && section.total > tracks.size) {
                                    TextButton(
                                        onClick = { viewModel.showAll(liked) },
                                        modifier = Modifier.padding(horizontal = 8.dp),
                                    ) { Text("Show all ${section.total}") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileHeader(
    p: ProfileDto,
    pictureUrl: String?,
    onPlayFavorite: () -> Unit,
    onOpenArtist: (Int) -> Unit,
    onEdit: () -> Unit,
    onOpenPeople: () -> Unit,
) {
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(url = pictureUrl, name = p.name, size = 88.dp)
                Column(Modifier.padding(start = 16.dp).weight(1f)) {
                    Text(
                        p.name,
                        style = MaterialTheme.typography.headlineSmall.copy(fontFamily = DisplayFontFamily),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    // The login name and role only on your own (A174).
                    Text(
                        listOfNotNull(p.username, if (p.isAdmin == true) "Admin" else null, "here since ${formatDay(p.memberSince)}")
                            .joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            p.bio?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp))
            }
            p.favoriteTrack?.let { track ->
                Favorite(
                    label = "Favourite song",
                    value = listOfNotNull(track.title, track.artist).joinToString(" · "),
                    onClick = onPlayFavorite,
                )
            }
            p.favoriteArtist?.let { artist ->
                Favorite(label = "Favourite artist", value = artist.name, onClick = { onOpenArtist(artist.id) })
            }
            if (p.isSelf) {
                Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onEdit, modifier = Modifier.weight(1f)) { Text("Edit profile") }
                    // Your own page is where you'd look for everyone else's (A172).
                    OutlinedButton(onClick = onOpenPeople, modifier = Modifier.weight(1f)) { Text("See everyone") }
                }
            }
        }
    }
}

@Composable
private fun Favorite(label: String, value: String, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 10.dp)
            .clickable(onClickLabel = label, onClick = onClick),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        Text(value, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun PlainRow(title: String, detail: String, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        trailingContent = { Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@Composable
private fun SongRow(track: TrackSummaryDto, cover: String?, onClick: () -> Unit) {
    ListItem(
        leadingContent = { CoverImage(url = cover, contentDescription = null, modifier = Modifier.size(44.dp)) },
        headlineContent = { Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = { Text(track.artist ?: "Unknown artist", maxLines = 1, overflow = TextOverflow.Ellipsis) },
        trailingContent = { Text(formatDuration(track.duration), style = MaterialTheme.typography.bodySmall) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick),
    )
}

/** Edit your profile: the picture from the phone's photo picker, a bio, and pins chosen from your top and liked lists. */
@Composable
private fun EditProfileDialog(
    profile: ProfileDto,
    pictureUrl: String?,
    saving: Boolean,
    onPicture: (Uri) -> Unit,
    onRemovePicture: () -> Unit,
    onSave: (bio: String, trackId: Int?, artistId: Int?) -> Unit,
    onDismiss: () -> Unit,
) {
    var bio by remember { mutableStateOf(profile.bio.orEmpty()) }
    var trackId by remember { mutableStateOf(profile.favoriteTrack?.id) }
    var artistId by remember { mutableStateOf(profile.favoriteArtist?.id) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(onPicture) }

    // What can be pinned: the current pin, then your top songs and liked songs (or top artists), each once.
    val songs = (listOfNotNull(profile.favoriteTrack) + profile.topTracks.map { it.track } + profile.liked.tracks)
        .distinctBy { it.id }
        .associate { it.id to listOfNotNull(it.title, it.artist).joinToString(" · ") }
    val artists = (listOfNotNull(profile.favoriteArtist?.let { it.id to it.name }) + profile.topArtists.map { it.id to it.name })
        .toMap()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit profile") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(url = pictureUrl, name = profile.name, size = 64.dp)
                    Column(Modifier.padding(start = 12.dp)) {
                        TextButton(
                            enabled = !saving,
                            onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        ) { Text(if (profile.avatarId == null) "Add a picture" else "Change picture") }
                        if (profile.avatarId != null) {
                            TextButton(enabled = !saving, onClick = onRemovePicture) { Text("Remove picture") }
                        }
                    }
                }
                OutlinedTextField(
                    value = bio,
                    onValueChange = { bio = it.take(MAX_BIO) },
                    label = { Text("Bio") },
                    supportingText = { Text("${bio.length} / $MAX_BIO") },
                    minLines = 2,
                    maxLines = 5,
                    modifier = Modifier.fillMaxWidth(),
                )
                PinPicker("Favourite song", songs, trackId) { trackId = it }
                PinPicker("Favourite artist", artists, artistId) { artistId = it }
            }
        },
        confirmButton = {
            TextButton(enabled = !saving, onClick = { onSave(bio, trackId, artistId) }) { Text(if (saving) "Saving…" else "Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun PinPicker(label: String, choices: Map<Int, String>, selected: Int?, onPick: (Int?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = { open = true }, enabled = choices.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
            Text(
                selected?.let(choices::get) ?: if (choices.isEmpty()) "Nothing to pick yet" else "None",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.heightIn(max = 360.dp)) {
            DropdownMenuItem(text = { Text("None") }, onClick = { onPick(null); open = false })
            choices.forEach { (id, text) ->
                DropdownMenuItem(
                    text = { Text(text, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    onClick = { onPick(id); open = false },
                )
            }
        }
    }
}
