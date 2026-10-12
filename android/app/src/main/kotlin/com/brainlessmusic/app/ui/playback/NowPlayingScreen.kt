package com.brainlessmusic.app.ui.playback

import com.brainlessmusic.app.ui.common.Notices
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.Repeat
import com.brainlessmusic.app.playback.ShuffleMode
import com.brainlessmusic.app.playback.StreamInfo
import com.brainlessmusic.app.rooms.RoomConnection
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.profile.AddToPlaylistSheet
import com.brainlessmusic.app.ui.profile.LikeButton
import com.brainlessmusic.app.ui.profile.SongActionsViewModel
import com.brainlessmusic.app.ui.profile.SongMenuSheet
import com.brainlessmusic.app.ui.theme.accentInk
import com.brainlessmusic.app.ui.theme.tileShape
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.produceState
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.brainlessmusic.app.data.local.PlayerButtons
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.data.local.SeekStyle
import com.brainlessmusic.app.data.remote.dto.TrackStatDto
import com.brainlessmusic.app.ui.playback.skins.HitCircleDeck
import com.brainlessmusic.app.ui.playback.skins.LaneDeck
import com.brainlessmusic.app.ui.playback.skins.GearDeck
import com.brainlessmusic.app.ui.playback.skins.RingDeck
import com.brainlessmusic.app.ui.theme.AppIcons

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowPlayingScreen(
    onBack: () -> Unit,
    onOpenAlbum: (Int) -> Unit,
    onOpenArtist: (Int) -> Unit,
    onOpenTogether: () -> Unit,
    presence: () -> Float = { 1f },
    viewModel: PlaybackViewModel = hiltViewModel(),
    songActions: SongActionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val seekStyle by viewModel.seekStyle.collectAsStateWithLifecycle()
    val skin by viewModel.skin.collectAsStateWithLifecycle()
    val pills = skin == Skin.STANDARD && viewModel.playerButtons.collectAsStateWithLifecycle().value == PlayerButtons.PILLS
    val dataSaver by viewModel.dataSaver.collectAsStateWithLifecycle()
    val room by viewModel.room.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val current = state.current
    var showQueue by remember { mutableStateOf(false) }
    var addingToPlaylist by remember { mutableStateOf(false) }
    var showMenu by remember { mutableStateOf(false) }
    val haptics = LocalHapticFeedback.current
    // The screen follows a downward drag and closes past 96 dp; the cover follows a sideways one to skip.
    val dismiss = remember { Animatable(0f) }
    val skip = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    // Let go past the line: the player carries on off the bottom instead of the skin's close (A145).
    var swiped by remember { mutableStateOf(false) }
    val screenHeight = with(LocalDensity.current) { LocalConfiguration.current.screenHeightDp.dp.toPx() }

    Scaffold(
        modifier = Modifier
            .playerEntrance(skin, presence, swiped = { swiped })
            .graphicsLayer { translationY = dismiss.value }
            .verticalSwipe(
                down = true,
                distance = 96.dp,
                offset = dismiss,
                onSwipe = {
                    swiped = true
                    scope.launch {
                        dismiss.animateTo(screenHeight, tween(220, easing = LinearOutSlowInEasing))
                        // Back is ignored mid-transition; if the screen is still here, it comes back rather than stay gone.
                        delay(700)
                        swiped = false
                        dismiss.animateTo(0f)
                    }
                    onBack()
                },
            ),
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Now playing")
                        // In a room: which one, or that it's reconnecting while the music carries on.
                        room.room?.let {
                            Text(
                                if (room.connection == RoomConnection.LIVE) "Room ${it.code}" else "Reconnecting…",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.accentInk,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(AppIcons.arrowDown, contentDescription = "Close")
                    }
                },
                // Data saver, lit while on, for everyone, and only while some queued song would stream (A95); like and
                // add to a playlist (A65) hide themselves for guests.
                actions = {
                    IconButton(
                        onClick = onOpenTogether,
                        colors = IconButtonDefaults.iconButtonColors(
                            contentColor = if (room.room != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    ) {
                        Icon(AppIcons.groups, contentDescription = if (room.room != null) "Open the room" else "Listen together")
                    }
                    if (state.queueStreams) IconButton(
                        onClick = {
                            viewModel.setDataSaver(!dataSaver)
                            Notices.show(if (dataSaver) "Data saver off. Next songs stream as the originals." else "Data saver on. Next songs stream smaller.")
                        },
                        colors = IconButtonDefaults.iconButtonColors(
                            contentColor = if (dataSaver) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    ) {
                        Icon(
                            if (dataSaver) AppIcons.dataSaverOn else AppIcons.dataSaverOff,
                            contentDescription = if (dataSaver) "Data saver on" else "Data saver off",
                        )
                    }
                    // Gear likes and adds from its FX keys instead, Ring from its rim buttons.
                    if (current != null && songActions.canEdit && !pills && skin != Skin.GEAR && skin != Skin.RING) {
                        LikeButton(current.trackId, viewModel = songActions)
                        IconButton(onClick = { addingToPlaylist = true }) {
                            Icon(AppIcons.playlistAdd, contentDescription = "Add to playlist")
                        }
                    }
                },
            )
        },
    ) { padding ->
        if (current == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Nothing is playing.", style = MaterialTheme.typography.bodyMedium)
            }
            return@Scaffold
        }

        // Held while dragging so the thumb follows the finger instead of fighting the ticking position.
        var dragFraction by remember { mutableStateOf<Float?>(null) }
        val durationMs = state.durationMs.coerceAtLeast(1)
        val fraction = dragFraction ?: (state.positionMs.toFloat() / durationMs)
        val shownMs = fraction.coerceIn(0f, 1f) * durationMs

        // Fetched only for the Waveform style. A busy server (503) or a blip gets two more tries; offline keeps the
        // stand-in shape.
        val bars by produceState<List<Float>?>(null, current.trackId, seekStyle) {
            value = null
            if (seekStyle != SeekStyle.WAVEFORM) return@produceState
            repeat(3) { attempt ->
                if (attempt > 0) delay(5_000)
                viewModel.waveformBars(current.trackId)?.let {
                    value = it
                    return@produceState
                }
            }
        }

        // Your record for the song, for the skins that show one (A115): fetched as it starts, so it is the record
        // you came in with.
        val record by produceState<TrackStatDto?>(null, current.trackId, skin) {
            value = null
            if (skin.showsRecord) value = songActions.record(current.trackId)
        }

        // Swipe the cover to skip, hold it for the song menu: the same in every skin.
        val coverGestures = Modifier
            .swipeToSkip(
                offset = skip,
                canNext = state.hasNext,
                canPrevious = state.hasPrevious,
                onNext = viewModel::next,
                onPrevious = viewModel::previousTrack,
            )
            .pointerInput(Unit) {
                detectTapGestures(
                    onLongPress = {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        showMenu = true
                    },
                )
            }
            .semantics { onLongClick(label = "Song options") { showMenu = true; true } }
        val coverLayer = Modifier.graphicsLayer {
            translationX = skip.value
            alpha = 1f - (abs(skip.value) / size.width.coerceAtLeast(1f)).coerceIn(0f, 0.6f)
        }
        val seekTo: () -> Unit = {
            dragFraction?.let { viewModel.seekTo((it * durationMs).toLong()) }
            dragFraction = null
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp),
        ) {
            when (skin) {
                Skin.HIT_CIRCLE -> HitCircleDeck(
                    state = state,
                    item = current,
                    fraction = fraction,
                    shownMs = shownMs,
                    record = record,
                    coverGestures = coverGestures,
                    coverLayer = coverLayer,
                    onFraction = { dragFraction = it },
                    onFinished = seekTo,
                    onShuffle = viewModel::cycleShuffle,
                    onPrevious = viewModel::previous,
                    onPlayPause = viewModel::togglePlayPause,
                    onNext = viewModel::next,
                    onRepeat = viewModel::cycleRepeat,
                )
                Skin.LANE -> LaneDeck(
                    state = state,
                    item = current,
                    fraction = fraction,
                    shownMs = shownMs,
                    record = record,
                    coverGestures = coverGestures,
                    coverLayer = coverLayer,
                    onFraction = { dragFraction = it },
                    onFinished = seekTo,
                    onShuffle = viewModel::cycleShuffle,
                    onPrevious = viewModel::previous,
                    onPlayPause = viewModel::togglePlayPause,
                    onNext = viewModel::next,
                    onRepeat = viewModel::cycleRepeat,
                )
                Skin.GEAR -> {
                    val liked by songActions.likedIds.collectAsStateWithLifecycle()
                    GearDeck(
                        state = state,
                        item = current,
                        fraction = fraction,
                        shownMs = shownMs,
                        record = record,
                        liked = current.trackId in liked,
                        canEdit = songActions.canEdit,
                        coverGestures = coverGestures,
                        coverLayer = coverLayer,
                        onFraction = { dragFraction = it },
                        onFinished = seekTo,
                        onShuffle = viewModel::cycleShuffle,
                        onPrevious = viewModel::previous,
                        onPlayPause = viewModel::togglePlayPause,
                        onNext = viewModel::next,
                        onRepeat = viewModel::cycleRepeat,
                        onLike = { songActions.toggleLike(current.trackId) },
                        onAddToPlaylist = { addingToPlaylist = true },
                    )
                }
                Skin.RING -> {
                    val liked by songActions.likedIds.collectAsStateWithLifecycle()
                    RingDeck(
                        state = state,
                        item = current,
                        fraction = fraction,
                        shownMs = shownMs,
                        record = record,
                        liked = current.trackId in liked,
                        canEdit = songActions.canEdit,
                        coverGestures = coverGestures,
                        coverLayer = coverLayer,
                        onFraction = { dragFraction = it },
                        onFinished = seekTo,
                        onShuffle = viewModel::cycleShuffle,
                        onPrevious = viewModel::previous,
                        onPlayPause = viewModel::togglePlayPause,
                        onNext = viewModel::next,
                        onRepeat = viewModel::cycleRepeat,
                        onLike = { songActions.toggleLike(current.trackId) },
                        onAddToPlaylist = { addingToPlaylist = true },
                        onQueue = { showQueue = true },
                    )
                }
                Skin.STANDARD -> {
                    // The cover is the largest square that fits above the controls. Swipe it to skip, hold it for the song menu.
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .then(coverGestures),
                        contentAlignment = Alignment.Center,
                    ) {
                        CoverImage(
                            url = current.coverUrl,
                            contentDescription = current.album,
                            cornerRadius = 20.dp,
                            modifier = Modifier
                                .aspectRatio(1f)
                                .then(coverLayer),
                        )
                    }

                    // Three lines, left-aligned: what it is, who made it, what it came from.
                    Column(modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) {
                        Text(
                            current.title,
                            style = MaterialTheme.typography.headlineMedium,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            current.artist ?: "Unknown artist",
                            style = MaterialTheme.typography.bodyLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            current.album ?: "Unknown album",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    if (pills) {
                        PillRow(
                            state = state,
                            trackId = current.trackId,
                            viewModel = viewModel,
                            songActions = songActions,
                            onAddToPlaylist = { addingToPlaylist = true },
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }

                    SeekBar(
                        style = seekStyle,
                        bars = bars ?: placeholderBars(current.trackId),
                        fraction = fraction,
                        playing = state.isPlaying,
                        enabled = state.durationMs > 0,
                        onFraction = { dragFraction = it },
                        onFinished = seekTo,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(formatDuration(shownMs / 1000.0), style = MaterialTheme.typography.bodySmall)
                        Text(formatDuration(state.durationMs / 1000.0), style = MaterialTheme.typography.bodySmall)
                    }

                    TransportRow(state, viewModel, pills)
                }
            }

            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            // Clear air under the transport, so a thumb reaching for play/pause doesn't land on the readout.
            StreamReadout(state.stream, modifier = Modifier.fillMaxWidth().padding(top = 16.dp))

            // The way into the queue: the card says what is next and how much follows.
            UpNextCard(
                next = state.next,
                remaining = remainingInQueue(state),
                onClick = { showQueue = true },
                modifier = Modifier.padding(top = 8.dp, bottom = 16.dp).navigationBarsPadding(),
            )
        }
    }

    if (addingToPlaylist && current != null) {
        AddToPlaylistSheet(
            trackId = current.trackId,
            trackTitle = current.title,
            onDismiss = { addingToPlaylist = false },
            viewModel = songActions,
        )
    }

    if (showMenu && current != null) {
        SongMenuSheet(
            item = current,
            onDismiss = { showMenu = false },
            onOpenAlbum = onOpenAlbum,
            onOpenArtist = onOpenArtist,
            showPlayNext = false,
            viewModel = songActions,
        )
    }

    if (showQueue) {
        QueueSheet(
            state = state,
            canPlayLessOften = viewModel.canPlayLessOften,
            onSkipTo = viewModel::skipTo,
            onRemove = viewModel::removeFromQueue,
            onPlayLessOften = viewModel::playLessOften,
            onUndo = viewModel::undoRemove,
            onMove = viewModel::moveInQueue,
            onDismiss = { showQueue = false },
        )
    }
}

@Composable
private fun TransportRow(state: PlaybackUiState, viewModel: PlaybackViewModel, pills: Boolean) {
    val canPrevious = state.hasPrevious || state.positionMs > 3_000
    if (pills) {
        // Shuffle and repeat live in the pill row; this row is only the three that move through the music.
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(32.dp, Alignment.CenterHorizontally),
        ) {
            IconButton(onClick = viewModel::previous, enabled = canPrevious) {
                Icon(AppIcons.previous, contentDescription = "Previous", modifier = Modifier.size(32.dp))
            }
            RingPlayButton(state, onClick = viewModel::togglePlayPause)
            IconButton(onClick = viewModel::next, enabled = state.hasNext) {
                Icon(AppIcons.next, contentDescription = "Next", modifier = Modifier.size(32.dp))
            }
        }
        return
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        // Lit while on, and the icon changes per mode, like repeat; the queue sheet names the mode in words.
        // A room plays its queue once, in order, the same for everyone: shuffle and repeat are off there.
        IconButton(
            onClick = viewModel::cycleShuffle,
            enabled = !state.inRoom,
            colors = IconButtonDefaults.iconButtonColors(contentColor = litColor(state.shuffle)),
        ) {
            Icon(shuffleIcon(state.shuffleMode), contentDescription = shuffleLabel(state.shuffleMode))
        }
        IconButton(onClick = viewModel::previous, enabled = canPrevious) {
            Icon(AppIcons.previous, contentDescription = "Previous", modifier = Modifier.size(36.dp))
        }
        FilledIconButton(onClick = viewModel::togglePlayPause, modifier = Modifier.size(72.dp)) {
            if (state.isBuffering && !state.isPlaying) {
                CircularProgressIndicator(
                    modifier = Modifier.size(32.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 3.dp,
                )
            } else {
                Icon(
                    imageVector = if (state.isPlaying) AppIcons.pause else AppIcons.play,
                    contentDescription = if (state.isPlaying) "Pause" else "Play",
                    modifier = Modifier.size(40.dp),
                )
            }
        }
        IconButton(onClick = viewModel::next, enabled = state.hasNext) {
            Icon(AppIcons.next, contentDescription = "Next", modifier = Modifier.size(36.dp))
        }
        IconButton(
            onClick = viewModel::cycleRepeat,
            enabled = !state.inRoom,
            colors = IconButtonDefaults.iconButtonColors(contentColor = litColor(state.repeat != Repeat.OFF)),
        ) {
            Icon(repeatIcon(state.repeat), contentDescription = repeatLabel(state.repeat))
        }
    }
}

/** The Pills style's play button: an accent ring around the icon instead of a filled disc. */
@Composable
private fun RingPlayButton(state: PlaybackUiState, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = Color.Transparent,
        contentColor = MaterialTheme.colorScheme.onSurface,
        border = BorderStroke(3.dp, MaterialTheme.colorScheme.primary),
        modifier = Modifier.size(72.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (state.isBuffering && !state.isPlaying) {
                CircularProgressIndicator(
                    modifier = Modifier.size(28.dp),
                    color = MaterialTheme.colorScheme.primary,
                    strokeWidth = 3.dp,
                )
            } else {
                Icon(
                    imageVector = if (state.isPlaying) AppIcons.pause else AppIcons.play,
                    contentDescription = if (state.isPlaying) "Pause" else "Play",
                    modifier = Modifier.size(36.dp),
                )
            }
        }
    }
}

