package com.brainlessmusic.app.ui.playback.skins

import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.foundation.combinedClickable
import com.brainlessmusic.app.ui.profile.tapLabel
import com.brainlessmusic.app.ui.profile.FeelingHeart
import com.brainlessmusic.app.ui.profile.Feeling
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.max
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.data.remote.dto.TrackStatDto
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.playback.QueueItem
import com.brainlessmusic.app.playback.Repeat
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.common.RingDifficulties
import com.brainlessmusic.app.ui.common.RingDifficulty
import com.brainlessmusic.app.ui.common.RingInk
import com.brainlessmusic.app.ui.common.RingSky
import com.brainlessmusic.app.ui.common.RingStar
import com.brainlessmusic.app.ui.common.RingYellow
import com.brainlessmusic.app.ui.common.formatDuration
import com.brainlessmusic.app.ui.common.starPath
import com.brainlessmusic.app.ui.playback.repeatIcon
import com.brainlessmusic.app.ui.playback.repeatLabel
import com.brainlessmusic.app.ui.playback.shuffleIcon
import com.brainlessmusic.app.ui.playback.shuffleLabel
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.RingFontFamily
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * A song's achievement from listening (A132), in ten-thousandths of a percent: 100% × plays / (plays + skips), plus
 * maimai's extra 1% (its BREAK bonus) only for a full combo. 0 to 1,010,000, shown as 0.0000% to 101.0000%.
 */
internal fun achievement(plays: Int, skips: Int): Int {
    if (plays + skips == 0) return 0
    val base = (1_000_000L * plays / (plays + skips)).toInt()
    return base + if (clearFor(plays, skips) == Clear.FULL_COMBO) 10_000 else 0
}

/** "100.5000%", from [achievement]'s ten-thousandths. */
internal fun achievementText(tenThousandths: Int): String = "%d.%04d%%".format(tenThousandths / 10_000, tenThousandths % 10_000)

/** maimai DX's rank for an achievement in ten-thousandths of a percent (ring-research.md, section 3). */
internal fun ringRank(tenThousandths: Int): String = when {
    tenThousandths >= 1_005_000 -> "SSS+"
    tenThousandths >= 1_000_000 -> "SSS"
    tenThousandths >= 995_000 -> "SS+"
    tenThousandths >= 990_000 -> "SS"
    tenThousandths >= 980_000 -> "S+"
    tenThousandths >= 970_000 -> "S"
    tenThousandths >= 940_000 -> "AAA"
    tenThousandths >= 900_000 -> "AA"
    tenThousandths >= 800_000 -> "A"
    tenThousandths >= 750_000 -> "BBB"
    tenThousandths >= 700_000 -> "BB"
    tenThousandths >= 600_000 -> "B"
    tenThousandths >= 500_000 -> "C"
    else -> "D"
}

/**
 * The song's difficulty from your real play count, as Gear's box does: BASIC under 3 plays, ADVANCED to 9, EXPERT to
 * 19, MASTER to 49, Re:MASTER from 50. The count is the level.
 */
internal fun ringDifficulty(plays: Int): RingDifficulty = RingDifficulties[
    when {
        plays < 3 -> 0
        plays < 10 -> 1
        plays < 20 -> 2
        plays < 50 -> 3
        else -> 4
    },
]

/** maimai's lamp in its own words: none for a song never played or skipped as often as finished. */
private fun lamp(clear: Clear): String? = when (clear) {
    Clear.NEW, Clear.FAILED -> null
    Clear.CLEAR -> "CLEAR"
    Clear.FULL_COMBO -> "FC"
}

/** The eight buttons' angles, clockwise from 12 o'clock: none sits on an axis, as on the cabinet. */
private fun buttonAngle(n: Int): Float = 22.5f + 45f * (n - 1)

/** The ring's radius and the buttons' size, as parts of the cabinet's width (from the design canvas, 390 wide). */
private const val RING_RADIUS = 169f / 390f
private const val RING_STROKE = 8f / 390f
private const val COVER_SIZE = 276f / 390f

