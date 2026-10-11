package com.brainlessmusic.app.ui.playback.skins

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.draw.drawBehind
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.data.remote.dto.TrackStatDto
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.Repeat
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.Diamond
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.playback.repeatIcon
import com.brainlessmusic.app.ui.playback.repeatLabel
import com.brainlessmusic.app.ui.playback.shuffleIcon
import com.brainlessmusic.app.ui.playback.shuffleLabel
import com.brainlessmusic.app.ui.theme.LocalDarkTheme
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.LaneFontFamily
import com.brainlessmusic.app.ui.theme.SlantShape
import com.brainlessmusic.app.ui.theme.laneCut
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** Arcaea's grades for a [Clear]: an unbroken run of ten or more earns EX+. */
private fun grade(clear: Clear, plays: Int): String = when (clear) {
    Clear.NEW -> "–"
    Clear.FAILED -> "D"
    Clear.CLEAR -> "AA"
    Clear.FULL_COMBO -> if (plays >= 10) "EX+" else "EX"
}

/** Arcaea's clear titles; Pure Memory is a full recall held for ten plays or more. */
private fun title(clear: Clear, plays: Int): String = when (clear) {
    Clear.NEW -> "New track"
    Clear.FAILED -> "Track lost"
    Clear.CLEAR -> "Track complete"
    Clear.FULL_COMBO -> if (plays >= 10) "Pure memory" else "Full recall"
}

/**
 * The Lane skin, after Arcaea (A121): an information pane with the cover, your grade and clear title, then the song as
 * a lane running into the distance. The played part fills it from the bottom up to a judgement line; drag up or down
 * on it to seek. Notes fall toward the line while the song plays. The buttons sit on a floor below, play as a diamond.
 * [coverGestures] (swipe to skip, hold for the menu) are on the pane; [coverLayer] slides the cover while skipping.
 */
@Composable
fun ColumnScope.LaneDeck(
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

    // The information pane, as Arcaea's top-right one: cover, title, artist, time.
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .clip(laneCut(18.dp))
            .background(scheme.surfaceContainerHigh)
            .border(1.dp, scheme.outline, laneCut(18.dp))
            .then(coverGestures)
            .padding(10.dp),
    ) {
        Box(
            Modifier
                .size(84.dp)
                .then(coverLayer)
                .border(1.5.dp, scheme.primary, laneCut(10.dp))
                .padding(3.dp)
                .clip(laneCut(8.dp)),
        ) {
            CoverImage(url = item.coverUrl, contentDescription = item.album, cornerRadius = 0.dp, modifier = Modifier.fillMaxSize())
        }
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(
                item.title,
                style = MaterialTheme.typography.titleLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                item.artist ?: "Unknown artist",
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "${formatDuration(shownMs / 1000.0)} / ${formatDuration(state.durationMs / 1000.0)}",
                style = MaterialTheme.typography.labelMedium,
                color = scheme.primary,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }

    if (record != null) ScoreStrip(record)

    LaneTrack(
        fraction = fraction,
        playing = state.isPlaying,
        enabled = state.durationMs > 0,
        onFraction = onFraction,
        onFinished = onFinished,
        combo = state.chain,
        modifier = Modifier.weight(1f).padding(top = 10.dp),
    )

    // The floor: Arcaea's lower half, where the buttons sit, a shade apart from the sky above (owner, 2026-10-11). The
    // band runs past the screen's side padding to both edges and on down to the bottom, under an edge line. A room
    // plays once, in order: shuffle and repeat off.
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .drawBehind {
                val bleed = 24.dp.toPx()
                drawRect(scheme.surfaceContainer, Offset(-bleed, 0f), Size(size.width + 2 * bleed, size.height + 4_000f))
                drawLine(scheme.outline, Offset(-bleed, 0f), Offset(size.width + bleed, 0f), 1.dp.toPx())
            }
            .padding(top = 14.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        LaneButton(shuffleIcon(state.shuffleMode), shuffleLabel(state.shuffleMode), lit = state.shuffle, enabled = !state.inRoom, onClick = onShuffle)
        LaneButton(AppIcons.previous, "Previous", enabled = state.hasPrevious || state.positionMs > 3_000, onClick = onPrevious)
        PlayDiamond(state, onPlayPause)
        LaneButton(AppIcons.next, "Next", enabled = state.hasNext, onClick = onNext)
        LaneButton(repeatIcon(state.repeat), repeatLabel(state.repeat), lit = state.repeat != Repeat.OFF, enabled = !state.inRoom, onClick = onRepeat)
    }
}

