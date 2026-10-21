package com.brainlessmusic.app.ui.people

import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableIntStateOf
import com.brainlessmusic.app.ui.common.SkinTabBar
import com.brainlessmusic.app.ui.common.dockedHeader
import com.brainlessmusic.app.ui.stats.StatsContent
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.consumeWindowInsets
import com.brainlessmusic.app.ui.common.SongListItem
import com.brainlessmusic.app.ui.common.FullScreenDialog
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.ProfileDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.ConnectionError
import com.brainlessmusic.app.data.repository.ConnectionException
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
import com.brainlessmusic.app.ui.navigation.Routes
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.profile.EmptyLine
import com.brainlessmusic.app.ui.profile.ListCard
import com.brainlessmusic.app.ui.profile.RangePicker
import com.brainlessmusic.app.ui.profile.RankedRow
import com.brainlessmusic.app.ui.profile.SectionTitle
import com.brainlessmusic.app.ui.profile.SongMenuSheet
import com.brainlessmusic.app.ui.profile.formatDay
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
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.job
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.remote.dto.ProfileCountsDto
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.profile.ListeningRadar
import com.brainlessmusic.app.ui.profile.HitCircleListening
import com.brainlessmusic.app.ui.profile.LaneListening
import com.brainlessmusic.app.ui.profile.RingListening
import com.brainlessmusic.app.ui.profile.StandardListening
import com.brainlessmusic.app.data.repository.AuthRepository
import com.brainlessmusic.app.data.remote.dto.SearchResultsDto
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.foundation.text.KeyboardOptions
import kotlinx.coroutines.delay
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.draw.clip

/** Your own profile's tabs (owner, 2026-10-21); [route] is the `tab` a link opens it on. */
enum class ProfileTab(val label: String, val route: String) {
    PROFILE("Profile", "profile"),
    STATS("Stats", "stats"),
    FRIENDS("Friends", "friends"),
    ;

    companion object {
        fun from(route: String?): ProfileTab = entries.firstOrNull { it.route == route } ?: PROFILE
    }
}

/** Liked or disliked songs shown before "Show all", as on the web. */
private const val PREVIEW = 12

private const val MAX_BIO = 300