/**
 * Ring's player, after maimai (A129-A132), laid out as the cabinet: the cover as the round screen, as wide as the phone,
 * with the song's progress as the judgement ring around it and the eight buttons sitting on that ring. Clockwise from
 * the top right: repeat, add to playlist, next, play (the large one, where maimai has NEXT), queue, previous, like and
 * shuffle. The ring fills clockwise from 12 o'clock in the song's difficulty colour (from your play count); the slide
 * star rides its head, and dragging around the ring seeks. Under the cabinet, the title and your achievement with its
 * rank and lamp. [coverGestures] (swipe to skip, hold for the menu) are on the cover; [coverLayer] slides it while
 * skipping.
 */
@Composable
fun ColumnScope.RingDeck(
    state: PlaybackUiState,
    item: QueueItem,
    fraction: Float,
    shownMs: Float,
    record: TrackStatDto?,
    feeling: Feeling,
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
    onDislike: () -> Unit,
    onAddToPlaylist: () -> Unit,
    onQueue: () -> Unit,
) {
    // The cabinet takes the space above the song's name and sits in its middle, so it reads centred on the screen.
    BoxWithConstraints(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
        // Past the screen's 24 dp side padding to both edges, unless the height is shorter.
        val side = min(maxWidth + 48.dp, maxHeight)
        Cabinet(
            side = side,
            state = state,
            item = item,
            fraction = fraction,
            shownMs = shownMs,
            plays = record?.plays,
            feeling = feeling,
            canEdit = canEdit,
            coverGestures = coverGestures,
            coverLayer = coverLayer,
            onFraction = onFraction,
            onFinished = onFinished,
            onShuffle = onShuffle,
            onPrevious = onPrevious,
            onPlayPause = onPlayPause,
            onNext = onNext,
            onRepeat = onRepeat,
            onLike = onLike,
            onDislike = onDislike,
            onAddToPlaylist = onAddToPlaylist,
            onQueue = onQueue,
        )
    }

    Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        // One line that scrolls when it doesn't fit, like Standard (A268).
        Text(
            item.title,
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
            maxLines = 1,
            modifier = Modifier.basicMarquee(iterations = Int.MAX_VALUE),
        )
        Text(
            item.artist ?: "Unknown artist",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (record != null) ScoreLine(item.trackId, record)
    }
}