/** Your grade, clear title and numbers on a slanted band, as Arcaea's result banner. */
@Composable
private fun ScoreStrip(record: TrackStatDto) {
    val scheme = MaterialTheme.colorScheme
    val clear = clearFor(record.plays, record.skips)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .clip(SlantShape(14.dp))
            // A shade up from the page in the dark; in the light the highest container is the page's own blue, so
            // the band takes the card white, and the outline shows its slant either way.
            .background(if (LocalDarkTheme.current) scheme.surfaceContainerHighest else scheme.surfaceContainerHigh)
            .border(1.dp, scheme.outline, SlantShape(14.dp))
            .padding(horizontal = 22.dp, vertical = 6.dp),
    ) {
        // Arcaea prints its grades as two offset outlines; here the accent with the secondary behind it.
        Box {
            val g = grade(clear, record.plays)
            Text(g, fontFamily = LaneFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, color = scheme.secondary, modifier = Modifier.padding(start = 2.dp, top = 2.dp))
            Text(g, fontFamily = LaneFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, color = scheme.primary)
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.weight(1f),
        ) {
            Diamond(6.dp, scheme.primary)
            Text(
                title(clear, record.plays).uppercase(),
                style = MaterialTheme.typography.labelLarge,
                letterSpacing = 1.5.sp,
                modifier = Modifier.padding(horizontal = 8.dp),
            )
            Diamond(6.dp, scheme.primary)
        }
        Text(recordLine(record.plays, record.msListened), style = MaterialTheme.typography.labelSmall, color = scheme.onSurfaceVariant)
    }
}

/**
 * The song as Arcaea's track, four lanes narrowing into the distance. The played part fills from the bottom to a
 * judgement line at [fraction]; a tap or vertical drag seeks. While [playing], notes fall toward the line. [combo]
 * (songs played through in a row) stands in the far part of the track, as Arcaea sets its combo.
 */
@Composable
private fun LaneTrack(
    fraction: Float,
    playing: Boolean,
    enabled: Boolean,
    onFraction: (Float) -> Unit,
    onFinished: () -> Unit,
    combo: Int,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    var heightPx by remember { mutableIntStateOf(1) }
    val f = fraction.coerceIn(0f, 1f)
    val latestOnFraction by rememberUpdatedState(onFraction)
    val latestOnFinished by rememberUpdatedState(onFinished)
    // Top of the lane is the end of the song.
    fun at(y: Float) = (1f - y / heightPx).coerceIn(0f, 1f)

    val phase = if (playing && rememberAnimationsOn()) {
        rememberInfiniteTransition(label = "notes").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing)),
            label = "notes",
        ).value
    } else {
        0.3f
    }

    val touch = if (enabled) {
        Modifier
            .pointerInput(Unit) {
                detectTapGestures { offset ->
                    latestOnFraction(at(offset.y))
                    latestOnFinished()
                }
            }
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { latestOnFraction(at(it.y)) },
                    onDragEnd = { latestOnFinished() },
                    onDragCancel = { latestOnFinished() },
                ) { change, _ -> latestOnFraction(at(change.position.y)) }
            }
    } else {
        Modifier
    }

    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Canvas(
            Modifier
                .fillMaxSize()
                .onSizeChanged { heightPx = it.height.coerceAtLeast(1) }
                .then(touch)
                .semantics {
                    contentDescription = "Song position"
                    progressBarRangeInfo = ProgressBarRangeInfo(f, 0f..1f)
                    if (enabled) {
                        setProgress { target ->
                            onFraction(target.coerceIn(0f, 1f))
                            onFinished()
                            true
                        }
                    }
                },
        ) {
            drawLane(f, phase, floor = scheme.inverseSurface, ink = scheme.inverseOnSurface, accent = scheme.primary, arc = scheme.secondary)
        }
        if (combo > 0) LaneCombo(combo, Modifier.padding(top = 36.dp))
    }
}

