package com.brainlessmusic.app.ui.playback.skins

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.data.remote.dto.TrackStatDto
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.Repeat
import com.brainlessmusic.app.playback.ShuffleMode
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.GearCritical
import com.brainlessmusic.app.ui.common.GearDifficultyColors
import com.brainlessmusic.app.ui.common.GearFx
import com.brainlessmusic.app.ui.common.GearInk
import com.brainlessmusic.app.ui.common.GearLaserRight
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.playback.repeatIcon
import com.brainlessmusic.app.ui.playback.repeatLabel
import com.brainlessmusic.app.ui.playback.shuffleIcon
import com.brainlessmusic.app.ui.playback.shuffleLabel
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.GearDisplayFontFamily
import com.brainlessmusic.app.ui.theme.LocalDarkTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** The lane is SOUND VOLTEX's black in every theme, as the game's is. */
private val LaneBlack = Color(0xFF070A1C)

/** The CRITICAL judgement's yellow. */
private val CriticalYellow = Color(0xFFFFE14A)

/**
 * A song's score from listening (A128): 10,000,000 when it is always played through, less for each skip, as SOUND
 * VOLTEX scores a chart out of ten million.
 */
internal fun listeningScore(plays: Int, skips: Int): Int =
    if (plays + skips == 0) 0 else (10_000_000L * plays / (plays + skips)).toInt()

/** SOUND VOLTEX's grade for a score, by the thresholds it has used since HEAVENLY HAVEN. */
internal fun gearGrade(score: Int): String = when {
    score >= 9_900_000 -> "S"
    score >= 9_800_000 -> "AAA+"
    score >= 9_700_000 -> "AAA"
    score >= 9_500_000 -> "AA+"
    score >= 9_300_000 -> "AA"
    score >= 9_000_000 -> "A+"
    score >= 8_700_000 -> "A"
    score >= 7_500_000 -> "B"
    score >= 6_500_000 -> "C"
    else -> "D"
}

/** The clear medal in the game's words and colours; an unbroken run of ten or more is a PERFECT. */
private fun medal(clear: Clear, plays: Int): Pair<String, Color> = when (clear) {
    Clear.NEW -> "NO PLAY" to Color(0xFF8A90A8)
    Clear.FAILED -> "PLAYED" to Color(0xFF5E9C6A)
    Clear.CLEAR -> "COMPLETE" to Color(0xFF3DDC84)
    Clear.FULL_COMBO -> if (plays >= 10) "PERFECT" to Color(0xFFFFC83D) else "ULTIMATE CHAIN" to GearLaserRight
}

/**
 * The difficulty box on the jacket's corner, from your real play count: NOV under 3 plays, ADV to 9, EXH to 19, MXM
 * from 20, with the count as the level.
 */
private fun playTier(plays: Int): Pair<String, Color> = when {
    plays < 3 -> "NOV" to GearDifficultyColors[0]
    plays < 10 -> "ADV" to GearDifficultyColors[1]
    plays < 20 -> "EXH" to GearDifficultyColors[2]
    else -> "MXM" to GearDifficultyColors[3]
}

/**
 * Gear's player, after SOUND VOLTEX (A125-A128), laid out as the cabinet's portrait screen and its control panel. The
 * song sits in a banner, its jacket marked with a difficulty box from your play count; under it the score strip
 * (an eight-digit score from plays and skips, its grade and clear medal). The lane runs into the distance with a cyan
 * wall left and magenta right; the red critical line climbs it as the song plays, and a tap or vertical drag seeks.
 * Beside it, the gauge turns from blue to pink once the play counts (half the song or 4 minutes, A113), the game's
 * clear line. Below, the console: knobs at the corners turn shuffle (left) and repeat (right), white BT keys are
 * previous, play and next, orange FX keys like and add. [coverGestures] (swipe to skip, hold for the menu) are on the
 * banner; [coverLayer] slides the jacket while skipping.
 */