@Composable
private fun Cabinet(
    side: Dp,
    state: PlaybackUiState,
    item: QueueItem,
    fraction: Float,
    shownMs: Float,
    plays: Int?,
    feeling: Feeling,
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
    onDislike: () -> Unit,
    onAddToPlaylist: () -> Unit,
    onQueue: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val difficulty = plays?.let { ringDifficulty(it) }
    val ringColor = difficulty?.color ?: scheme.primary
    val bezel = scheme.surfaceContainer
    val button = max(48.dp, side * (48f / 390f))
    val radius = side * RING_RADIUS
    val enabled = state.durationMs > 0
    val f = fraction.coerceIn(0f, 1f)
    val latestOnFraction by rememberUpdatedState(onFraction)
    val latestOnFinished by rememberUpdatedState(onFinished)

    Box(Modifier.requiredSize(side)) {
        // The bezel, the judgement ring and the slide star. A drag that starts on the ring, between the buttons, seeks
        // by the angle under the finger; a tap there seeks too.
        Canvas(
            Modifier
                .fillMaxSize()
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    val c = Offset(size.width / 2f, size.height / 2f)
                    val r = size.width * RING_RADIUS
                    val band = 26.dp.toPx()
                    val buttonR = button.toPx() / 2
                    fun onRing(p: Offset): Boolean {
                        if (abs(hypot(p.x - c.x, p.y - c.y) - r) > band) return false
                        return (1..8).none { n ->
                            val a = Math.toRadians(buttonAngle(n).toDouble())
                            hypot(p.x - (c.x + r * sin(a).toFloat()), p.y - (c.y - r * cos(a).toFloat())) < buttonR
                        }
                    }
                    fun angleFraction(p: Offset): Float {
                        val a = atan2((p.x - c.x).toDouble(), (c.y - p.y).toDouble())
                        return (((a + 2 * PI) % (2 * PI)) / (2 * PI)).toFloat()
                    }
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        if (!onRing(down.position)) return@awaitEachGesture
                        down.consume()
                        var last = angleFraction(down.position)
                        latestOnFraction(last)
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == down.id } ?: break
                            if (!change.pressed) break
                            var next = angleFraction(change.position)
                            // Across 12 o'clock the song stops at its end or its start rather than wrapping round.
                            if (abs(next - last) > 0.5f) next = if (last > 0.5f) 1f else 0f
                            last = next
                            latestOnFraction(next)
                            change.consume()
                        }
                        latestOnFinished()
                    }
                }
                .semantics {
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
            val c = Offset(size.width / 2, size.height / 2)
            drawCircle(bezel, radius = size.width / 2, center = c)
            drawCircle(scheme.outlineVariant, radius = size.width / 2 - 1.dp.toPx(), center = c, style = Stroke(2.dp.toPx()))
            val r = size.width * RING_RADIUS
            val stroke = size.width * RING_STROKE
            val topLeft = Offset(c.x - r, c.y - r)
            drawArc(scheme.outlineVariant, 0f, 360f, false, topLeft, Size(r * 2, r * 2), style = Stroke(stroke))
            if (f > 0f) {
                drawArc(ringColor, -90f, 360f * f, false, topLeft, Size(r * 2, r * 2), style = Stroke(stroke, cap = StrokeCap.Round))
            }
            val a = 2 * PI * f
            val head = Offset(c.x + r * sin(a).toFloat(), c.y - r * cos(a).toFloat())
            val star = starPath(head, 17.dp.toPx())
            drawPath(star, RingStar)
            drawPath(star, bezel, style = Stroke(2.dp.toPx()))
        }

        // The round screen: the cover, ringed in the ground's colour, the combo over it as maimai's centre shows it.
        val cover = side * COVER_SIZE
        Box(
            contentAlignment = Alignment.BottomCenter,
            modifier = Modifier
                .align(Alignment.Center)
                .size(cover)
                .then(coverGestures)
                .then(coverLayer)
                .clip(CircleShape)
                .border(5.dp, scheme.surface, CircleShape),
        ) {
            CoverImage(url = item.coverUrl, contentDescription = item.album, cornerRadius = 0.dp, modifier = Modifier.fillMaxSize())
            if (state.chain >= 2) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .padding(bottom = cover * 0.11f)
                        .semantics(mergeDescendants = true) { contentDescription = "Combo ${state.chain}" },
                ) {
                    OutlinedText(state.chain.toString(), 40.sp, stroke = 2.5.dp)
                    OutlinedText("COMBO", 12.sp, stroke = 3.dp, letterSpacing = 2.sp)
                }
            }
        }

        // The difficulty tab on the top arc, between the top pair of buttons, as the select screen shows it.
        if (plays != null) {
            val tab = ringDifficulty(plays)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = side * (6f / 390f))
                    .size(width = side * (72f / 390f), height = 42.dp)
                    .background(tab.color, RoundedCornerShape(14.dp))
                    .border(3.dp, bezel, RoundedCornerShape(14.dp))
                    .semantics(mergeDescendants = true) { contentDescription = "${tab.name}, level $plays" },
            ) {
                Text(tab.name, fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 8.sp, color = tab.ink, maxLines = 1)
                Text("LV ${plays.coerceAtMost(999)}", fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, color = tab.ink, maxLines = 1)
            }
        }

        // The time in the bottom gap, where the select screen keeps its countdown.
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(x = -side * (6f / 390f), y = -side * (12f / 390f)),
        ) {
            Text(
                formatDuration(shownMs / 1000.0),
                fontFamily = RingFontFamily,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 22.sp,
                color = scheme.onSurface,
            )
            Text(
                "/ " + formatDuration(state.durationMs / 1000.0),
                fontFamily = RingFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                color = scheme.onSurfaceVariant,
            )
        }

        // The eight buttons, on the ring. A room plays once, in order: shuffle and repeat are off there. Like and add
        // hide for guests (A65); their buttons stay, unlit and dimmed, as a cabinet's buttons always do.
        val rim = bezel
        RimButton(side, radius, 1, button, RingYellow, RingInk, lit = state.repeat != Repeat.OFF, icon = repeatIcon(state.repeat),
            label = repeatLabel(state.repeat), enabled = state.canChangeOrder, rim = rim, onClick = onRepeat)
        RimButton(side, radius, 2, button, scheme.primary, scheme.onPrimary, lit = false, icon = AppIcons.playlistAdd,
            label = "Add to playlist", enabled = canEdit, rim = rim, onClick = onAddToPlaylist)
        RimButton(side, radius, 3, button, RingSky, Color.White, lit = true, icon = AppIcons.next,
            label = state.nextLabel, enabled = state.hasNext, rim = rim, onClick = onNext)
        PlayButton(side, state, rim, onPlayPause)
        RimButton(side, radius, 5, button, scheme.secondary, scheme.onSecondary, lit = true, icon = AppIcons.queue,
            label = "Queue", enabled = true, rim = rim, onClick = onQueue)
        RimButton(side, radius, 6, button, RingSky, Color.White, lit = true, icon = AppIcons.previous,
            label = "Previous", enabled = state.hasPrevious || state.positionMs > 3_000, rim = rim, onClick = onPrevious)
        RimButton(side, radius, 7, button, scheme.primary, scheme.onPrimary, lit = feeling == Feeling.LIKED,
            icon = AppIcons.favorite, label = feeling.tapLabel(),
            enabled = canEdit, rim = rim, onClick = onLike, onLongClick = onDislike, heart = feeling)
        RimButton(side, radius, 8, button, RingYellow, RingInk, lit = state.shuffle, icon = shuffleIcon(state.shuffleMode),
            label = shuffleLabel(state.shuffleMode), enabled = state.canChangeOrder, rim = rim, onClick = onShuffle)
    }
}

