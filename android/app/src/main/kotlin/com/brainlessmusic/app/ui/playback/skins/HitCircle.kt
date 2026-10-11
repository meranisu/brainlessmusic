package com.brainlessmusic.app.ui.playback.skins

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.data.remote.dto.TrackStatDto
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.Repeat
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.playback.SeekCanvas
import com.brainlessmusic.app.ui.playback.repeatIcon
import com.brainlessmusic.app.ui.playback.repeatLabel
import com.brainlessmusic.app.ui.playback.shuffleIcon
import com.brainlessmusic.app.ui.playback.shuffleLabel
import com.brainlessmusic.app.ui.theme.BrandFontFamily
import com.brainlessmusic.app.ui.theme.AppIcons

/** osu!'s grade letters for a [Clear]: a long unbroken run earns the silver SS. */
private fun grade(clear: Clear, plays: Int): String = when (clear) {
    Clear.NEW -> "–"
    Clear.FAILED -> "D"
    Clear.CLEAR -> "A"
    Clear.FULL_COMBO -> if (plays >= 10) "SS" else "S"
}

private fun lamp(clear: Clear): String = when (clear) {
    Clear.NEW -> "New"
    Clear.FAILED -> "Failed"
    Clear.CLEAR -> "Clear"
    Clear.FULL_COMBO -> "Full combo"
}

/**
 * The Hit circle skin, after osu! (A114): the cover as a hit circle, your grade for the song, a slider for seeking, and
 * the buttons as numbered hit circles with an approach ring closing on play. [coverGestures] carries the cover's swipe
 * to skip and hold for the menu; [coverLayer] its slide while skipping.
 */
@Composable
fun ColumnScope.HitCircleDeck(
    state: PlaybackUiState,
    item: QueueItem,
    fraction: Float,
    shownMs: Float,
    record: TrackStatDto?,
    coverGestures: Modifier,
    coverLayer: Modifier,
    onFraction: (Float) -> Unit,
    onFinished: () -> Unit,
    onShuffle: () -> Unit,
    onPrevious: () -> Unit,
    onPlayPause: () -> Unit,
    onNext: () -> Unit,
    onRepeat: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme

    Box(
        modifier = Modifier.weight(1f).fillMaxWidth().then(coverGestures),
        contentAlignment = Alignment.Center,
    ) {
        // White rim, then a gap, then the accent ring: a hit circle at rest.
        Box(
            modifier = Modifier
                .padding(8.dp)
                .aspectRatio(1f)
                .then(coverLayer)
                .border(4.dp, scheme.primary, CircleShape)
                .padding(8.dp)
                .border(6.dp, scheme.onSurface, CircleShape)
                .padding(5.dp)
                .clip(CircleShape),
        ) {
            CoverImage(url = item.coverUrl, contentDescription = item.album, cornerRadius = 0.dp, modifier = Modifier.fillMaxSize())
        }
    }

    Text(
        item.title,
        style = MaterialTheme.typography.headlineSmall,
        fontFamily = BrandFontFamily,
        fontWeight = FontWeight.SemiBold,
        textAlign = TextAlign.Center,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
    )
    Text(
        item.artist ?: "Unknown artist",
        style = MaterialTheme.typography.bodyMedium,
        color = scheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.fillMaxWidth(),
    )

    if (record != null) {
        val clear = clearFor(record.plays, record.skips)
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                grade(clear, record.plays),
                fontFamily = BrandFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 30.sp,
                color = scheme.primary,
            )
            Text(recordLine(record.plays, record.msListened), style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
            Text(lamp(clear).uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
    }

    // The slider: an outlined track, the played part filled, the ball with its follow circle at the edge.
    SeekCanvas(
        fraction = fraction,
        onFraction = onFraction,
        onFinished = onFinished,
        enabled = state.durationMs > 0,
        height = 44.dp,
        modifier = Modifier.padding(top = 8.dp),
    ) { x ->
        val h = 22.dp.toPx()
        val top = (size.height - h) / 2
        val r = CornerRadius(h / 2)
        val cy = size.height / 2
        val ballX = x.coerceIn(h / 2, size.width - h / 2)
        drawRoundRect(scheme.surfaceContainerHigh, Offset(0f, top), Size(size.width, h), r)
        drawRoundRect(scheme.primary, Offset(0f, top), Size(ballX, h), r)
        drawRoundRect(scheme.onSurface, Offset(0f, top), Size(size.width, h), r, style = Stroke(3.dp.toPx()))
        drawCircle(scheme.secondary, radius = 19.dp.toPx(), center = Offset(ballX, cy), style = Stroke(2.dp.toPx()))
        drawCircle(scheme.onSurface, radius = 11.dp.toPx(), center = Offset(ballX, cy))
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(formatDuration(shownMs / 1000.0), style = MaterialTheme.typography.bodySmall)
        Text(formatDuration(state.durationMs / 1000.0), style = MaterialTheme.typography.bodySmall)
    }

    // A room plays its queue once, in order, for everyone: shuffle and repeat are off there.
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        HitButton(shuffleIcon(state.shuffleMode), shuffleLabel(state.shuffleMode), number = 1, lit = state.shuffle, enabled = !state.inRoom, onClick = onShuffle)
        HitButton(AppIcons.previous, "Previous", number = 2, enabled = state.hasPrevious || state.positionMs > 3_000, onClick = onPrevious)
        PlayCircle(state, onPlayPause)
        HitButton(AppIcons.next, "Next", number = 3, enabled = state.hasNext, onClick = onNext)
        HitButton(repeatIcon(state.repeat), repeatLabel(state.repeat), number = 4, lit = state.repeat != Repeat.OFF, enabled = !state.inRoom, onClick = onRepeat)
    }
}

