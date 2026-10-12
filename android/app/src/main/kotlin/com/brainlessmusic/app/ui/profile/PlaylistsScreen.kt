package com.brainlessmusic.app.ui.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.data.remote.dto.PlaylistSummaryDto
import com.brainlessmusic.app.data.remote.dto.TrackSummaryDto
import com.brainlessmusic.app.data.repository.LibraryRepository
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.queueItem
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.GearFx
import com.brainlessmusic.app.ui.common.GearInk
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.Notices
import com.brainlessmusic.app.ui.common.RingSky
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.downloads.CoverMosaic
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.theme.cardShape
import com.brainlessmusic.app.ui.theme.coverShape
import com.brainlessmusic.app.ui.theme.laneCut
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** A song list's size and the covers for its picture. */
data class ListSummary(val total: Int, val covers: List<String?>)

/** What the Playlists tab shows: your liked and disliked songs, then your playlists with their covers. */
data class PlaylistsHome(
    val liked: ListSummary,
    val disliked: ListSummary,
    val playlists: List<PlaylistSummaryDto>,
)

@HiltViewModel
class PlaylistsViewModel @Inject constructor(
    private val profile: ProfileRepository,
    private val library: LibraryRepository,
    private val playback: PlaybackController,
) : ViewModel() {

    val isGuest: Boolean get() = profile.isGuest

    private val _state = MutableStateFlow<LoadState<PlaylistsHome>>(LoadState.Loading)
    val state: StateFlow<LoadState<PlaylistsHome>> = _state.asStateFlow()

    /**
     * Reloaded each time the tab shows, so a playlist renamed or emptied on its page, or a song liked in the player, is
     * current here. The playlists decide whether it loaded; the two song lists fall back to empty.
     */
    fun load() {
        viewModelScope.launch {
            if (_state.value !is LoadState.Content) _state.value = LoadState.Loading
            coroutineScope {
                val liked = async { profile.likedPage(0, SUMMARY_PAGE).map { summary(it.total, it.favorites) } }
                val disliked = async { profile.lessOftenPage(0, SUMMARY_PAGE).map { summary(it.total, it.tracks) } }
                val playlists = async { profile.playlists() }
                playlists.await().fold(
                    onSuccess = {
                        _state.value = LoadState.Content(
                            PlaylistsHome(
                                liked = liked.await().getOrDefault(ListSummary(0, emptyList())),
                                disliked = disliked.await().getOrDefault(ListSummary(0, emptyList())),
                                playlists = it,
                            ),
                        )
                    },
                    onFailure = { if (_state.value !is LoadState.Content) _state.value = LoadState.Error(it.loadMessage()) },
                )
            }
        }
    }

    /** Up to four different albums' covers, newest first, so a list of one album doesn't show it four times. */
    private fun summary(total: Int, tracks: List<TrackSummaryDto>) = ListSummary(
        total,
        tracks.distinctBy { it.albumId ?: -it.id }.take(4).map { t ->
            t.albumId?.let(library::albumCoverUrl) ?: library.trackCoverUrl(t.id)
        },
    )

    fun covers(playlist: PlaylistSummaryDto): List<String?> = playlist.coverAlbumIds.orEmpty().map(library::albumCoverUrl)

    /** The Liked card's Play and Shuffle: every liked song (up to the server's page), newest first. */
    fun playLiked(shuffle: Boolean) {
        viewModelScope.launch {
            profile.likedPage(0, PLAY_PAGE).onSuccess { page ->
                val items = page.favorites.filter { !it.missing }.map(library::queueItem)
                if (items.isEmpty()) return@onSuccess
                playback.playQueue(items, if (shuffle) items.indices.random() else 0, shuffle = shuffle)
            }.onFailure { Notices.show("Couldn't load your liked songs. Try again.") }
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

    private companion object {
        const val SUMMARY_PAGE = 24
        const val PLAY_PAGE = 200
    }
}

/**
 * The Library's Playlists tab (A134, A137, A152): Liked songs as a card in the skin's dress, with Play and Shuffle;
 * Disliked songs under it (A153); then your playlists as a grid of cover mosaics, New playlist first. Reloaded each
 * time it shows. Guests keep neither likes nor playlists (A37), so they get a card saying so.
 */
@Composable
fun PlaylistsTab(
    topInset: Dp,
    onOpenLiked: () -> Unit,
    onOpenDisliked: () -> Unit,
    onOpenPlaylist: (Int) -> Unit,
    viewModel: PlaylistsViewModel = hiltViewModel(),
) {
    if (viewModel.isGuest) {
        GuestPlaylists(Modifier.padding(top = topInset))
        return
    }
    val state by viewModel.state.collectAsStateWithLifecycle()
    var naming by remember { mutableStateOf(false) }
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(Unit) { viewModel.load() }

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
                    onFailed = { Notices.show(it) },
                )
            },
            onDismiss = { naming = false },
        )
    }

    LoadStateContent(
        state = state,
        onRetry = viewModel::load,
        loadingLabel = "Loading playlists",
        // The grid scrolls under the Library's floating header, so the inset is padding inside it, not around it.
        skeleton = { SkeletonListRows(contentPadding = PaddingValues(top = topInset)) },
    ) { home ->
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = topInset + 8.dp, bottom = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(key = "liked", span = { GridItemSpan(maxLineSpan) }) {
                LikedCard(home.liked, onOpen = onOpenLiked, onPlay = { viewModel.playLiked(shuffle = false) }, onShuffle = { viewModel.playLiked(shuffle = true) })
            }
            item(key = "disliked", span = { GridItemSpan(maxLineSpan) }) {
                DislikedRow(home.disliked, onOpen = onOpenDisliked)
            }
            item(key = "heading", span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    "Your playlists",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 8.dp, start = 4.dp).semantics { heading() },
                )
            }
            item(key = "new") { NewPlaylistTile(onClick = { naming = true }) }
            items(home.playlists, key = { it.id }) { playlist ->
                PlaylistTile(playlist, viewModel.covers(playlist), onClick = { onOpenPlaylist(playlist.id) })
            }
            if (home.playlists.isEmpty()) {
                item(key = "hint", span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        "No playlists yet. Make one with New playlist, or hold any song and pick Add to playlist.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 4.dp),
                    )
                }
            }
        }
    }
}