/** [text] in white with maimai's navy outline, so it reads on any cover. */
@Composable
private fun OutlinedText(text: String, size: TextUnit, stroke: Dp, letterSpacing: TextUnit = TextUnit.Unspecified) {
    Box {
        val style = TextStyle(fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = size, letterSpacing = letterSpacing)
        val px = with(LocalDensity.current) { stroke.toPx() }
        Text(text, style = style.copy(color = RingInk, drawStyle = Stroke(width = px)))
        Text(text, style = style.copy(color = Color.White))
    }
}

/**
 * Button [n] (1 to 8, clockwise from the top right) on the ring: lit, it is filled with its [color] and edged in the
 * bezel's; unlit, it is the bezel's colour edged in [color], as an unlit cabinet button.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun RimButton(
    side: Dp,
    radius: Dp,
    n: Int,
    size: Dp,
    color: Color,
    ink: Color,
    lit: Boolean,
    icon: ImageVector,
    label: String,
    enabled: Boolean,
    rim: Color,
    onClick: () -> Unit,
    // The like button (A153): hold to dislike, and the animated heart in place of the icon.
    onLongClick: (() -> Unit)? = null,
    heart: Feeling? = null,
) {
    val scheme = MaterialTheme.colorScheme
    val haptics = LocalHapticFeedback.current
    val a = Math.toRadians(buttonAngle(n).toDouble())
    val x = side / 2 + radius * sin(a).toFloat() - size / 2
    val y = side / 2 - radius * cos(a).toFloat() - size / 2
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .offset(x, y)
            .size(size)
            .alpha(if (enabled) 1f else 0.38f)
            .clip(CircleShape)
            .background(if (lit) color else rim)
            .border(3.dp, if (lit) rim else color, CircleShape)
            .combinedClickable(
                enabled = enabled,
                role = Role.Button,
                onLongClick = onLongClick?.let { hold ->
                    {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        hold()
                    }
                },
                onLongClickLabel = if (onLongClick != null && heart != Feeling.DISLIKED) "Dislike" else null,
                onClick = onClick,
            )
            .semantics { contentDescription = label },
    ) {
        // Unlit, the yellow edge is too pale for a yellow glyph, so the glyph takes the screen's ink.
        val tint = when {
            lit -> ink
            color == RingYellow -> scheme.onSurface
            else -> color
        }
        if (heart != null) {
            FeelingHeart(heart, tint = tint, size = 22.dp)
        } else {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
    }
}

/** Play, the large lit button at the bottom right, where maimai's NEXT sits. */
@Composable
private fun PlayButton(side: Dp, state: PlaybackUiState, rim: Color, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val size = max(64.dp, side * (64f / 390f))
    // A little inside the ring, so the larger button stays within the cabinet.
    val radius = side * (163f / 390f)
    val a = Math.toRadians(buttonAngle(4).toDouble())
    val x = side / 2 + radius * sin(a).toFloat() - size / 2
    val y = side / 2 - radius * cos(a).toFloat() - size / 2
    val label = if (state.isPlaying) "Pause" else "Play"
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .offset(x, y)
            .size(size)
            .clip(CircleShape)
            .background(scheme.primary)
            .border(4.dp, rim, CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
    ) {
        if (state.isBuffering && !state.isPlaying) {
            CircularProgressIndicator(modifier = Modifier.size(26.dp), color = scheme.onPrimary, strokeWidth = 2.5.dp)
        } else {
            Icon(if (state.isPlaying) AppIcons.pause else AppIcons.play, contentDescription = null, tint = scheme.onPrimary, modifier = Modifier.size(30.dp))
        }
    }
}