@Composable
fun ColumnScope.GearDeck(
    state: PlaybackUiState,
    item: QueueItem,
    fraction: Float,
    shownMs: Float,
    record: TrackStatDto?,
    liked: Boolean,
    canEdit: Boolean,
    coverGestures: Modifier,
    coverLayer: Modifier,
    onFraction: (Float) -> Unit,
    onFinished: () -> Unit,
    onShuffle: () -> Unit,
    onPrevious: () -> Unit,
    onPlayPause: () -> Unit,
    onNext: () -> Unit,
    onRepeat: () -> Unit,
    onLike: () -> Unit,
    onAddToPlaylist: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val bannerShape = CutCornerShape(topStart = 0.dp, topEnd = 18.dp, bottomEnd = 0.dp, bottomStart = 18.dp)

    // The banner: jacket, title, artist, time, edged in the left laser's cyan.
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .clip(bannerShape)
            .background(scheme.surfaceContainerHigh)
            .border(2.dp, scheme.primary, bannerShape)
            .then(coverGestures)
            .padding(10.dp),
    ) {
        Box(Modifier.size(84.dp).then(coverLayer)) {
            CoverImage(
                url = item.coverUrl,
                contentDescription = item.album,
                cornerRadius = 0.dp,
                modifier = Modifier.fillMaxSize().clip(CutCornerShape(8.dp)),
            )
            if (record != null) {
                val (tier, color) = playTier(record.plays)
                Text(
                    "$tier ${record.plays.coerceAtMost(99).toString().padStart(2, '0')}",
                    fontFamily = GearDisplayFontFamily,
                    fontWeight = FontWeight.Bold,
                    fontSize = 9.sp,
                    color = GearInk,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .background(color, CutCornerShape(topEnd = 4.dp))
                        .padding(horizontal = 4.dp, vertical = 1.dp),
                )
            }
        }
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(item.title, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
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

    if (record != null) ScoreStrip(item.trackId, record)

    // The lane, and the gauge beside it.
    val countAt = if (state.durationMs > 0) (240_000f / state.durationMs).coerceAtMost(0.5f) else 0.5f
    Row(Modifier.weight(1f).fillMaxWidth().padding(top = 10.dp)) {
        GearLane(
            fraction = fraction,
            playing = state.isPlaying,
            enabled = state.durationMs > 0,
            shuffleOn = state.shuffle,
            repeatOn = state.repeat != Repeat.OFF,
            onFraction = onFraction,
            onFinished = onFinished,
            modifier = Modifier.weight(1f).fillMaxHeight(),
        )
        Gauge(fraction = fraction, countAt = countAt, modifier = Modifier.padding(start = 8.dp).width(14.dp).fillMaxHeight())
    }

    // The console: a band a shade apart, run past the screen's side padding to both edges and on down, under the
    // cyan edge of the panel. A room plays once, in order: the knobs are off there.
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .drawBehind {
                val bleed = 24.dp.toPx()
                drawRect(scheme.surfaceContainer, Offset(-bleed, 0f), Size(size.width + 2 * bleed, size.height + 4_000f))
                drawLine(scheme.primary, Offset(-bleed, 0f), Offset(size.width + bleed, 0f), 2.dp.toPx())
            }
            .padding(top = 14.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Knob(
                laser = scheme.primary,
                notch = state.shuffleMode.ordinal,
                notches = ShuffleMode.entries.size,
                lit = state.shuffle,
                icon = shuffleIcon(state.shuffleMode),
                label = shuffleLabel(state.shuffleMode),
                enabled = !state.inRoom,
                onClick = onShuffle,
            )
            BtKey(AppIcons.previous, "Previous", enabled = state.hasPrevious || state.positionMs > 3_000, onClick = onPrevious)
            PlayKey(state, onPlayPause)
            BtKey(AppIcons.next, "Next", enabled = state.hasNext, onClick = onNext)
            Knob(
                laser = GearLaserRight,
                notch = state.repeat.ordinal,
                notches = Repeat.entries.size,
                lit = state.repeat != Repeat.OFF,
                icon = repeatIcon(state.repeat),
                label = repeatLabel(state.repeat),
                enabled = !state.inRoom,
                onClick = onRepeat,
            )
        }
        // Like and add hide for guests (A65), as their pills and buttons do elsewhere.
        if (canEdit) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 52.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FxKey(if (liked) AppIcons.favorite else AppIcons.favoriteBorder, if (liked) "Unlike" else "Like", lit = liked, onClick = onLike)
                FxKey(AppIcons.playlistAdd, "Add to playlist", onClick = onAddToPlaylist)
            }
        }
    }
}