/**
 * The Pills style's row above the seek bar: like, shuffle, repeat, add to playlist. Like and add hide for guests
 * (A65), and in this style they leave the top bar so they are not shown twice.
 */
@Composable
private fun PillRow(
    state: PlaybackUiState,
    trackId: Int,
    viewModel: PlaybackViewModel,
    songActions: SongActionsViewModel,
    onAddToPlaylist: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val liked by songActions.likedIds.collectAsStateWithLifecycle()
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (songActions.canEdit) {
            val isLiked = trackId in liked
            Pill(
                icon = if (isLiked) AppIcons.favorite else AppIcons.favoriteBorder,
                label = if (isLiked) "Unlike" else "Like",
                lit = isLiked,
                onClick = { songActions.toggleLike(trackId) },
            )
        }
        Pill(
            icon = shuffleIcon(state.shuffleMode),
            label = shuffleLabel(state.shuffleMode),
            lit = state.shuffle,
            enabled = !state.inRoom,
            onClick = viewModel::cycleShuffle,
        )
        Pill(
            icon = repeatIcon(state.repeat),
            label = repeatLabel(state.repeat),
            lit = state.repeat != Repeat.OFF,
            enabled = !state.inRoom,
            onClick = viewModel::cycleRepeat,
        )
        if (songActions.canEdit) {
            Pill(icon = AppIcons.playlistAdd, label = "Add to playlist", lit = false, onClick = onAddToPlaylist)
        }
    }
}

