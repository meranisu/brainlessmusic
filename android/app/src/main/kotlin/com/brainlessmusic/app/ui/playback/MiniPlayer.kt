package com.brainlessmusic.app.ui.playback

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.ui.common.MiniCover
import com.brainlessmusic.app.ui.common.floatingBars
import com.brainlessmusic.app.ui.common.MiniPlayButton
import com.brainlessmusic.app.ui.common.MiniProgress
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.raisedEdge
import com.brainlessmusic.app.ui.theme.LocalDarkTheme
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.theme.laneCut
import kotlin.math.abs

/**
 * Above the navigation bar, in its `surfaceContainer` color so the two read as one; Lane floats it as a cut panel. Draws nothing with an empty queue.
 * Alone on a detail screen it extends under the system bar itself ([extendUnderSystemBar]). Swipe the song left or right
 * to skip, up to open the player.
 */
@Composable
fun MiniPlayer(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    extendUnderSystemBar: Boolean = true,
    viewModel: PlaybackViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val swipe = remember { Animatable(0f) }
    val current = state.current ?: return

    val progress = if (state.durationMs > 0) {
        (state.positionMs.toFloat() / state.durationMs).coerceIn(0f, 1f)
    } else {
        0f
    }

    // Floating (Hit circle's pill, Lane's and Gear's cut panels): the system bar's inset and a margin go outside it.
    val pill = floatingBars
    val lane = LocalSkin.current == Skin.LANE
    val gear = LocalSkin.current == Skin.GEAR
    val panel = lane || gear
    val floating = pill || panel
    val scheme = MaterialTheme.colorScheme
    Surface(
        // The panels lift it a shade off the tab bar, as the player's panels sit off the page.
        color = when {
            panel && LocalDarkTheme.current -> MaterialTheme.colorScheme.surfaceContainerHighest
            else -> MaterialTheme.colorScheme.surfaceContainer
        },
        shape = when {
            pill -> RoundedCornerShape(50)
            lane -> laneCut(14.dp)
            gear -> CutCornerShape(10.dp)
            else -> RectangleShape
        },
        border = when {
            pill -> BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
            panel -> BorderStroke(1.dp, raisedEdge())
            else -> null
        },
        modifier = modifier
            .then(if (floating && extendUnderSystemBar) Modifier.windowInsetsPadding(WindowInsets.navigationBars) else Modifier)
            .then(
                when {
                    // The cut panels stand clear of the tab bar's own top edge, so they keep a wider gap below.
                    panel -> Modifier.padding(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 12.dp)
                    floating -> Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                    else -> Modifier
                },
            )
            .fillMaxWidth()
            .swipeToSkip(
                offset = swipe,
                canNext = state.hasNext,
                canPrevious = state.hasPrevious,
                onNext = viewModel::next,
                onPrevious = viewModel::previousTrack,
            )
            .verticalSwipe(down = false, distance = 24.dp, onSwipe = onClick)
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier
                .then(if (extendUnderSystemBar && !floating) Modifier.windowInsetsPadding(WindowInsets.navigationBars) else Modifier)
                // Gear: the panel is the song's gauge, filling left to right in segments like SOUND VOLTEX's effect
                // gauge, its head a lit bar.
                .then(if (gear) Modifier.drawBehind { drawGauge(progress, scheme.primary) } else Modifier),
        ) {
            // In Lane's panel the line sits inside the outline, clear of the cut corner that would hide its start.
            if (!gear) MiniProgress(progress, if (lane) Modifier.padding(start = 18.dp, end = 12.dp, top = 6.dp) else Modifier)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                // The song slides with the finger and fades as it goes; the play button stays put.
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .weight(1f)
                        .graphicsLayer {
                            translationX = swipe.value
                            alpha = 1f - (abs(swipe.value) / size.width.coerceAtLeast(1f)).coerceIn(0f, 0.6f)
                        },
                ) {
                    // Where the player opens from in Hit circle and Ring.
                    Box(Modifier.onGloballyPositioned { PlayerAnchor.cover = it.boundsInRoot().center }) {
                        MiniCover(current.coverUrl, progress)
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 12.dp),
                    ) {
                        Text(
                            current.title,
                            style = if (panel) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
                            color = if (panel) MaterialTheme.colorScheme.onSurface else Color.Unspecified,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            state.error ?: current.artist ?: current.album ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (state.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                MiniPlayButton(playing = state.isPlaying, buffering = state.isBuffering, onClick = viewModel::togglePlayPause)
            }
        }
    }
}

/** Gear's gauge: segments of [color] up to [progress], brighter toward the bottom, and a solid head at the front. */
private fun DrawScope.drawGauge(progress: Float, color: Color) {
    val end = size.width * progress.coerceIn(0f, 1f)
    if (end <= 0f) return
    val segment = 5.dp.toPx()
    val gap = 2.dp.toPx()
    val fill = Brush.verticalGradient(listOf(color.copy(alpha = 0.08f), color.copy(alpha = 0.30f)))
    var x = 0f
    while (x < end) {
        drawRect(fill, Offset(x, 0f), Size(minOf(segment, end - x), size.height))
        x += segment + gap
    }
    val head = 2.dp.toPx()
    drawRect(color, Offset((end - head).coerceAtLeast(0f), 0f), Size(head, size.height))
}