/**
 * The record as the game's result line: the eight-digit score (dim leading zeros, rolling up when the song opens), the
 * grade beside it, and the clear medal with your numbers.
 */
@Composable
private fun ScoreStrip(trackId: Int, record: TrackStatDto) {
    val scheme = MaterialTheme.colorScheme
    val clear = clearFor(record.plays, record.skips)
    val score = listeningScore(record.plays, record.skips)
    val animate = rememberAnimationsOn()
    val shown = remember(trackId) { Animatable(if (animate) 0f else score.toFloat()) }
    LaunchedEffect(trackId, score) {
        if (animate) shown.animateTo(score.toFloat(), tween(900, easing = FastOutSlowInEasing)) else shown.snapTo(score.toFloat())
    }
    val digits = shown.value.toInt().toString().padStart(8, '0')
    val lead = digits.indexOfFirst { it != '0' }.let { if (it < 0) 8 else it }
    val (medalText, medalColor) = medal(clear, record.plays)
    val shape = CutCornerShape(topStart = 12.dp, bottomEnd = 12.dp)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .clip(shape)
            .background(if (LocalDarkTheme.current) scheme.surfaceContainerHighest else scheme.surfaceContainerHigh)
            .border(1.dp, scheme.outline, shape)
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = "Score $score, grade ${if (clear == Clear.NEW) "none" else gearGrade(score)}, $medalText"
            },
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = scheme.onSurfaceVariant.copy(alpha = 0.45f))) { append(digits.substring(0, lead)) }
                    append(digits.substring(lead))
                },
                fontFamily = GearDisplayFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 22.sp,
                letterSpacing = 1.sp,
                color = scheme.onSurface,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(medalColor, CutCornerShape(2.dp)))
                Text(
                    medalText,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (LocalDarkTheme.current) medalColor else scheme.onSurface,
                    modifier = Modifier.padding(start = 6.dp),
                )
                Text(
                    "  ·  " + recordLine(record.plays, record.msListened),
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        // The grade in a chamfered box, as the result screen frames it.
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .padding(start = 10.dp)
                .size(width = 58.dp, height = 40.dp)
                .border(2.dp, scheme.primary, CutCornerShape(8.dp)),
        ) {
            Text(
                if (clear == Clear.NEW) "–" else gearGrade(score),
                fontFamily = GearDisplayFontFamily,
                fontWeight = FontWeight.Black,
                fontSize = 17.sp,
                color = scheme.primary,
            )
        }
    }
}

/**
 * The song as SOUND VOLTEX's lane: four BT lanes narrowing into the distance, a cyan wall left and a magenta one
 * right. The played part fills from the bottom to the red critical line at [fraction]; a tap or vertical drag seeks.
 * The two knob cursors ride the line, lit when shuffle and repeat are on. While [playing], chips fall toward it: white
 * BT chips and the orange FX ones across two lanes.
 */
@Composable
private fun GearLane(
    fraction: Float,
    playing: Boolean,
    enabled: Boolean,
    shuffleOn: Boolean,
    repeatOn: Boolean,
    onFraction: (Float) -> Unit,
    onFinished: () -> Unit,
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
        rememberInfiniteTransition(label = "chips").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing)),
            label = "chips",
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

    Canvas(
        modifier
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
        drawGearLane(f, phase, left = scheme.primary, shuffleOn = shuffleOn, repeatOn = repeatOn)
    }
}

