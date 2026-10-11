package com.brainlessmusic.app.ui.playback

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.Dp
import kotlinx.coroutines.launch

// How far a drag must go, as a share of the element's width, before letting go skips.
private const val SKIP_FRACTION = 0.25f

// Past an end with nothing there, the drag still moves, at a third of the finger, so it reads as "no further".
private const val RESISTANCE = 3f

/**
 * Left for the next song, right for the one before. [offset] follows the finger for the caller to draw with, and
 * springs back to 0 after. A drag shorter than a quarter of the width does nothing.
 */
@Composable
fun Modifier.swipeToSkip(
    offset: Animatable<Float, AnimationVector1D>,
    canNext: Boolean,
    canPrevious: Boolean,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
): Modifier {
    val scope = rememberCoroutineScope()
    val hasNext by rememberUpdatedState(canNext)
    val hasPrevious by rememberUpdatedState(canPrevious)
    val next by rememberUpdatedState(onNext)
    val previous by rememberUpdatedState(onPrevious)
    return pointerInput(Unit) {
        var total = 0f
        detectHorizontalDragGestures(
            onDragStart = { total = offset.value },
            onDragEnd = {
                val threshold = size.width * SKIP_FRACTION
                when {
                    total < -threshold && hasNext -> next()
                    total > threshold && hasPrevious -> previous()
                }
                scope.launch { offset.animateTo(0f) }
            },
            onDragCancel = { scope.launch { offset.animateTo(0f) } },
        ) { change, dx ->
            change.consume()
            val blocked = (total + dx < 0 && !hasNext) || (total + dx > 0 && !hasPrevious)
            total += if (blocked) dx / RESISTANCE else dx
            scope.launch { offset.snapTo(total) }
        }
    }
}

/**
 * A downward drag ([down] true) or an upward one past [distance] calls [onSwipe] on release. With [offset], the drag
 * also moves it (towards [down] only) and springs back when it falls short; after [onSwipe] it stays where it was let go.
 */
@Composable
fun Modifier.verticalSwipe(
    down: Boolean,
    distance: Dp,
    onSwipe: () -> Unit,
    offset: Animatable<Float, AnimationVector1D>? = null,
): Modifier {
    val scope = rememberCoroutineScope()
    val swiped by rememberUpdatedState(onSwipe)
    return pointerInput(down) {
        var total = 0f
        detectVerticalDragGestures(
            onDragStart = { total = 0f },
            onDragEnd = {
                if (if (down) total > distance.toPx() else total < -distance.toPx()) {
                    swiped()
                } else {
                    offset?.let { scope.launch { it.animateTo(0f) } }
                }
            },
            onDragCancel = { offset?.let { scope.launch { it.animateTo(0f) } } },
        ) { change, dy ->
            change.consume()
            total += dy
            offset?.let { scope.launch { it.snapTo(if (down) total.coerceAtLeast(0f) else total.coerceAtMost(0f)) } }
        }
    }
}
