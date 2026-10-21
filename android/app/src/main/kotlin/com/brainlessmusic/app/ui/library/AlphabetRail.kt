package com.brainlessmusic.app.ui.library

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.data.remote.dto.LetterEntryDto

/** Width of the rail; lists leave this much room on the right so a row's duration isn't drawn under it. */
val RailWidth = 28.dp

private val ThumbWidth = 24.dp
private val ThumbMinHeight = 24.dp

@Composable
fun AlphabetRail(
    letters: List<LetterEntryDto>,
    state: LazyListState,
    onJump: (index: Int) -> Unit,
    modifier: Modifier = Modifier,
    topInset: Dp = 0.dp,
) {
    val first by remember(state) { derivedStateOf { state.firstVisibleItemIndex } }
    val visible by remember(state) { derivedStateOf { state.layoutInfo.visibleItemsInfo.size } }
    val total by remember(state) { derivedStateOf { state.layoutInfo.totalItemsCount } }
    Rail(letters, first, visible, total, state.isScrollInProgress, onJump, modifier, topInset)
}

@Composable
fun AlphabetRail(
    letters: List<LetterEntryDto>,
    state: LazyGridState,
    onJump: (index: Int) -> Unit,
    modifier: Modifier = Modifier,
    topInset: Dp = 0.dp,
) {
    val first by remember(state) { derivedStateOf { state.firstVisibleItemIndex } }
    val visible by remember(state) { derivedStateOf { state.layoutInfo.visibleItemsInfo.size } }
    val total by remember(state) { derivedStateOf { state.layoutInfo.totalItemsCount } }
    Rail(letters, first, visible, total, state.isScrollInProgress, onJump, modifier, topInset)
}

/**
 * The A–Z strip, which is also the list's scroll bar. [letters] comes from `GET /browse/letters`; each letter gets an
 * equal slot and the thumb moves through a slot as the list moves through that letter's rows, so the thumb always sits
 * on the current letter. Dragging is continuous; a tap on a letter lands on its first row. With no letters (a filtered
 * list) the strip is a plain scroll bar. The paged lists hold placeholders for every row, so any row can be reached.
 * The root takes no touches, so the list underneath still scrolls; [topInset] clears the floating header.
 */