private fun DrawScope.drawLane(f: Float, phase: Float, floor: Color, ink: Color, accent: Color, arc: Color) {
    val w = size.width
    val h = size.height
    val topW = w * 0.24f
    fun width(y: Float) = topW + (w - topW) * (y / h)
    fun left(y: Float) = (w - width(y)) / 2
    fun x(y: Float, across: Float) = left(y) + width(y) * across

    val lane = Path().apply {
        moveTo(left(0f), 0f)
        lineTo(left(0f) + topW, 0f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(lane, floor.copy(alpha = 0.94f))

    // What has played: the lane below the judgement line, tinted.
    val lineY = h * (1f - f)
    drawPath(
        Path().apply {
            moveTo(left(lineY), lineY)
            lineTo(left(lineY) + width(lineY), lineY)
            lineTo(w, h)
            lineTo(0f, h)
            close()
        },
        accent.copy(alpha = 0.28f),
    )

    for (k in 1..3) {
        val a = k / 4f
        drawLine(ink.copy(alpha = 0.22f), Offset(x(0f, a), 0f), Offset(x(h, a), h), 1.dp.toPx())
    }

    // Arcaea's two arcs, sweeping from the near lanes to the far end.
    drawPath(
        Path().apply { moveTo(w * 0.28f, h); cubicTo(w * 0.28f, h * 0.65f, w * 0.44f, h * 0.45f, x(0f, 0.38f), 0f) },
        accent.copy(alpha = 0.85f),
        style = Stroke(4.dp.toPx(), cap = StrokeCap.Round),
    )
    drawPath(
        Path().apply { moveTo(w * 0.72f, h); cubicTo(w * 0.70f, h * 0.70f, w * 0.56f, h * 0.48f, x(0f, 0.62f), 0f) },
        arc.copy(alpha = 0.85f),
        style = Stroke(4.dp.toPx(), cap = StrokeCap.Round),
    )

    // Notes fall toward the line, speeding up as they near it, as the track scrolls in perspective.
    val lanes = intArrayOf(0, 2, 1, 3, 2, 0, 3, 1)
    lanes.forEachIndexed { i, k ->
        val t = (i / lanes.size.toFloat() + phase) % 1f
        val y = h * t * t
        if (y > lineY - 6.dp.toPx()) return@forEachIndexed
        val thick = 3.dp.toPx() + 8.dp.toPx() * (y / h)
        val x0 = x(y, (k + 0.1f) / 4f)
        val x1 = x(y, (k + 0.9f) / 4f)
        drawRect(arc, topLeft = Offset(x0, y - thick / 2), size = androidx.compose.ui.geometry.Size(x1 - x0, thick), alpha = 0.35f + 0.65f * t)
    }

    // The edges and the judgement line.
    drawLine(accent, Offset(left(0f), 0f), Offset(0f, h), 2.dp.toPx())
    drawLine(accent, Offset(left(0f) + topW, 0f), Offset(w, h), 2.dp.toPx())
    val over = 6.dp.toPx()
    drawLine(accent, Offset(left(lineY) - over, lineY), Offset(left(lineY) + width(lineY) + over, lineY), 3.dp.toPx())
}

/** A floor button: a hexagon, pointed at both ends, filled in the accent when on. A tap pops "PURE" above it. */
@Composable
private fun LaneButton(icon: ImageVector, label: String, onClick: () -> Unit, lit: Boolean = false, enabled: Boolean = true) {
    val scheme = MaterialTheme.colorScheme
    val shape = CutCornerShape(50)
    val pure = rememberPure()
    Box(contentAlignment = Alignment.Center, modifier = Modifier.alpha(if (enabled) 1f else 0.38f)) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(width = 54.dp, height = 40.dp)
                .clip(shape)
                .background(if (lit) scheme.primary else scheme.surfaceContainerHighest)
                .border(1.5.dp, if (lit) scheme.primary else scheme.outline, shape)
                .clickable(enabled = enabled, onClickLabel = null, role = Role.Button) {
                    pure.fire()
                    onClick()
                }
                .semantics { contentDescription = label },
        ) {
            Icon(icon, contentDescription = null, tint = if (lit) scheme.onPrimary else scheme.onSurface, modifier = Modifier.size(20.dp))
        }
        PureText(pure, Modifier.align(Alignment.TopCenter))
    }
}