private fun DrawScope.drawGearLane(f: Float, phase: Float, left: Color, shuffleOn: Boolean, repeatOn: Boolean) {
    val w = size.width
    val h = size.height
    val topW = w * 0.3f
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
    drawPath(lane, LaneBlack)

    // What has played: the lane below the critical line, tinted in the left laser's cyan.
    val lineY = h * (1f - f)
    drawPath(
        Path().apply {
            moveTo(left(lineY), lineY)
            lineTo(left(lineY) + width(lineY), lineY)
            lineTo(w, h)
            lineTo(0f, h)
            close()
        },
        left.copy(alpha = 0.16f),
    )

    for (k in 1..3) {
        val a = k / 4f
        drawLine(Color.White.copy(alpha = if (k == 2) 0.32f else 0.16f), Offset(x(0f, a), 0f), Offset(x(h, a), h), 1.dp.toPx())
    }

    // Chips fall toward the line, speeding up as they near it: white BT chips in one lane, orange FX across two.
    val chips = intArrayOf(0, 5, 2, 1, 4, 3, 0, 2)
    chips.forEachIndexed { i, k ->
        val t = (i / chips.size.toFloat() + phase) % 1f
        val y = h * t * t
        if (y > lineY - 6.dp.toPx()) return@forEachIndexed
        val fx = k >= 4
        val thick = (if (fx) 3.dp.toPx() else 2.dp.toPx()) + 7.dp.toPx() * (y / h)
        val from = if (fx) (k - 4) * 0.5f else k / 4f
        val span = if (fx) 0.5f else 0.25f
        val x0 = x(y, from + span * 0.06f)
        val x1 = x(y, from + span * 0.94f)
        drawRect(
            if (fx) GearFx else Color.White,
            topLeft = Offset(x0, y - thick / 2),
            size = Size(x1 - x0, thick),
            alpha = 0.4f + 0.6f * t,
        )
    }

    // The walls: the left laser cyan, the right magenta.
    drawLine(left, Offset(left(0f), 0f), Offset(0f, h), 3.dp.toPx())
    drawLine(GearLaserRight, Offset(left(0f) + topW, 0f), Offset(w, h), 3.dp.toPx())

    // The critical line, and the two knob cursors on it.
    val over = 4.dp.toPx()
    val l = left(lineY)
    val r = l + width(lineY)
    drawLine(GearCritical, Offset(l - over, lineY), Offset(r + over, lineY), 4.dp.toPx())
    drawCursor(Offset(l + 10.dp.toPx(), lineY), left, shuffleOn)
    drawCursor(Offset(r - 10.dp.toPx(), lineY), GearLaserRight, repeatOn)
}

/** A knob's cursor on the critical line: a pointer in its laser's colour, filled when its setting is on. */
private fun DrawScope.drawCursor(at: Offset, color: Color, on: Boolean) {
    val c = 8.dp.toPx()
    val path = Path().apply {
        moveTo(at.x, at.y - c)
        lineTo(at.x + c, at.y + c * 0.6f)
        lineTo(at.x - c, at.y + c * 0.6f)
        close()
    }
    if (on) drawPath(path, color) else drawPath(path, color, style = Stroke(2.dp.toPx()))
}

/**
 * The EFFECTIVE gauge: fills with the song, blue until [countAt], the point the play counts, then pink, as the game's
 * gauge turns at its 70% clear line. A tick marks that point.
 */
@Composable
private fun Gauge(fraction: Float, countAt: Float, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val cleared = fraction >= countAt
    Canvas(modifier.semantics { contentDescription = if (cleared) "Counts as a play" else "Not yet a play" }) {
        val w = size.width
        val h = size.height
        drawRect(LaneBlack)
        val fill = h * fraction.coerceIn(0f, 1f)
        drawRect(if (cleared) GearLaserRight else Color(0xFF2E7BFF), Offset(0f, h - fill), Size(w, fill))
        val tickY = h * (1f - countAt)
        drawLine(scheme.onSurface, Offset(-3.dp.toPx(), tickY), Offset(w + 3.dp.toPx(), tickY), 2.dp.toPx())
        drawRect(scheme.outline, style = Stroke(1.dp.toPx()))
    }
}

/**
 * A knob at the console's corner, in its laser's colour: its notch turns to the setting (one stop per mode), and a tap
 * turns it on to the next, as the game's knobs scroll.
 */
@Composable
private fun Knob(
    laser: Color,
    notch: Int,
    notches: Int,
    lit: Boolean,
    icon: ImageVector,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val sweep = 240f
    val target = -sweep / 2 + sweep * notch / (notches - 1).coerceAtLeast(1)
    val angle by animateFloatAsState(target, tween(if (rememberAnimationsOn()) 220 else 0), label = "knob")
    val pop = rememberCritical()
    Box(contentAlignment = Alignment.Center, modifier = Modifier.alpha(if (enabled) 1f else 0.38f)) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(50.dp)
                .clip(CircleShape)
                .background(if (lit) laser.copy(alpha = 0.22f) else scheme.surfaceContainerHighest)
                .border(3.dp, laser, CircleShape)
                .clickable(enabled = enabled, role = Role.Button) {
                    pop.fire()
                    onClick()
                }
                .semantics { contentDescription = label },
        ) {
            Box(Modifier.fillMaxSize().rotate(angle)) {
                Box(Modifier.align(Alignment.TopCenter).padding(top = 4.dp).size(width = 4.dp, height = 9.dp).background(laser))
            }
            Icon(icon, contentDescription = null, tint = scheme.onSurface, modifier = Modifier.size(18.dp))
        }
        CriticalText(pop, Modifier.align(Alignment.TopCenter))
    }
}