@Composable
private fun Rail(
    letters: List<LetterEntryDto>,
    first: Int,
    visible: Int,
    total: Int,
    scrolling: Boolean,
    onJump: (index: Int) -> Unit,
    modifier: Modifier,
    topInset: Dp,
) {
    val segments = remember(letters, total) { railSegments(letters, total) }
    // Nothing to index and nothing to scroll.
    if (letters.isEmpty() && visible >= total) return
    if (total <= 0) return

    var heightPx by remember { mutableIntStateOf(1) }
    var pressed by remember { mutableStateOf(false) }
    var pressedSegment by remember { mutableIntStateOf(-1) }
    var lastJump by remember { mutableIntStateOf(-1) }
    val haptic = LocalHapticFeedback.current
    val density = LocalDensity.current

    val thumbPx = railThumbHeight(heightPx.toFloat(), segments, visible, with(density) { ThumbMinHeight.toPx() })
    val thumbTop = (railFraction(segments, first) * heightPx).coerceAtMost(heightPx - thumbPx).coerceAtLeast(0f)
    val current = segmentAt(segments, first)
    val highlighted = if (pressed && pressedSegment >= 0) pressedSegment else current
    // Quiet at rest, so it doesn't compete with the letters; full while in use.
    val thumbAlpha by animateFloatAsState(if (pressed || scrolling) 1f else 0.5f, label = "railThumbAlpha")

    fun jumpTo(y: Float) {
        // The finger holds the middle of the thumb, so a tap on a letter's centre lands on that letter's first row.
        val index = railIndex(segments, (y - thumbPx / 2) / heightPx)
        val segment = segmentAt(segments, index)
        if (segment != pressedSegment && letters.isNotEmpty()) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        pressedSegment = segment
        if (index == lastJump) return
        lastJump = index
        onJump(index)
    }

    fun release() {
        pressed = false
        pressedSegment = -1
        lastJump = -1
    }

    Box(modifier = modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(top = topInset, bottom = 8.dp)
                .fillMaxHeight()
                .width(RailWidth)
                .onSizeChanged { heightPx = it.height.coerceAtLeast(1) }
                // One detector for press and drag. With a tap detector and a drag detector side by side, the drag took
                // the touch past slop, the tap's press ended and cleared `pressed`, and the letter bubble vanished for
                // the rest of the drag (owner, 2026-10-21).
                .pointerInput(segments) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        down.consume()
                        pressed = true
                        jumpTo(down.position.y)
                        try {
                            while (true) {
                                val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                                if (!change.pressed) break
                                jumpTo(change.position.y)
                                change.consume()
                            }
                        } finally {
                            release()
                        }
                    }
                },
        ) {
            if (visible < total) {
                val color = if (pressed) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.secondaryContainer
                Box(
                    Modifier
                        .align(Alignment.TopCenter)
                        .offset { IntOffset(0, thumbTop.toInt()) }
                        .width(ThumbWidth)
                        .height(with(density) { thumbPx.toDp() })
                        .background(color.copy(alpha = color.alpha * thumbAlpha), CircleShape),
                )
            }
            if (letters.isNotEmpty()) {
                // SpaceAround puts each letter at the centre of its equal slot, which is where the thumb sits for it.
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.SpaceAround,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    letters.forEachIndexed { i, entry ->
                        val isHighlighted = i == highlighted
                        Text(
                            entry.letter,
                            fontSize = 10.sp,
                            fontWeight = if (isHighlighted) FontWeight.Bold else FontWeight.Medium,
                            color = when {
                                isHighlighted -> MaterialTheme.colorScheme.primary
                                entry.count == 0 -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.28f)
                                else -> MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
            }
        }

        if (pressed && pressedSegment >= 0 && letters.isNotEmpty()) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                modifier = Modifier.align(Alignment.Center).size(84.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(letters[pressedSegment].letter, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/** One equal slot of the rail: a letter's rows, or the whole list when there are no letters. */
internal data class RailSegment(val offset: Int, val count: Int)

internal fun railSegments(letters: List<LetterEntryDto>, total: Int): List<RailSegment> =
    if (letters.isEmpty()) listOf(RailSegment(0, total)) else letters.map { RailSegment(it.offset, it.count) }

/** The slot holding row [index]: the last non-empty one starting at or before it. */
internal fun segmentAt(segments: List<RailSegment>, index: Int): Int =
    segments.indexOfLast { it.count > 0 && it.offset <= index }.coerceAtLeast(0)

/** Where row [index] sits along the rail, 0 to 1: its slot, plus how far through that slot's rows it is. */
internal fun railFraction(segments: List<RailSegment>, index: Int): Float {
    val i = segmentAt(segments, index)
    val segment = segments[i]
    val within = if (segment.count > 0) ((index - segment.offset).toFloat() / segment.count).coerceIn(0f, 1f) else 0f
    return (i + within) / segments.size
}

/** The row at [fraction] along the rail; the inverse of [railFraction]. */
internal fun railIndex(segments: List<RailSegment>, fraction: Float): Int {
    val position = fraction.coerceIn(0f, 1f) * segments.size
    val i = position.toInt().coerceAtMost(segments.lastIndex)
    val segment = segments[i]
    val within = ((position - i) * segment.count).toInt()
    return segment.offset + within.coerceAtMost((segment.count - 1).coerceAtLeast(0))
}

/**
 * One letter's slot with letters; without, the visible share of the track. Never below [minPx] nor above the track.
 * Clamped up then down rather than `coerceIn(minPx, trackPx)`, which throws while the track is unmeasured (v0.3.1).
 */
internal fun railThumbHeight(trackPx: Float, segments: List<RailSegment>, visible: Int, minPx: Float): Float {
    val share = if (segments.size > 1) {
        trackPx / segments.size
    } else {
        trackPx * visible / segments[0].count.coerceAtLeast(1)
    }
    return share.coerceAtLeast(minPx).coerceAtMost(trackPx)
}