/** Play as Arcaea's diamond button, the accent filling it. */
@Composable
private fun PlayDiamond(state: PlaybackUiState, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val pure = rememberPure()
    val label = if (state.isPlaying) "Pause" else "Play"
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(84.dp)) {
        Box(
            Modifier
                .size(58.dp)
                .rotate(45f)
                .border(1.5.dp, scheme.outline)
                .padding(4.dp)
                .background(scheme.primary)
                .clickable(role = Role.Button) {
                    pure.fire()
                    onClick()
                }
                .semantics { contentDescription = label },
        )
        if (state.isBuffering && !state.isPlaying) {
            CircularProgressIndicator(modifier = Modifier.size(26.dp), color = scheme.onPrimary, strokeWidth = 2.dp)
        } else {
            Icon(if (state.isPlaying) AppIcons.pause else AppIcons.play, contentDescription = null, tint = scheme.onPrimary, modifier = Modifier.size(30.dp))
        }
        PureText(pure, Modifier.align(Alignment.TopCenter))
    }
}

/** A tap's judgement: Arcaea's "PURE" rising and fading over the button. Skipped with animations off. */
private class Pure(private val scope: CoroutineScope, private val animate: Boolean) {
    val progress = Animatable(1f)

    fun fire() {
        if (!animate) return
        scope.launch {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(420, easing = FastOutSlowInEasing))
        }
    }
}

@Composable
private fun rememberPure(): Pure {
    val scope = rememberCoroutineScope()
    val animate = rememberAnimationsOn()
    return remember(scope, animate) { Pure(scope, animate) }
}

@Composable
private fun PureText(pure: Pure, modifier: Modifier = Modifier) {
    val p = pure.progress.value
    if (p >= 1f) return
    val scheme = MaterialTheme.colorScheme
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier.graphicsLayer {
            translationY = -(10.dp.toPx() + 14.dp.toPx() * p)
            alpha = 1f - p
        },
    ) {
        Diamond(4.dp, scheme.primary)
        Text(
            "PURE",
            fontFamily = LaneFontFamily,
            fontWeight = FontWeight.SemiBold,
            fontSize = 11.sp,
            letterSpacing = 1.sp,
            color = scheme.primary,
            modifier = Modifier.padding(horizontal = 3.dp),
        )
        Diamond(4.dp, scheme.primary)
    }
}

/**
 * Arcaea's combo, in the track's far part: the count in thin type with "COMBO" under it, in the floor's ink. It kicks
 * on each new link, unless animations are off. Doesn't take touches, so the track under it still seeks.
 */
@Composable
private fun LaneCombo(combo: Int, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val animate = rememberAnimationsOn()
    val kick = remember { Animatable(1f) }
    LaunchedEffect(combo) {
        if (!animate) return@LaunchedEffect
        kick.snapTo(1.2f)
        kick.animateTo(1f, tween(240, easing = FastOutSlowInEasing))
    }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .graphicsLayer {
                scaleX = kick.value
                scaleY = kick.value
            }
            .semantics(mergeDescendants = true) { contentDescription = "Combo $combo" },
    ) {
        Text(combo.toString(), fontFamily = LaneFontFamily, fontWeight = FontWeight.Light, fontSize = 30.sp, color = scheme.inverseOnSurface)
        Text("COMBO", fontFamily = LaneFontFamily, fontWeight = FontWeight.Medium, fontSize = 9.sp, letterSpacing = 3.sp, color = scheme.inverseOnSurface.copy(alpha = 0.7f))
    }
}