/** A white BT key, the navy glyph on it. */
@Composable
private fun RowScope.BtKey(icon: ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val pop = rememberCritical()
    Box(contentAlignment = Alignment.Center, modifier = Modifier.weight(1f).alpha(if (enabled) 1f else 0.38f)) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
                .clip(CutCornerShape(6.dp))
                .background(Color(0xFFF2F4FB))
                .border(1.dp, scheme.outline, CutCornerShape(6.dp))
                .clickable(enabled = enabled, role = Role.Button) {
                    pop.fire()
                    onClick()
                }
                .semantics { contentDescription = label },
        ) {
            Icon(icon, contentDescription = null, tint = GearInk, modifier = Modifier.size(22.dp))
        }
        CriticalText(pop, Modifier.align(Alignment.TopCenter))
    }
}

/** Play as the wide BT key, edged in cyan. */
@Composable
private fun RowScope.PlayKey(state: PlaybackUiState, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val pop = rememberCritical()
    val label = if (state.isPlaying) "Pause" else "Play"
    Box(contentAlignment = Alignment.Center, modifier = Modifier.weight(1.6f)) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .clip(CutCornerShape(8.dp))
                .background(Color.White)
                .border(3.dp, scheme.primary, CutCornerShape(8.dp))
                .clickable(role = Role.Button) {
                    pop.fire()
                    onClick()
                }
                .semantics { contentDescription = label },
        ) {
            if (state.isBuffering && !state.isPlaying) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = GearInk, strokeWidth = 2.dp)
            } else {
                Icon(if (state.isPlaying) AppIcons.pause else AppIcons.play, contentDescription = null, tint = GearInk, modifier = Modifier.size(28.dp))
            }
        }
        CriticalText(pop, Modifier.align(Alignment.TopCenter))
    }
}

/** An orange FX key, wide and short, under the BT keys. */
@Composable
private fun RowScope.FxKey(icon: ImageVector, label: String, lit: Boolean = false, onClick: () -> Unit) {
    val pop = rememberCritical()
    Box(contentAlignment = Alignment.Center, modifier = Modifier.weight(1f)) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxWidth()
                .height(36.dp)
                .clip(CutCornerShape(5.dp))
                .background(if (lit) GearFx else GearFx.copy(alpha = 0.75f))
                .then(if (lit) Modifier.border(2.dp, Color.White, CutCornerShape(5.dp)) else Modifier)
                .clickable(role = Role.Button) {
                    pop.fire()
                    onClick()
                }
                .semantics { contentDescription = label },
        ) {
            Icon(icon, contentDescription = null, tint = GearInk, modifier = Modifier.size(18.dp))
        }
        CriticalText(pop, Modifier.align(Alignment.TopCenter))
    }
}

/** A press's judgement: "CRITICAL" rising and fading over the key. Skipped with animations off. */
private class Critical(private val scope: CoroutineScope, private val animate: Boolean) {
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
private fun rememberCritical(): Critical {
    val scope = rememberCoroutineScope()
    val animate = rememberAnimationsOn()
    return remember(scope, animate) { Critical(scope, animate) }
}

@Composable
private fun CriticalText(critical: Critical, modifier: Modifier = Modifier) {
    val p = critical.progress.value
    if (p >= 1f) return
    Text(
        "CRITICAL",
        fontFamily = GearDisplayFontFamily,
        fontWeight = FontWeight.Black,
        fontSize = 10.sp,
        letterSpacing = 1.sp,
        // The game's yellow on the dark console; on a light one, the accent, which clears it.
        color = if (LocalDarkTheme.current) CriticalYellow else MaterialTheme.colorScheme.primary,
        modifier = modifier.graphicsLayer {
            translationY = -(10.dp.toPx() + 14.dp.toPx() * p)
            alpha = 1f - p
        },
    )
}
