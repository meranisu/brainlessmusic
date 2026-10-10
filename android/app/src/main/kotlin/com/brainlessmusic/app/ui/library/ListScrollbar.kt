package com.brainlessmusic.app.ui.library

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp

/** Touch width of the scroll bar; the visible thumb is narrower and centred in it. */
val ScrollbarWidth = 16.dp

private val ThumbWidth = 4.dp
private val ThumbMinHeight = 40.dp

@Composable
fun ListScrollbar(state: LazyListState, onJump: (index: Int) -> Unit, modifier: Modifier = Modifier, topInset: Dp = 0.dp) {
    val first by remember { derivedStateOf { state.firstVisibleItemIndex } }
    val visible by remember { derivedStateOf { state.layoutInfo.visibleItemsInfo.size } }
    val total by remember { derivedStateOf { state.layoutInfo.totalItemsCount } }
    Scrollbar(first, visible, total, state.isScrollInProgress, onJump, modifier, topInset)
}

@Composable
fun GridScrollbar(state: LazyGridState, onJump: (index: Int) -> Unit, modifier: Modifier = Modifier, topInset: Dp = 0.dp) {
    val first by remember { derivedStateOf { state.firstVisibleItemIndex } }
    val visible by remember { derivedStateOf { state.layoutInfo.visibleItemsInfo.size } }
    val total by remember { derivedStateOf { state.layoutInfo.totalItemsCount } }
    Scrollbar(first, visible, total, state.isScrollInProgress, onJump, modifier, topInset)
}

/**
 * A draggable thumb over the whole list. The paged lists hold placeholders for every row, so [total] is the library
 * size and a drag can land anywhere, like the alphabet rail. Hidden when everything already fits.
 */
@Composable
private fun Scrollbar(
    first: Int,
    visible: Int,
    total: Int,
    scrolling: Boolean,
    onJump: (index: Int) -> Unit,
    modifier: Modifier,
    topInset: Dp,
) {
    if (total <= 0 || visible >= total) return

    var trackPx by remember { mutableIntStateOf(1) }
    var dragging by remember { mutableStateOf(false) }
    var lastJump by remember { mutableIntStateOf(-1) }
    val density = LocalDensity.current
    val minThumbPx = with(density) { ThumbMinHeight.toPx() }
    val thumbPx = (trackPx * visible.toFloat() / total).coerceIn(minThumbPx, trackPx.toFloat())
    val lastFirst = (total - visible).coerceAtLeast(1)
    val thumbTop = (trackPx - thumbPx) * (first.toFloat() / lastFirst).coerceIn(0f, 1f)
    // Quiet at rest, so it doesn't compete with the rows; full accent while in use.
    val alpha by animateFloatAsState(if (dragging || scrolling) 1f else 0.45f, label = "scrollbarAlpha")

    fun jumpTo(y: Float) {
        // The finger holds the middle of the thumb.
        val fraction = ((y - thumbPx / 2) / (trackPx - thumbPx).coerceAtLeast(1f)).coerceIn(0f, 1f)
        val index = (fraction * lastFirst).toInt()
        if (index == lastJump) return
        lastJump = index
        onJump(index)
    }

    fun release() {
        dragging = false
        lastJump = -1
    }

    Box(
        modifier = modifier
            .padding(top = topInset, bottom = 8.dp)
            .fillMaxHeight()
            .width(ScrollbarWidth)
            .onSizeChanged { trackPx = it.height.coerceAtLeast(1) }
            .pointerInput(total, visible) {
                detectTapGestures(onPress = { offset ->
                    dragging = true
                    jumpTo(offset.y)
                    tryAwaitRelease()
                    release()
                })
            }
            .pointerInput(total, visible) {
                detectVerticalDragGestures(
                    onDragStart = {
                        dragging = true
                        jumpTo(it.y)
                    },
                    onDragEnd = ::release,
                    onDragCancel = ::release,
                ) { change, _ -> jumpTo(change.position.y) }
            },
    ) {
        val color = if (dragging) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .offset { IntOffset(0, thumbTop.toInt()) }
                .width(ThumbWidth)
                .height(with(density) { thumbPx.toDp() })
                .background(color.copy(alpha = color.alpha * alpha), CircleShape),
        )
    }
}