/**
 * Liked songs, the tab's lead: the latest covers, the count, Play and Shuffle, under a label in the skin's game. Hit
 * circle files it as an osu! collection, Lane as an Arcaea pack, Gear as SOUND VOLTEX's FAVORITE folder, Ring as
 * maimai's My list plate. Standard has no label.
 */
@Composable
private fun LikedCard(liked: ListSummary, onOpen: () -> Unit, onPlay: () -> Unit, onShuffle: () -> Unit) {
    val skin = LocalSkin.current
    Surface(
        onClick = onOpen,
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) {
            SkinLabel(skin)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(104.dp)) {
                    if (liked.covers.isEmpty()) {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier.fillMaxSize().clip(coverShape(14.dp)).background(MaterialTheme.colorScheme.primaryContainer),
                        ) {
                            FeelingHeart(Feeling.LIKED, tint = MaterialTheme.colorScheme.onPrimaryContainer, size = 40.dp)
                        }
                    } else {
                        CoverMosaic(liked.covers, Modifier.fillMaxSize())
                    }
                }
                Column(Modifier.padding(start = 16.dp).weight(1f)) {
                    Text("Liked songs", style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        if (liked.total == 1) "1 song" else "${liked.total} songs",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (liked.total == 0) {
                        Text(
                            "Tap the heart in the player to keep a song here.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
            if (liked.total > 0) {
                Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onPlay, modifier = Modifier.weight(1f)) {
                        Icon(AppIcons.play, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Play")
                    }
                    OutlinedButton(onClick = onShuffle, modifier = Modifier.weight(1f)) {
                        Icon(AppIcons.shuffle, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Shuffle")
                    }
                }
            }
        }
    }
}

/** The small label over the Liked card, in the skin's game; nothing for Standard. */
@Composable
private fun SkinLabel(skin: Skin) {
    val scheme = MaterialTheme.colorScheme
    val (text, shape, background, ink) = when (skin) {
        Skin.STANDARD -> return
        Skin.HIT_CIRCLE -> LabelStyle("COLLECTION", RoundedCornerShape(50), scheme.primary, scheme.onPrimary)
        Skin.LANE -> LabelStyle("PACK", laneCut(8.dp), scheme.primary, scheme.onPrimary)
        Skin.GEAR -> LabelStyle("FAVORITE", CutCornerShape(topStart = 8.dp, bottomEnd = 8.dp), GearFx, GearInk)
        Skin.RING -> LabelStyle("MY LIST", RoundedCornerShape(50), RingSky, Color.White)
    }
    Text(
        text,
        color = ink,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.5.sp,
        modifier = Modifier
            .padding(bottom = 10.dp)
            .clip(shape)
            .background(background)
            .padding(horizontal = 10.dp, vertical = 3.dp),
    )
}

private data class LabelStyle(val text: String, val shape: androidx.compose.ui.graphics.Shape, val background: Color, val ink: Color)

/** Disliked songs (A153): a slimmer row under Liked, the cracked heart for its picture. */
@Composable
private fun DislikedRow(disliked: ListSummary, onOpen: () -> Unit) {
    Surface(
        onClick = onOpen,
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(44.dp).clip(coverShape(10.dp)).background(MaterialTheme.colorScheme.surfaceContainerHighest),
            ) {
                FeelingHeart(Feeling.DISLIKED, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(Modifier.padding(start = 14.dp).weight(1f)) {
                Text("Disliked songs", style = MaterialTheme.typography.titleSmall)
                Text(
                    when (disliked.total) {
                        0 -> "None. Hold the heart in the player to dislike a song."
                        1 -> "1 song · shuffle picks it less"
                        else -> "${disliked.total} songs · shuffle picks them less"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(AppIcons.arrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun NewPlaylistTile(onClick: () -> Unit) {
    Column(Modifier.clip(coverShape(14.dp)).clickable(onClickLabel = "New playlist", onClick = onClick)) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(coverShape(14.dp))
                .border(1.5.dp, MaterialTheme.colorScheme.outline, coverShape(14.dp)),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(48.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
            ) {
                Icon(AppIcons.add, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
        Text("New playlist", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
        Text(" ", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun PlaylistTile(playlist: PlaylistSummaryDto, covers: List<String?>, onClick: () -> Unit) {
    Column(Modifier.clickable(onClickLabel = "Open playlist", onClick = onClick)) {
        if (covers.isEmpty()) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(coverShape(14.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
            ) {
                Icon(AppIcons.queue, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(36.dp))
            }
        } else {
            CoverMosaic(covers, Modifier.fillMaxWidth().aspectRatio(1f))
        }
        Text(
            playlist.name,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            if (playlist.trackCount == 1) "1 song" else "${playlist.trackCount} songs",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** A guest's tab: why there's nothing here, in a card rather than a bare line. */
@Composable
private fun GuestPlaylists(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.TopCenter) {
        Surface(
            shape = MaterialTheme.cardShape,
            color = MaterialTheme.colorScheme.surfaceContainer,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                FeelingHeart(Feeling.LIKED, tint = MaterialTheme.colorScheme.primary, size = 40.dp)
                Text(
                    "Likes and playlists are for accounts",
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 12.dp),
                )
                Text(
                    "As a guest you can play everything, but nothing is kept. Ask whoever runs the server for an account.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 6.dp),
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