@Composable
private fun RowScope.Pill(icon: ImageVector, label: String, lit: Boolean, onClick: () -> Unit, enabled: Boolean = true) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        contentColor = litColor(lit),
        modifier = Modifier.weight(1f).height(48.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, modifier = Modifier.alpha(if (enabled) 1f else 0.38f))
        }
    }
}

@Composable
private fun litColor(lit: Boolean): Color =
    if (lit) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant

@Composable
internal fun shuffleIcon(mode: ShuffleMode): ImageVector = when (mode) {
    ShuffleMode.OFF, ShuffleMode.SHUFFLE -> AppIcons.shuffle
    ShuffleMode.REDISCOVER -> AppIcons.history
    ShuffleMode.ALBUMS -> AppIcons.album
}

internal fun shuffleLabel(mode: ShuffleMode): String = when (mode) {
    ShuffleMode.OFF -> "Shuffle off"
    ShuffleMode.SHUFFLE -> "Shuffle on"
    ShuffleMode.REDISCOVER -> "Rediscover: songs you have not played in a while first"
    ShuffleMode.ALBUMS -> "Album shuffle: random albums, in track order"
}

@Composable
internal fun repeatIcon(repeat: Repeat): ImageVector = if (repeat == Repeat.ONE) AppIcons.repeatOne else AppIcons.repeat

