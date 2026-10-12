package com.brainlessmusic.app.ui.albums

import com.brainlessmusic.app.ui.common.Notices
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.remote.dto.AlbumDetailDto
import com.brainlessmusic.app.data.remote.dto.AlbumTrackDto
import com.brainlessmusic.app.ui.downloads.DownloadButton
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonAlbumHeader
import com.brainlessmusic.app.ui.common.SkeletonLead
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.profile.SongActionsViewModel
import com.brainlessmusic.app.ui.profile.SongMenuSheet
import com.brainlessmusic.app.ui.common.PlayingMarker
import com.brainlessmusic.app.ui.common.markPlaying
import com.brainlessmusic.app.ui.theme.AppIcons

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlbumDetailScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    onOpenArtist: (Int) -> Unit,
    viewModel: AlbumDetailViewModel = hiltViewModel(),
    songActions: SongActionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var menuFor by remember { mutableStateOf<Pair<AlbumDetailDto, AlbumTrackDto>?>(null) }
    menuFor?.let { (album, track) ->
        SongMenuSheet(item = viewModel.queueItem(album, track), onDismiss = { menuFor = null }, onOpenArtist = onOpenArtist, viewModel = songActions)
    }
    val playback by viewModel.playback.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    val download by viewModel.download.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val title = when (val s = state) {
        is LoadState.Content -> s.data.title
        else -> "Album"
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(AppIcons.back, contentDescription = "Back")
                    }
                },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { it.tracks.isEmpty() },
            emptyMessage = "This album has no tracks.",
            loadingLabel = "Loading album",
            skeleton = {
                SkeletonListRows(lead = SkeletonLead.NUMBER, trailing = true, header = { SkeletonAlbumHeader() })
            },
        ) { album: AlbumDetailDto ->
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = { viewModel.refresh { Notices.show(it) } },
            ) {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    item { AlbumHeader(album, coverUrl = viewModel.coverUrl(), onOpenArtist = onOpenArtist) }
                    item {
                        PlayShuffleRow(onPlay = { viewModel.playFrom(album, 0) }, onShuffle = { viewModel.shuffle(album) }) {
                            Spacer(Modifier.weight(1f))
                            DownloadButton(
                                state = download,
                                what = "album",
                                onDownload = { viewModel.download(album) { Notices.show(it, long = true) } },
                                onRemove = { viewModel.removeDownload(album) },
                            )
                        }
                    }
                    // Disc headers only when the album really spans discs; untagged songs count as disc 1.
                    val multiDisc = album.tracks.map { it.discNumber ?: 1 }.distinct().size > 1
                    album.tracks.forEachIndexed { index, track ->
                        val disc = track.discNumber ?: 1
                        if (multiDisc && (index == 0 || (album.tracks[index - 1].discNumber ?: 1) != disc)) {
                            item(key = "disc-$disc") { DiscHeader(disc) }
                        }
                        item(key = track.id) {
                        TrackRow(
                            track = track,
                            // Only when it isn't the album's: a compilation or a "feat." song.
                            artist = track.artistName?.takeIf { it != album.artistName },
                            isCurrent = playback.current?.trackId == track.id,
                            onClick = { viewModel.playFrom(album, index) },
                            onMenu = { menuFor = album to track },
                        )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AlbumHeader(album: AlbumDetailDto, coverUrl: String?, onOpenArtist: (Int) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CoverImage(
            url = coverUrl,
            contentDescription = album.title,
            modifier = Modifier.size(88.dp),
        )
        Column(modifier = Modifier.padding(start = 16.dp)) {
            Text(album.title, style = MaterialTheme.typography.headlineSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                album.artistName ?: "Unknown Artist",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = album.artistId?.let { id -> Modifier.clickable(onClickLabel = "Open artist") { onOpenArtist(id) } }
                    ?: Modifier,
            )
            album.year?.let {
                Text(
                    it.toString(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Same buttons as a playlist's: a tapped song turns shuffle off, so this is how to shuffle the album. */
@Composable
internal fun PlayShuffleRow(onPlay: () -> Unit, onShuffle: () -> Unit, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
    ) {
        Button(onClick = onPlay) {
            Icon(AppIcons.play, contentDescription = null)
            Text("Play", modifier = Modifier.padding(start = 6.dp))
        }
        OutlinedButton(onClick = onShuffle) {
            Icon(AppIcons.shuffle, contentDescription = null)
            Text("Shuffle", modifier = Modifier.padding(start = 6.dp))
        }
        trailing()
    }
}

/** "Disc 2" above the first song of each disc, on albums that have more than one. */
@Composable
private fun DiscHeader(disc: Int) {
    Text(
        "Disc $disc",
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp)
            .semantics { heading() },
    )
}

/** Tap plays from here; the ⋮ button or a long press opens the song menu. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TrackRow(
    track: AlbumTrackDto,
    artist: String?,
    isCurrent: Boolean,
    onClick: () -> Unit,
    onMenu: () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    ListItem(
        leadingContent = {
            if (isCurrent && markPlaying) {
                PlayingMarker()
            } else {
                Text(
                    track.trackNumber?.toString() ?: "–",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        headlineContent = {
            Text(
                track.title,
                fontWeight = if (isCurrent) FontWeight.Bold else null,
                color = if (isCurrent) MaterialTheme.colorScheme.primary else Color.Unspecified,
            )
        },
        supportingContent = artist?.let { { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis) } },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(formatDuration(track.duration), style = MaterialTheme.typography.bodySmall)
                IconButton(onClick = onMenu) {
                    Icon(AppIcons.more, contentDescription = "Song options")
                }
            }
        },
        modifier = Modifier.combinedClickable(
            onClick = onClick,
            onLongClickLabel = "Song options",
            onLongClick = {
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                onMenu()
            },
        ),
    )
}