@HiltViewModel
class ProfileViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val profile: ProfileRepository,
    private val library: LibraryRepository,
    private val playback: PlaybackController,
    private val rooms: RoomSession,
    private val auth: AuthRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    val userId: Int = checkNotNull(savedStateHandle.get<Int>(Routes.ARG_USER_ID))

    /** The tab a link asked for (Home's "See all your stats"), read once; only your own profile has tabs. */
    val startTab: String? = savedStateHandle.get<String>(Routes.ARG_PROFILE_TAB)

    private val _range = MutableStateFlow(StatsRange.MONTH)
    val range: StateFlow<StatsRange> = _range.asStateFlow()

    private val _state = MutableStateFlow<LoadState<ProfileDto>>(LoadState.Loading)
    val state: StateFlow<LoadState<ProfileDto>> = _state.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    /** A range switch is loading: the numbers stay up, faded, as on Home, instead of the pull-to-refresh spinner. */
    private val _switching = MutableStateFlow(false)
    val switching: StateFlow<Boolean> = _switching.asStateFlow()

    /** "Show all" lists, by liked (true) or disliked (false), once loaded. */
    private val _fullLists = MutableStateFlow<Map<Boolean, List<TrackSummaryDto>>>(emptyMap())
    val fullLists: StateFlow<Map<Boolean, List<TrackSummaryDto>>> = _fullLists.asStateFlow()

    private val _saving = MutableStateFlow(false)
    val saving: StateFlow<Boolean> = _saving.asStateFlow()

    /** A picked photo, opened and waiting in the cropper (Phase 6). */
    private val _cropping = MutableStateFlow<Bitmap?>(null)
    val cropping: StateFlow<Bitmap?> = _cropping.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun load() = fetch(Fetch.LOAD)

    fun refresh() = fetch(Fetch.REFRESH)

    fun setRange(range: StatsRange) {
        if (range == _range.value) return
        _range.value = range
        fetch(Fetch.SWITCH)
    }

    private enum class Fetch { LOAD, REFRESH, SWITCH }

    private fun fetch(how: Fetch) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            when (how) {
                Fetch.LOAD -> _state.value = LoadState.Loading
                Fetch.REFRESH -> _refreshing.value = true
                Fetch.SWITCH -> _switching.value = true
            }
            try {
                profile.profile(userId, _range.value).fold(
                    onSuccess = { _state.value = LoadState.Content(it) },
                    onFailure = {
                        if (how == Fetch.LOAD || _state.value !is LoadState.Content) _state.value = LoadState.Error(it.loadMessage())
                    },
                )
            } finally {
                // A newer fetch cancelled this one: it owns the flags now.
                if (loadJob === coroutineContext.job) {
                    _refreshing.value = false
                    _switching.value = false
                }
            }
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

    /** Opens the picked photo for the cropper, or says why it can't be used. */
    fun setPicture(uri: Uri) {
        viewModelScope.launch {
            _saving.value = true
            when (val picked = withContext(Dispatchers.IO) { openForCrop(context.contentResolver, uri) }) {
                is PickedPicture.Ready -> _cropping.value = picked.bitmap
                is PickedPicture.Problem -> Notices.show(picked.message)
            }
            _saving.value = false
        }
    }

    fun cancelCrop() {
        _cropping.value = null
    }

    /** Crops the open photo to the square chosen in the cropper, as a 512 px JPEG, and uploads it. */
    fun usePicture(left: Float, top: Float, side: Float) {
        val bitmap = _cropping.value ?: return
        viewModelScope.launch {
            _saving.value = true
            val jpeg = withContext(Dispatchers.Default) { runCatching { cropToJpeg(bitmap, left, top, side) }.getOrNull() }
            if (jpeg == null) {
                Notices.show("That picture couldn't be cropped.")
            } else {
                profile.setAvatar(jpeg, "image/jpeg").fold(
                    onSuccess = {
                        _cropping.value = null
                        Notices.show("Picture updated")
                        refresh()
                    },
                    onFailure = { Notices.show(it.pictureMessage()) },
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

    /** Songs and artists for the pin pickers, from the whole library. */
    suspend fun searchLibrary(query: String) = library.search(query)

    /**
     * Saves the edit page: the display name first when [name] isn't null (it changed; empty shows the username again),
     * then the bio and pins. [onDone] runs only when both went through.
     */
    fun save(name: String?, bio: String, trackId: Int?, artistId: Int?, onDone: () -> Unit) {
        viewModelScope.launch {
            _saving.value = true
            val renamed = name?.let { auth.setDisplayName(it) }
            if (renamed?.isFailure == true) {
                Notices.show("Couldn't change your name: ${renamed.exceptionOrNull()?.loadMessage()}")
            } else {
                profile.updateProfile(bio.trim().ifEmpty { null }, trackId, artistId).fold(
                    onSuccess = {
                        Notices.show("Profile saved")
                        onDone()
                    },
                    onFailure = { Notices.show(it.loadMessage()) },
                )
                refresh()
            }
            _saving.value = false
        }
    }
}

/**
 * Someone's profile (A167-A170): picture, bio and pins, what they listen to most over a range, their playlists, and
 * their liked and disliked songs, which everyone sees (A168). Your own has Edit profile (A186); People is in Listen
 * together (A182). Opening one
 * during Listen together leaves the room playing; playing a song from here asks first (A173).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    onOpenProfile: (Int) -> Unit,
    onOpenNowPlaying: () -> Unit,
    onOpenArtist: (Int) -> Unit,
    onOpenAlbum: (Int) -> Unit,
    onOpenGenre: (Int) -> Unit,
    onOpenPlaylist: (Int) -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val range by viewModel.range.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    val switching by viewModel.switching.collectAsStateWithLifecycle()
    val rangeAlpha by animateFloatAsState(if (switching) 0.5f else 1f, label = "rangeAlpha")
    val fullLists by viewModel.fullLists.collectAsStateWithLifecycle()
    val saving by viewModel.saving.collectAsStateWithLifecycle()
    val cropping by viewModel.cropping.collectAsStateWithLifecycle()

    var menuFor by remember { mutableStateOf<QueueItem?>(null) }
    var askRoom by remember { mutableStateOf<Triple<String, List<TrackSummaryDto>, Int>?>(null) }
    var editing by remember { mutableStateOf(false) }
    var tabIndex by rememberSaveable { mutableIntStateOf(ProfileTab.from(viewModel.startTab).ordinal) }

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
                // The header under it already shows the name in large type, so the bar just says where you are.
                title = { Text("Profile") },
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
            cropping?.let { bitmap ->
                AvatarCropDialog(
                    bitmap = bitmap,
                    saving = saving,
                    onCancel = viewModel::cancelCrop,
                    onUse = viewModel::usePicture,
                )
            }
            if (editing && p.isSelf) {
                EditProfilePage(
                    profile = p,
                    pictureUrl = viewModel.avatarUrl(p),
                    saving = saving,
                    coverUrl = viewModel::coverUrl,
                    search = viewModel::searchLibrary,
                    onPicture = viewModel::setPicture,
                    onRemovePicture = viewModel::removePicture,
                    onSave = { name, bio, track, artist -> viewModel.save(name, bio, track, artist) { editing = false } },
                    onDismiss = { editing = false },
                )
            }
            // Your own profile holds Stats and Friends as tabs (owner, 2026-10-21); everyone else's is the one page.
            val tab = if (p.isSelf) ProfileTab.entries[tabIndex] else ProfileTab.PROFILE
            Column(Modifier.fillMaxSize()) {
                if (p.isSelf) {
                    val stretched = dockedHeader || LocalSkin.current == Skin.RING
                    SkinTabBar(
                        labels = ProfileTab.entries.map { it.label },
                        selected = tabIndex,
                        onSelect = { tabIndex = it },
                        modifier = Modifier
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                            .then(if (stretched) Modifier.fillMaxWidth() else Modifier),
                    )
                }
                when (tab) {
                    ProfileTab.STATS -> StatsContent(onOpenArtist, onOpenAlbum, Modifier.weight(1f))
                    ProfileTab.FRIENDS -> FriendsContent(onOpenProfile, onOpenPlaylist, Modifier.weight(1f))
                    ProfileTab.PROFILE -> {
                        PullToRefreshBox(isRefreshing = refreshing, onRefresh = viewModel::refresh, modifier = Modifier.weight(1f)) {
                            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                                item(key = "header") {
                                    ProfileHeader(
                                        p = p,
                                        pictureUrl = viewModel.avatarUrl(p),
                                        onPlayFavorite = { p.favoriteTrack?.let { play(listOf(it), 0) } },
                                        onOpenArtist = onOpenArtist,
                                        onEdit = { editing = true },
                                    )
                                }
                                item(key = "range") { RangePicker(range, viewModel::setRange) }
                                // What the range picks fades while another range loads.
                                val ofRange = Modifier.graphicsLayer { alpha = rangeAlpha }
                                // The same reading of the range as Home's, in the skin's game (owner, 2026-10-13): Gear's radar,
                                // Hit circle's circles, Lane's potential, Ring's rating plate, Standard's plain numbers.
                                item(key = "listening") {
                                    val stats = remember(p) { p.asListeningStats() }
                                    val owner = p.name.takeIf { !p.isSelf }
                                    Box(ofRange) {
                                        when (LocalSkin.current) {
                                            Skin.GEAR -> ListeningRadar(stats, range, owner = owner)
                                            Skin.HIT_CIRCLE -> HitCircleListening(stats, range, owner = owner)
                                            Skin.LANE -> LaneListening(stats, range, owner = owner)
                                            Skin.RING -> RingListening(stats, range, owner = owner)
                                            Skin.STANDARD -> StandardListening(stats, range)
                                        }
                                    }
                                }

                                item(key = "top-songs-title") { SectionTitle("Top songs") }
                                item(key = "top-songs") { Box(ofRange) {
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
                                } }

                                if (p.topArtists.isNotEmpty()) {
                                    item(key = "top-artists-title") { SectionTitle("Top artists") }
                                    item(key = "top-artists") { Box(ofRange) {
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
                                    } }
                                }

                                val genres = p.topGenres.orEmpty()
                                if (genres.isNotEmpty()) {
                                    item(key = "genres-title") { SectionTitle("Top genres") }
                                    item(key = "genres") { Box(ofRange) {
                                        ListCard {
                                            genres.forEach { genre ->
                                                PlainRow(
                                                    title = genre.name,
                                                    detail = if (genre.plays == 1) "1 play" else "${genre.plays} plays",
                                                    onClick = { onOpenGenre(genre.id) },
                                                )
                                            }
                                        }
                                    } }
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
                OutlinedButton(onClick = onEdit, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text("Edit profile") }
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
    SongListItem(
        title = AnnotatedString(track.title),
        subtitle = AnnotatedString(track.artist ?: "Unknown artist"),
        durationSeconds = track.duration,
        onClick = onClick,
        showCover = true,
        coverUrl = cover,
        transparent = true,
    )
}

/** Longest display name, in characters. Matches the server's limit for `PUT /me/name`. */
private const val MAX_NAME = 32

/** A pinned artist: artists have no pictures, so the row shows their initial. */
private data class PinnedArtist(val id: Int, val name: String)

/**
 * Edit your profile on a page of its own (A186): your picture (it saves at once, after the cropper), then your name
 * and bio, then your pins, chosen from a searchable list over the whole library. Save lights only once something
 * changed, and leaving with changes asks first.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditProfilePage(
    profile: ProfileDto,
    pictureUrl: String?,
    saving: Boolean,
    coverUrl: (TrackSummaryDto) -> String?,
    search: suspend (String) -> Result<SearchResultsDto>,
    onPicture: (Uri) -> Unit,
    onRemovePicture: () -> Unit,
    /** [name] is null when it wasn't changed. */
    onSave: (name: String?, bio: String, trackId: Int?, artistId: Int?) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(profile.name) }
    var bio by remember { mutableStateOf(profile.bio.orEmpty()) }
    var track by remember { mutableStateOf(profile.favoriteTrack) }
    var artist by remember { mutableStateOf(profile.favoriteArtist?.let { PinnedArtist(it.id, it.name) }) }
    var pictureMenu by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf<PinKind?>(null) }
    var confirmingDiscard by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(onPicture) }

    val nameChanged = name.trim() != profile.name
    val changed = nameChanged ||
        bio.trim() != profile.bio.orEmpty().trim() ||
        track?.id != profile.favoriteTrack?.id ||
        artist?.id != profile.favoriteArtist?.id
    val leave = { if (changed) confirmingDiscard = true else onDismiss() }

    // Suggestions before anything is typed: the current pin, then your top songs and liked songs (or top artists).
    val suggestedSongs = remember(profile) {
        (listOfNotNull(profile.favoriteTrack) + profile.topTracks.map { it.track } + profile.liked.tracks).distinctBy { it.id }
    }
    val suggestedArtists = remember(profile) {
        (listOfNotNull(profile.favoriteArtist?.let { PinnedArtist(it.id, it.name) }) + profile.topArtists.map { PinnedArtist(it.id, it.name) })
            .distinctBy { it.id }
    }

    FullScreenDialog(onDismissRequest = leave) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Edit profile") },
                    navigationIcon = { IconButton(onClick = leave) { Icon(AppIcons.close, contentDescription = "Close") } },
                    actions = {
                        TextButton(
                            enabled = changed && !saving,
                            onClick = { onSave(if (nameChanged) name.trim() else null, bio, track?.id, artist?.id) },
                        ) { Text(if (saving) "Saving…" else "Save") }
                    },
                )
            },
        ) { padding ->
            Column(
                Modifier
                    .padding(padding)
                    .consumeWindowInsets(padding)
                    .fillMaxSize()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                // Picture: big, with a camera badge; a tap offers the picker or removing it.
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Box {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .clickable(enabled = !saving, onClickLabel = "Change picture") { pictureMenu = true },
                        ) {
                            Avatar(url = pictureUrl, name = name.ifBlank { profile.name }, size = 112.dp)
                        }
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .size(36.dp)
                                .background(MaterialTheme.colorScheme.primary, CircleShape)
                                .border(3.dp, MaterialTheme.colorScheme.surface, CircleShape),
                        ) {
                            Icon(AppIcons.camera, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(18.dp))
                        }
                        DropdownMenu(expanded = pictureMenu, onDismissRequest = { pictureMenu = false }) {
                            DropdownMenuItem(
                                text = { Text(if (profile.avatarId == null) "Choose a photo" else "Choose another photo") },
                                onClick = {
                                    pictureMenu = false
                                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                },
                            )
                            if (profile.avatarId != null) {
                                DropdownMenuItem(text = { Text("Remove picture") }, onClick = {
                                    pictureMenu = false
                                    onRemovePicture()
                                })
                            }
                        }
                    }
                    Text(
                        "Tap to change. A new picture saves straight away.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                EditSection("About you") {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it.take(MAX_NAME) },
                        label = { Text("Name") },
                        singleLine = true,
                        supportingText = {
                            Text(
                                if (name.isBlank()) "Left empty, people see your username (${profile.username ?: "your login name"})."
                                else "What everyone sees, in rooms and on your profile. ${name.length}/$MAX_NAME",
                            )
                        },
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = bio,
                        onValueChange = { bio = it.take(MAX_BIO) },
                        label = { Text("Bio") },
                        placeholder = { Text("A line about you or what you're into") },
                        supportingText = { Text("${bio.length}/$MAX_BIO") },
                        minLines = 3,
                        maxLines = 6,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                EditSection("Pinned on your profile") {
                    PinRow(
                        label = "Favourite song",
                        title = track?.title,
                        subtitle = track?.artist,
                        lead = { CoverImage(url = track?.let(coverUrl), contentDescription = null, modifier = Modifier.size(48.dp)) },
                        onPick = { picking = PinKind.SONG },
                        onClear = { track = null },
                    )
                    PinRow(
                        label = "Favourite artist",
                        title = artist?.name,
                        subtitle = null,
                        lead = { Avatar(url = null, name = artist?.name ?: "?", size = 48.dp) },
                        onPick = { picking = PinKind.ARTIST },
                        onClear = { artist = null },
                    )
                }
            }
        }
    }

    picking?.let { kind ->
        PinPickerPage(
            kind = kind,
            suggestedSongs = suggestedSongs,
            suggestedArtists = suggestedArtists,
            coverUrl = coverUrl,
            search = search,
            onSong = { track = it; picking = null },
            onArtist = { artist = it; picking = null },
            onDismiss = { picking = null },
        )
    }

    if (confirmingDiscard) {
        AlertDialog(
            onDismissRequest = { confirmingDiscard = false },
            title = { Text("Discard changes?") },
            text = { Text("Your edits to this page won't be saved.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDiscard = false
                    onDismiss()
                }) { Text("Discard") }
            },
            dismissButton = { TextButton(onClick = { confirmingDiscard = false }) { Text("Keep editing") } },
        )
    }
}