internal fun repeatLabel(repeat: Repeat): String = when (repeat) {
    Repeat.OFF -> "Repeat off"
    Repeat.ALL -> "Repeating the queue"
    Repeat.ONE -> "Repeating this track"
}

/** Tracks after the current one, in play order (the shuffled order when shuffle is on). */
private fun remainingInQueue(state: PlaybackUiState): Int {
    val order = if (state.shuffle && state.playOrder.size == state.queue.size) state.playOrder else state.queue.indices.toList()
    val position = order.indexOf(state.currentIndex)
    return if (position < 0) 0 else order.size - position - 1
}

/** What plays next, in play order (shuffled when shuffle is on), and how many follow. Tapping opens the queue. */
@Composable
private fun UpNextCard(next: QueueItem?, remaining: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        shape = tileShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClickLabel = "Open queue", onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (next != null) {
                CoverImage(url = next.coverUrl, contentDescription = null, cornerRadius = 8.dp, modifier = Modifier.size(44.dp))
            }
            Column(modifier = Modifier.weight(1f).padding(start = if (next != null) 12.dp else 4.dp)) {
                Text("UP NEXT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.accentInk)
                Text(
                    next?.title ?: "End of the queue",
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                next?.artist?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(start = 8.dp)) {
                Icon(
                    AppIcons.queue,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (remaining > 0) {
                    Text(
                        "$remaining",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics { contentDescription = "$remaining tracks queued" },
                    )
                }
            }
        }
    }
}

/** What is playing, in two short lines: the format, then the stream or "On this phone". Hidden until the player knows anything. */
@Composable
private fun StreamReadout(stream: StreamInfo?, modifier: Modifier = Modifier) {
    val format = stream?.let { info ->
        listOfNotNull(
            if (info.dataSaver) "Data saver" else null,
            info.codec,
            info.sampleRateHz?.let { "%.1f kHz".format(it / 1000.0) },
            info.channels?.let { if (it == 2) "stereo" else if (it == 1) "mono" else "$it ch" },
            info.bitrateKbps?.let { "$it kbps" },
        ).joinToString(" · ")
    }?.takeIf { it.isNotEmpty() }
    val network = stream?.takeUnless { it.onPhone }?.let { info ->
        listOfNotNull(
            "buffered ${formatDuration(info.bufferedAheadMs / 1000.0)} ahead",
            info.networkKbps?.let { "network ~%.1f Mbps".format(it / 1000.0) },
        ).joinToString(" · ")
    }
    val onPhone = stream?.onPhone == true
    if (format == null && network == null && !onPhone) return

    Surface(
        shape = tileShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = modifier,
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            format?.let { Text(it, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            // Buffering and the network say nothing about a song played from its download (A95).
            if (onPhone) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(
                        AppIcons.downloadDone,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(14.dp),
                    )
                    Text("On this phone", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            network?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