/**
 * The record as maimai's result line: the rank in its outlined gold letters, the achievement to four decimals (rolling
 * up when the song opens), the lamp, then your numbers.
 */
@Composable
private fun ScoreLine(trackId: Int, record: TrackStatDto) {
    val scheme = MaterialTheme.colorScheme
    val clear = clearFor(record.plays, record.skips)
    val value = achievement(record.plays, record.skips)
    val animate = rememberAnimationsOn()
    val shown = remember(trackId) { Animatable(if (animate) 0f else value.toFloat()) }
    LaunchedEffect(trackId, value) {
        if (animate) shown.animateTo(value.toFloat(), tween(900, easing = FastOutSlowInEasing)) else shown.snapTo(value.toFloat())
    }
    val rank = if (clear == Clear.NEW) null else ringRank(value)
    val lampText = lamp(clear)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .padding(top = 10.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = buildString {
                    append(if (rank == null) "New song" else "Rank $rank, achievement ${achievementText(value)}")
                    lampText?.let { append(", $it") }
                }
            },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (rank != null) RankGlyph(rank)
            Text(
                achievementText(shown.value.toInt()),
                fontFamily = RingFontFamily,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 22.sp,
                color = scheme.onSurface,
            )
            if (lampText != null) {
                Text(
                    lampText,
                    fontFamily = RingFontFamily,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 11.sp,
                    letterSpacing = 1.sp,
                    color = Color.White,
                    modifier = Modifier
                        .background(Color(0xFFC81E70), CircleShape)
                        .padding(horizontal = 9.dp, vertical = 3.dp),
                )
            }
        }
        Text(
            recordLine(record.plays, record.msListened),
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/** maimai's rank letters: gold, outlined in navy. */
@Composable
private fun RankGlyph(rank: String) {
    Box {
        val style = TextStyle(fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, letterSpacing = 1.sp)
        val px = with(LocalDensity.current) { 3.dp.toPx() }
        Text(rank, style = style.copy(color = RingInk, drawStyle = Stroke(width = px)))
        Text(rank, style = style.copy(color = RingYellow))
    }
}
