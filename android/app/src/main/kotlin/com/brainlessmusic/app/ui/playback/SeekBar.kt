package com.brainlessmusic.app.ui.playback

import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.SeekStyle
import kotlin.math.PI
import kotlin.math.sin

/**
 * The Now Playing progress bar in one of several looks ([SeekStyle]). [fraction] is 0..1 and
 * [onFraction] reports a touch or drag as 0..1; [onFinished] fires when the finger lifts, which is
 * when the caller actually seeks. [interactive] = false draws it for the Settings preview.
 */
@Composable
fun SeekBar(
    style: SeekStyle,
    fraction: Float,
    playing: Boolean,
    onFraction: (Float) -> Unit,
    onFinished: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    interactive: Boolean = true,
) {
    if (style == SeekStyle.CLASSIC) {
        Slider(
            value = fraction,
            onValueChange = onFraction,
            onValueChangeFinished = onFinished,
            enabled = enabled && interactive,
            modifier = modifier,
        )
        return
    }

    val scheme = MaterialTheme.colorScheme
    val played = scheme.primary
    val rest = scheme.primary.copy(alpha = 0.22f)

    val context = LocalContext.current
    val animationsOn = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    // The squiggle flows while playing and settles flat when paused, like the system media player's.
    val phase = if (style == SeekStyle.SQUIGGLE && playing && animationsOn) {
        rememberInfiniteTransition(label = "squiggle").animateFloat(
            initialValue = 0f,
            targetValue = (2 * PI).toFloat(),
            animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing)),
            label = "phase",
        ).value
    } else {
        0f
    }
    val amplitude by animateDpAsState(if (playing) 3.dp else 0.dp, label = "amplitude")

    var widthPx by remember { mutableIntStateOf(1) }
    val f = fraction.coerceIn(0f, 1f)

    val touch = if (interactive && enabled) {
        Modifier
            .pointerInput(Unit) {
                detectTapGestures { offset ->
                    onFraction((offset.x / widthPx).coerceIn(0f, 1f))
                    onFinished()
                }
            }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragStart = { onFraction((it.x / widthPx).coerceIn(0f, 1f)) },
                    onDragEnd = onFinished,
                    onDragCancel = onFinished,
                ) { change, _ -> onFraction((change.position.x / widthPx).coerceIn(0f, 1f)) }
            }
    } else {
        Modifier
    }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(40.dp)
            .padding(horizontal = 4.dp)
            .onSizeChanged { widthPx = it.width.coerceAtLeast(1) }
            .then(touch)
            .semantics {
                progressBarRangeInfo = ProgressBarRangeInfo(f, 0f..1f)
                if (interactive && enabled) {
                    setProgress { target ->
                        onFraction(target.coerceIn(0f, 1f))
                        onFinished()
                        true
                    }
                }
            },
    ) {
        val cy = size.height / 2
        val x = size.width * f
        when (style) {
            SeekStyle.SQUIGGLE -> drawSquiggle(x, cy, amplitude.toPx(), phase, played, rest)
            SeekStyle.LINE -> drawThinLine(x, cy, played, rest)
            SeekStyle.PILL -> drawPill(x, cy, played, rest)
            SeekStyle.DOTS -> drawDots(x, cy, played, rest)
            SeekStyle.CLASSIC -> Unit
        }
    }
}

private fun DrawScope.drawSquiggle(x: Float, cy: Float, amplitude: Float, phase: Float, played: Color, rest: Color) {
    val stroke = 4.dp.toPx()
    val wavelength = 22.dp.toPx()
    val capInset = stroke / 2
    val twoPi = (2 * PI).toFloat()
    // The unplayed part is a plain line; the wave rides only over what has been played.
    drawLine(rest, Offset(x, cy), Offset(size.width - capInset, cy), strokeWidth = stroke, cap = StrokeCap.Round)
    if (x > capInset) {
        val path = Path()
        var px = capInset
        path.moveTo(px, cy + amplitude * sin((px / wavelength) * twoPi - phase))
        while (px < x) {
            px = (px + 2f).coerceAtMost(x)
            path.lineTo(px, cy + amplitude * sin((px / wavelength) * twoPi - phase))
        }
        drawPath(path, played, style = Stroke(width = stroke, cap = StrokeCap.Round))
    }
    val handleW = 4.dp.toPx()
    val handleH = 22.dp.toPx()
    drawRoundRect(played, Offset(x - handleW / 2, cy - handleH / 2), Size(handleW, handleH), CornerRadius(handleW / 2))
}

private fun DrawScope.drawThinLine(x: Float, cy: Float, played: Color, rest: Color) {
    val stroke = 3.dp.toPx()
    drawLine(rest, Offset(x, cy), Offset(size.width, cy), strokeWidth = stroke, cap = StrokeCap.Round)
    drawLine(played, Offset(0f, cy), Offset(x, cy), strokeWidth = stroke, cap = StrokeCap.Round)
    drawCircle(played, radius = 7.dp.toPx(), center = Offset(x, cy))
}

/** A thick track with a handle and a small gap either side of it, after Material 3 Expressive's slider. */
private fun DrawScope.drawPill(x: Float, cy: Float, played: Color, rest: Color) {
    val h = 18.dp.toPx()
    val gap = 5.dp.toPx()
    val r = CornerRadius(h / 2)
    val top = cy - h / 2
    if (x - gap > 0f) drawRoundRect(played, Offset(0f, top), Size(x - gap, h), r)
    if (size.width - (x + gap) > 0f) drawRoundRect(rest, Offset(x + gap, top), Size(size.width - x - gap, h), r)
    val handleW = 4.dp.toPx()
    val handleH = 32.dp.toPx()
    drawRoundRect(played, Offset(x - handleW / 2, cy - handleH / 2), Size(handleW, handleH), CornerRadius(handleW / 2))
}

private fun DrawScope.drawDots(x: Float, cy: Float, played: Color, rest: Color) {
    val count = (size.width / 11.dp.toPx()).toInt().coerceAtLeast(8)
    val step = size.width / count
    val radius = 2.5.dp.toPx()
    for (i in 0 until count) {
        val cx = step * (i + 0.5f)
        drawCircle(if (cx <= x) played else rest, radius, Offset(cx, cy))
    }
    drawCircle(played, radius = 7.dp.toPx(), center = Offset(x, cy))
}
