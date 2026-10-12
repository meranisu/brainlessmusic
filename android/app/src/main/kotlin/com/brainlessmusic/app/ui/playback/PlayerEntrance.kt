package com.brainlessmusic.app.ui.playback

import androidx.compose.animation.EnterExitState
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.Transition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.drawShutter
import kotlin.math.hypot
import kotlin.math.max

/** Where the mini player's cover sits on screen, in root pixels, so the player can open from it (Hit circle, Ring). */
object PlayerAnchor {
    var cover by mutableStateOf<Offset?>(null)
}

/**
 * How far the player has arrived, 0 (gone) to 1 (fully open), following the NavHost's own enter/exit, so the screen
 * stays until it finishes. Each skin has its own timing: Lane's shutter closes, holds a beat and parts; Gear slams;
 * Ring springs a little past round (A145, A146).
 */
@Composable
fun Transition<EnterExitState>.playerPresence(skin: Skin): State<Float> = animateFloat(
    transitionSpec = {
        val opening = targetState == EnterExitState.Visible
        presenceSpec(skin, opening)
    },
    label = "playerPresence",
) { if (it == EnterExitState.Visible) 1f else 0f }

private fun presenceSpec(skin: Skin, opening: Boolean): FiniteAnimationSpec<Float> = when (skin) {
    Skin.STANDARD -> if (opening) tween(320, easing = FastOutSlowInEasing) else tween(260, easing = FastOutLinearInEasing)
    Skin.HIT_CIRCLE -> if (opening) tween(260, easing = LinearOutSlowInEasing) else tween(200, easing = FastOutLinearInEasing)
    // Shut by 40%, held shut, parted by the end. Read from either end, it is the same shutter both ways.
    Skin.LANE -> keyframes {
        durationMillis = 640
        0.5f at 250 using FastOutSlowInEasing
        0.5f at 370
    }
    Skin.GEAR -> if (opening) tween(180, easing = LinearOutSlowInEasing) else tween(150, easing = FastOutLinearInEasing)
    Skin.RING -> if (opening) spring(dampingRatio = 0.72f, stiffness = Spring.StiffnessMediumLow) else tween(260, easing = FastOutSlowInEasing)
}

/** How long the screen under the player stays drawn while the player arrives over it: longer than any skin's entrance (ms). */
const val PLAYER_ENTRANCE_HOLD_MS = 700

/**
 * Draws the player arriving or leaving at [presence], in the skin's game:
 * - Standard: a plain sheet up from the bottom.
 * - Hit circle: osu! starting a map, the player zooms out of the mini player's cover and fades in.
 * - Lane: Arcaea's song-start shutter, the halves close over the old screen and part on the player.
 * - Gear: SOUND VOLTEX's slam, up fast with a slanted leading edge lit in the accent.
 * - Ring: a maimai circle growing from the cover until it fills the screen, its rim lit as it goes.
 * When the player was [swiped] away it just follows the finger off the bottom, so none of this plays.
 */
@Composable
fun Modifier.playerEntrance(skin: Skin, presence: () -> Float, swiped: () -> Boolean): Modifier {
    val scheme = MaterialTheme.colorScheme
    return when (skin) {
        Skin.STANDARD -> graphicsLayer {
            if (!swiped()) translationY = (1f - presence()) * size.height
        }
        Skin.HIT_CIRCLE -> graphicsLayer {
            if (swiped()) return@graphicsLayer
            val p = presence()
            val scale = 0.82f + 0.18f * p
            scaleX = scale
            scaleY = scale
            alpha = p
            val from = PlayerAnchor.cover
            transformOrigin = if (from != null && size.width > 0f && size.height > 0f) {
                TransformOrigin(from.x / size.width, from.y / size.height)
            } else {
                TransformOrigin(0.5f, 1f)
            }
        }
        Skin.LANE -> drawWithContent {
            if (swiped()) {
                drawContent()
                return@drawWithContent
            }
            val p = presence()
            // First half the shutter closes over what was there; second half it parts on the player.
            if (p >= 0.5f) drawContent()
            val closed = if (p < 0.5f) p * 2f else (1f - p) * 2f
            if (closed > 0f) drawShutter(closed, scheme.surfaceContainerHigh, scheme.surfaceContainerHighest, scheme.primary)
        }
        Skin.GEAR -> graphicsLayer {
            if (swiped()) return@graphicsLayer
            val p = presence()
            translationY = (1f - p) * size.height
            val slant = (1f - p) * 64.dp.toPx()
            if (slant > 0.5f) {
                clip = true
                shape = GenericShape { s, _ ->
                    moveTo(0f, slant); lineTo(s.width, 0f); lineTo(s.width, s.height); lineTo(0f, s.height); close()
                }
            }
        }.drawWithContent {
            drawContent()
            val p = presence()
            if (swiped() || p >= 1f) return@drawWithContent
            // The leading edge, lit, the way SOUND VOLTEX's panels cut in.
            val slant = (1f - p) * 64.dp.toPx()
            drawLine(scheme.primary, Offset(0f, slant), Offset(size.width, 0f), 3.dp.toPx())
        }
        Skin.RING -> graphicsLayer {
            if (swiped()) return@graphicsLayer
            val p = presence()
            if (p >= 1f) return@graphicsLayer
            val c = PlayerAnchor.cover ?: Offset(size.width / 2f, size.height)
            val radius = farthest(c, size.width, size.height) * p.coerceAtLeast(0f)
            clip = true
            shape = GenericShape { _, _ -> addOval(Rect(c, radius)) }
        }.drawWithContent {
            drawContent()
            val p = presence()
            if (swiped() || p >= 1f || p <= 0f) return@drawWithContent
            val c = PlayerAnchor.cover ?: Offset(size.width / 2f, size.height)
            val radius = farthest(c, size.width, size.height) * p
            drawCircle(scheme.primary, radius - 2.dp.toPx(), c, style = Stroke(4.dp.toPx()))
        }
    }
}

private fun farthest(c: Offset, w: Float, h: Float): Float =
    max(max(hypot(c.x, c.y), hypot(w - c.x, c.y)), max(hypot(c.x, h - c.y), hypot(w - c.x, h - c.y)))