/** A small hit circle with its combo number, the way osu! numbers the circles in a run. */
@Composable
private fun HitButton(
    icon: ImageVector,
    label: String,
    number: Int,
    onClick: () -> Unit,
    lit: Boolean = false,
    enabled: Boolean = true,
    size: Dp = 46.dp,
) {
    val scheme = MaterialTheme.colorScheme
    Box(Modifier.alpha(if (enabled) 1f else 0.38f)) {
        Surface(
            onClick = onClick,
            enabled = enabled,
            shape = CircleShape,
            // On (shuffle, repeat) fills the circle in the accent, like the play circle; off stays hollow-dark.
            color = if (lit) scheme.primary else scheme.surfaceContainerHigh,
            contentColor = if (lit) scheme.onPrimary else scheme.onSurface,
            modifier = Modifier.size(size).border(3.dp, scheme.onSurface, CircleShape),
        ) {
            Box(contentAlignment = Alignment.Center) { Icon(icon, contentDescription = label, modifier = Modifier.size(22.dp)) }
        }
        Text(
            number.toString(),
            fontFamily = BrandFontFamily,
            fontWeight = FontWeight.Bold,
            fontSize = 12.sp,
            color = scheme.secondary,
            modifier = Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = (-8).dp),
        )
    }
}

/** Play as the big hit circle; while playing, its approach ring keeps closing in on it. */
@Composable
private fun PlayCircle(state: PlaybackUiState, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val approach = if (state.isPlaying && rememberAnimationsOn()) {
        rememberInfiniteTransition(label = "approach").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(1100, easing = LinearEasing)),
            label = "approach",
        ).value
    } else {
        1f
    }
    Box(Modifier.size(84.dp), contentAlignment = Alignment.Center) {
        if (state.isPlaying) {
            Box(
                Modifier
                    .size(72.dp)
                    .graphicsLayer {
                        val s = 1.75f - 0.75f * approach
                        scaleX = s
                        scaleY = s
                        alpha = 0.2f + 0.8f * approach
                    }
                    .border(3.dp, scheme.primary, CircleShape),
            )
        }
        Surface(
            onClick = onClick,
            shape = CircleShape,
            color = scheme.primary,
            contentColor = scheme.onPrimary,
            modifier = Modifier.size(72.dp).border(4.dp, scheme.onSurface, CircleShape),
        ) {
            Box(contentAlignment = Alignment.Center) {
                if (state.isBuffering && !state.isPlaying) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp), color = scheme.onPrimary, strokeWidth = 3.dp)
                } else {
                    Icon(
                        if (state.isPlaying) AppIcons.pause else AppIcons.play,
                        contentDescription = if (state.isPlaying) "Pause" else "Play",
                        modifier = Modifier.size(36.dp),
                    )
                }
            }
        }
    }
}
