package com.brainlessmusic.app.ui.profile

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.common.RingSky
import com.brainlessmusic.app.ui.playback.skins.rememberAnimationsOn
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.LocalSkin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.sin

/** How you feel about a song (A153): liked or disliked, never both. */
enum class Feeling { NONE, LIKED, DISLIKED }

fun feelingOf(trackId: Int, liked: Set<Int>, disliked: Set<Int>): Feeling = when (trackId) {
    in liked -> Feeling.LIKED
    in disliked -> Feeling.DISLIKED
    else -> Feeling.NONE
}

/** What a heart button says it does on tap, for screen readers. */
fun Feeling.tapLabel(): String = when (this) {
    Feeling.NONE -> "Like. Hold to dislike"
    Feeling.LIKED -> "Unlike. Hold to dislike"
    Feeling.DISLIKED -> "Remove dislike"
}

/**
 * The like heart, every skin's (A153). Liking pops it and sends a burst out in the skin's shape: a ring (Standard,
 * with sparks), osu!'s double hit ring (Hit circle), a diamond (Lane), a chamfered key frame (Gear), maimai's two
 * coloured rings (Ring). Disliking cracks it down the middle and the halves tip apart; clearing either sets it back.
 * Nothing moves on first show or with animations off.
 */
@Composable
fun FeelingHeart(feeling: Feeling, tint: Color, modifier: Modifier = Modifier, size: Dp = 24.dp) {
    val skin = LocalSkin.current
    val animate = rememberAnimationsOn()
    val pop = remember { Animatable(1f) }
    val burst = remember { Animatable(1f) }
    val split = remember { Animatable(if (feeling == Feeling.DISLIKED) 1f else 0f) }
    val shown = remember { BooleanArray(1) }
    val outline = rememberVectorPainter(AppIcons.favoriteBorder)
    val filled = rememberVectorPainter(AppIcons.favorite)

    LaunchedEffect(feeling) {
        if (!shown[0] || !animate) {
            shown[0] = true
            split.snapTo(if (feeling == Feeling.DISLIKED) 1f else 0f)
            return@LaunchedEffect
        }
        when (feeling) {
            Feeling.LIKED -> {
                split.snapTo(0f)
                burst.snapTo(0f)
                pop.snapTo(0.55f)
                coroutineScope {
                    launch { burst.animateTo(1f, tween(480)) }
                    launch { pop.animateTo(1f, spring(dampingRatio = 0.32f, stiffness = Spring.StiffnessMedium)) }
                }
            }
            Feeling.DISLIKED -> {
                pop.snapTo(0.88f)
                coroutineScope {
                    launch { pop.animateTo(1f, spring(dampingRatio = 0.4f, stiffness = Spring.StiffnessMedium)) }
                    launch { split.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMediumLow)) }
                }
            }
            Feeling.NONE -> {
                coroutineScope {
                    launch { split.animateTo(0f, tween(180)) }
                    launch {
                        pop.snapTo(0.82f)
                        pop.animateTo(1f, spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessMedium))
                    }
                }
            }
        }
    }

    Canvas(
        modifier
            .size(size)
            .graphicsLayer {
                scaleX = pop.value
                scaleY = pop.value
            },
    ) {
        val b = burst.value
        if (b < 1f) drawBurst(skin, b, tint)
        val s = split.value
        val painter = if (feeling == Feeling.NONE && s <= 0.001f) outline else filled
        if (s <= 0.001f) {
            with(painter) { draw(this@Canvas.size, colorFilter = ColorFilter.tint(tint)) }
        } else {
            drawCracked(s) { with(filled) { draw(this@Canvas.size, colorFilter = ColorFilter.tint(tint)) } }
        }
    }
}

/** The heart in two halves along a zigzag, tipped apart by [s] (0 whole, 1 broken). */
private fun DrawScope.drawCracked(s: Float, heart: DrawScope.() -> Unit) {
    val w = size.width
    val h = size.height
    // The crack, top notch to bottom tip, in the heart's own box.
    val crack = listOf(
        Offset(0.50f * w, 0.22f * h),
        Offset(0.41f * w, 0.42f * h),
        Offset(0.56f * w, 0.56f * h),
        Offset(0.45f * w, 0.72f * h),
        Offset(0.50f * w, 0.92f * h),
    )
    val left = Path().apply {
        moveTo(0f, 0f); lineTo(crack[0].x, 0f)
        crack.forEach { lineTo(it.x, it.y) }
        lineTo(crack.last().x, h); lineTo(0f, h); close()
    }
    val right = Path().apply {
        moveTo(w, 0f); lineTo(crack[0].x, 0f)
        crack.forEach { lineTo(it.x, it.y) }
        lineTo(crack.last().x, h); lineTo(w, h); close()
    }
    val apart = 1.6.dp.toPx() * s
    val drop = 1.dp.toPx() * s
    val pivot = Offset(w / 2f, h * 0.92f)
    translate(-apart, drop) { rotate(-11f * s, pivot) { clipPath(left) { heart() } } }
    translate(apart, drop) { rotate(11f * s, pivot) { clipPath(right) { heart() } } }
}

/** The like burst at [b] (0 just liked, 1 gone), in the skin's shape, from the heart's middle outwards. */
private fun DrawScope.drawBurst(skin: Skin, b: Float, color: Color) {
    val c = center
    val alpha = (1f - b).coerceIn(0f, 1f)
    val r = size.minDimension * (0.45f + 0.75f * b)
    val stroke = 2.dp.toPx() * (1f - b) + 0.5f
    when (skin) {
        Skin.STANDARD -> {
            drawCircle(color, r, c, alpha = alpha * 0.8f, style = Stroke(stroke))
            for (i in 0 until 6) {
                val a = Math.toRadians(i * 60.0 - 90.0)
                val d = r * 1.15f
                drawCircle(color, 1.6.dp.toPx() * (1f - b), Offset(c.x + d * cos(a).toFloat(), c.y + d * sin(a).toFloat()), alpha = alpha)
            }
        }
        // osu!'s hit burst: a thick ring and a thin one a step behind.
        Skin.HIT_CIRCLE -> {
            drawCircle(color, r, c, alpha = alpha, style = Stroke(stroke * 1.6f))
            drawCircle(color, r * 0.7f, c, alpha = alpha * 0.6f, style = Stroke(stroke * 0.8f))
        }
        Skin.LANE -> drawPath(
            Path().apply {
                moveTo(c.x, c.y - r); lineTo(c.x + r, c.y); lineTo(c.x, c.y + r); lineTo(c.x - r, c.y); close()
            },
            color,
            alpha = alpha,
            style = Stroke(stroke),
        )
        Skin.GEAR -> {
            val cut = r * 0.3f
            drawPath(
                Path().apply {
                    moveTo(c.x - r + cut, c.y - r); lineTo(c.x + r - cut, c.y - r); lineTo(c.x + r, c.y - r + cut)
                    lineTo(c.x + r, c.y + r - cut); lineTo(c.x + r - cut, c.y + r); lineTo(c.x - r + cut, c.y + r)
                    lineTo(c.x - r, c.y + r - cut); lineTo(c.x - r, c.y - r + cut); close()
                },
                color,
                alpha = alpha,
                style = Stroke(stroke * 1.4f),
            )
        }
        Skin.RING -> {
            drawCircle(RingSky, r, c, alpha = alpha, style = Stroke(stroke * 1.4f))
            drawCircle(color, r * 0.75f, c, alpha = alpha, style = Stroke(stroke))
        }
    }
}
