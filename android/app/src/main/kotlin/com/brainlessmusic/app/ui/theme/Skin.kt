package com.brainlessmusic.app.ui.theme

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.Skin
import kotlinx.coroutines.launch

/** The skin in force (A117). Screens read it through the helpers below rather than switching on it themselves. */
val LocalSkin = staticCompositionLocalOf { Skin.STANDARD }

private fun TextStyle.brand() = copy(fontFamily = BrandFontFamily)

/** Hit circle sets headings, titles and labels in Fredoka, osu!'s round friendliness; reading text stays plain. */
private val HitCircleTypography = Typography.run {
    Typography(
        displayLarge = displayLarge.brand(), displayMedium = displayMedium.brand(), displaySmall = displaySmall.brand(),
        headlineLarge = headlineLarge.brand(), headlineMedium = headlineMedium.brand(), headlineSmall = headlineSmall.brand(),
        titleLarge = titleLarge.brand(), titleMedium = titleMedium.brand(), titleSmall = titleSmall.brand(),
        bodyLarge = bodyLarge, bodyMedium = bodyMedium, bodySmall = bodySmall,
        labelLarge = labelLarge.brand(), labelMedium = labelMedium.brand(), labelSmall = labelSmall.brand(),
    )
}

private val HitCircleShapes = Shapes(
    extraSmall = RoundedCornerShape(12.dp),
    small = RoundedCornerShape(16.dp),
    medium = RoundedCornerShape(24.dp),
    large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

internal fun Skin.typography(): Typography = when (this) {
    Skin.STANDARD -> Typography
    Skin.HIT_CIRCLE -> HitCircleTypography
}

internal fun Skin.shapes(): Shapes = when (this) {
    Skin.STANDARD -> Shapes()
    Skin.HIT_CIRCLE -> HitCircleShapes
}

private val StandardCardShape = RoundedCornerShape(20.dp)

/** The outlined card the Home and Settings pages are built from. */
val MaterialTheme.cardShape: Shape
    @Composable @ReadOnlyComposable get() = when (LocalSkin.current) {
        Skin.STANDARD -> StandardCardShape
        Skin.HIT_CIRCLE -> shapes.large
    }

private val StandardRowShape = RoundedCornerShape(12.dp)

/** Smaller panels (shortcut tiles, the Up next card, notices); [standard] is the radius each had before skins. */
@Composable
@ReadOnlyComposable
fun tileShape(standard: Dp): Shape = when (LocalSkin.current) {
    Skin.STANDARD -> RoundedCornerShape(standard)
    Skin.HIT_CIRCLE -> MaterialTheme.shapes.medium
}

/** A highlighted or dragged list row (queue, playlist). Hit circle makes it a pill, like osu!'s song-select entries. */
val MaterialTheme.rowShape: Shape
    @Composable @ReadOnlyComposable get() = when (LocalSkin.current) {
        Skin.STANDARD -> StandardRowShape
        Skin.HIT_CIRCLE -> RoundedCornerShape(50)
    }

/**
 * Covers and avatars: round in Hit circle, otherwise the rounded square a caller asks for. A radius of 0 is a cell of a
 * larger picture (a mosaic) and stays square; the whole picture takes the shape.
 */
@Composable
@ReadOnlyComposable
fun coverShape(cornerRadius: Dp): Shape = when {
    cornerRadius == 0.dp -> RectangleShape
    LocalSkin.current == Skin.HIT_CIRCLE -> CircleShape
    else -> RoundedCornerShape(cornerRadius)
}

/**
 * Hit circle's tap: an approach ring closes on the finger and lands as a hit, instead of Material's ripple. It reaches
 * every plain `clickable` (rows, tiles, cards); Material's own buttons keep their ripple. With animations off the
 * ring is skipped and only the pressed tint shows.
 */
internal class ApproachRingIndication(private val color: Color, private val animate: Boolean) : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode =
        ApproachRingNode(interactionSource, color, animate)

    override fun equals(other: Any?) = other is ApproachRingIndication && other.color == color && other.animate == animate

    override fun hashCode() = 31 * color.hashCode() + animate.hashCode()
}

private class ApproachRingNode(
    private val source: InteractionSource,
    private val color: Color,
    private val animate: Boolean,
) : Modifier.Node(), DrawModifierNode {
    private val progress = Animatable(1f)
    private var center: Offset? = null
    private var pressed = false

    override fun onAttach() {
        coroutineScope.launch {
            source.interactions.collect { interaction ->
                when (interaction) {
                    is PressInteraction.Press -> {
                        pressed = true
                        center = interaction.pressPosition
                        invalidateDraw()
                        if (animate) {
                            coroutineScope.launch {
                                progress.snapTo(0f)
                                progress.animateTo(1f, tween(280, easing = FastOutSlowInEasing)) { invalidateDraw() }
                                invalidateDraw()
                            }
                        }
                    }
                    is PressInteraction.Release, is PressInteraction.Cancel -> {
                        pressed = false
                        invalidateDraw()
                    }
                }
            }
        }
    }

    override fun ContentDrawScope.draw() {
        drawContent()
        if (pressed) drawRect(color.copy(alpha = 0.10f))
        val c = center ?: return
        val p = progress.value
        if (!animate || p >= 1f) return
        val start = 64.dp.toPx()
        val end = 20.dp.toPx()
        drawCircle(
            color = color.copy(alpha = 0.25f + 0.65f * p),
            radius = start + (end - start) * p,
            center = c,
            style = Stroke(3.dp.toPx()),
        )
    }
}