@Composable
private fun EditSection(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
        content()
    }
}

/** One pin: what's pinned (or "Nothing pinned"), with Change and, when set, Remove. */
@Composable
private fun PinRow(
    label: String,
    title: String?,
    subtitle: String?,
    lead: @Composable () -> Unit,
    onPick: () -> Unit,
    onClear: () -> Unit,
) {
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().clip(MaterialTheme.cardShape).clickable(onClickLabel = "Change $label", onClick = onPick),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(12.dp)) {
            lead()
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(title ?: "Nothing pinned. Tap to pick.", style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                subtitle?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (title != null) {
                IconButton(onClick = onClear) { Icon(AppIcons.clear, contentDescription = "Remove $label") }
            }
        }
    }
}

private enum class PinKind { SONG, ARTIST }

/**
 * Picks a pin: your suggestions first, then as you type, songs or artists from the whole library (the server's
 * search, a moment after typing stops).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PinPickerPage(
    kind: PinKind,
    suggestedSongs: List<TrackSummaryDto>,
    suggestedArtists: List<PinnedArtist>,
    coverUrl: (TrackSummaryDto) -> String?,
    search: suspend (String) -> Result<SearchResultsDto>,
    onSong: (TrackSummaryDto) -> Unit,
    onArtist: (PinnedArtist) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<SearchResultsDto?>(null) }
    var failed by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    LaunchedEffect(query) {
        failed = false
        if (query.isBlank()) {
            results = null
            return@LaunchedEffect
        }
        delay(300)
        search(query.trim()).fold(onSuccess = { results = it }, onFailure = { failed = true })
    }
    val songs = if (query.isBlank()) suggestedSongs else results?.tracks.orEmpty()
    val artists = if (query.isBlank()) suggestedArtists else results?.artists.orEmpty().map { PinnedArtist(it.id, it.name) }
    val what = if (kind == PinKind.SONG) "song" else "artist"

    FullScreenDialog(onDismissRequest = onDismiss) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        TextField(
                            value = query,
                            onValueChange = { query = it },
                            placeholder = { Text("Search for a $what") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent,
                                focusedIndicatorColor = Color.Transparent,
                                unfocusedIndicatorColor = Color.Transparent,
                            ),
                            modifier = Modifier.fillMaxWidth().focusRequester(focus),
                        )
                    },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(AppIcons.back, contentDescription = "Back") } },
                )
            },
        ) { padding ->
            LazyColumn(Modifier.padding(padding).consumeWindowInsets(padding).fillMaxSize().imePadding()) {
                item {
                    Text(
                        when {
                            failed -> "Couldn't search. Check the connection and try again."
                            query.isBlank() -> if (kind == PinKind.SONG) "Your top and liked songs. Type to search everything." else "Your top artists. Type to search everything."
                            results == null -> "Searching…"
                            (kind == PinKind.SONG && songs.isEmpty()) || (kind == PinKind.ARTIST && artists.isEmpty()) -> "No ${what}s match."
                            else -> "From your library"
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                if (kind == PinKind.SONG) {
                    items(songs, key = { it.id }) { song ->
                        ListItem(
                            leadingContent = { CoverImage(url = coverUrl(song), contentDescription = null, modifier = Modifier.size(44.dp)) },
                            headlineContent = { Text(song.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            supportingContent = { Text(song.artist ?: "Unknown artist", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            modifier = Modifier.clickable(onClickLabel = "Pin this song") { onSong(song) },
                        )
                    }
                } else {
                    items(artists, key = { it.id }) { a ->
                        ListItem(
                            leadingContent = { Avatar(url = null, name = a.name, size = 44.dp) },
                            headlineContent = { Text(a.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            modifier = Modifier.clickable(onClickLabel = "Pin this artist") { onArtist(a) },
                        )
                    }
                }
            }
        }
    }
}

/** The profile's numbers in the shape Home's listening cards read. No window before to compare, so no delta line. */
private fun ProfileDto.asListeningStats() = UserStatsDto(
    range = range,
    since = null,
    memberSince = memberSince,
    totals = totals,
    previousTotals = null,
    topTracks = topTracks,
    topArtists = topArtists,
    topAlbums = emptyList(),
    counts = ProfileCountsDto(liked = liked.total, lessOften = disliked.total, playlists = playlists.size),
)

/** The upload limits (S7) in words; anything else as usual. */
private fun Throwable.pictureMessage(): String = when ((this as? ConnectionException)?.error) {
    ConnectionError.Unknown("HTTP 429") -> "Too many picture changes. Try again in a few minutes."
    ConnectionError.Unknown("HTTP 503") -> "The server is busy with other pictures. Try again in a moment."
    ConnectionError.Unknown("HTTP 400") -> "The server couldn't read that picture."
    else -> loadMessage()
}
