package com.brainlessmusic.app.ui.theme

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.IndicationNodeFactory
import kotlin.math.PI
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.Density
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.geometry.Size
import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.foundation.shape.CutCornerShape
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

private fun TextStyle.lane(weight: FontWeight) = copy(fontFamily = LaneFontFamily, fontWeight = weight)

/** Lane sets everything in Exo 2, as Arcaea uses one face throughout: big text light, titles and labels medium. */
private val LaneTypography = Typography.run {
    Typography(
        displayLarge = displayLarge.lane(FontWeight.Light), displayMedium = displayMedium.lane(FontWeight.Light),
        displaySmall = displaySmall.lane(FontWeight.Light), headlineLarge = headlineLarge.lane(FontWeight.Normal),
        headlineMedium = headlineMedium.lane(FontWeight.Normal), headlineSmall = headlineSmall.lane(FontWeight.Normal),
        titleLarge = titleLarge.lane(FontWeight.Medium), titleMedium = titleMedium.lane(FontWeight.Medium),
        titleSmall = titleSmall.lane(FontWeight.Medium), bodyLarge = bodyLarge.lane(FontWeight.Normal),
        bodyMedium = bodyMedium.lane(FontWeight.Normal), bodySmall = bodySmall.lane(FontWeight.Normal),
        labelLarge = labelLarge.lane(FontWeight.Medium), labelMedium = labelMedium.lane(FontWeight.Medium),
        labelSmall = labelSmall.lane(FontWeight.Medium),
    )
}

/** Arcaea's panels: two opposite corners cut on the diagonal, never rounded. */
internal fun laneCut(size: Dp): CornerBasedShape = CutCornerShape(topStart = size, topEnd = 0.dp, bottomEnd = size, bottomStart = 0.dp)

private val LaneShapes = Shapes(
    extraSmall = CutCornerShape(4.dp),
    small = laneCut(8.dp),
    medium = laneCut(12.dp),
    large = laneCut(16.dp),
    extraLarge = laneCut(24.dp),
)

/** Arcaea's song-list rows: a parallelogram, both ends slanted by [slant]. */
internal class SlantShape(private val slant: Dp) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val s = with(density) { slant.toPx() }.coerceAtMost(size.width / 4)
        return Outline.Generic(
            Path().apply {
                moveTo(s, 0f)
                lineTo(size.width, 0f)
                lineTo(size.width - s, size.height)
                lineTo(0f, size.height)
                close()
            },
        )
    }
}

internal fun Skin.typography(): Typography = when (this) {
    Skin.STANDARD -> Typography
    Skin.HIT_CIRCLE -> HitCircleTypography
    Skin.LANE -> LaneTypography
}

internal fun Skin.shapes(): Shapes = when (this) {
    Skin.STANDARD -> Shapes()
    Skin.HIT_CIRCLE -> HitCircleShapes
    Skin.LANE -> LaneShapes
}

private val StandardCardShape = RoundedCornerShape(20.dp)

/** The outlined card the Home and Settings pages are built from. */
val MaterialTheme.cardShape: Shape
    @Composable @ReadOnlyComposable get() = when (LocalSkin.current) {
        Skin.STANDARD -> StandardCardShape
        Skin.HIT_CIRCLE, Skin.LANE -> shapes.large
    }

private val StandardRowShape = RoundedCornerShape(12.dp)

/** Smaller panels (shortcut tiles, the Up next card, notices); [standard] is the radius each had before skins. */
@Composable
@ReadOnlyComposable
fun tileShape(standard: Dp): Shape = when (LocalSkin.current) {
    Skin.STANDARD -> RoundedCornerShape(standard)
    Skin.HIT_CIRCLE, Skin.LANE -> MaterialTheme.shapes.medium
}

/** A highlighted or dragged list row (queue, playlist). Hit circle makes it a pill, like osu!'s song-select entries. */
val MaterialTheme.rowShape: Shape
    @Composable @ReadOnlyComposable get() = when (LocalSkin.current) {
        Skin.STANDARD -> StandardRowShape
        Skin.HIT_CIRCLE -> RoundedCornerShape(50)
        Skin.LANE -> LaneRowShape
    }

private val LaneRowShape = SlantShape(10.dp)

/**
 * Covers and avatars: round in Hit circle, corner-cut in Lane, otherwise the rounded square a caller asks for. A radius of 0 is a cell of a
 * larger picture (a mosaic) and stays square; the whole picture takes the shape.
 */
@Composable
@ReadOnlyComposable
fun coverShape(cornerRadius: Dp): Shape = when {
    cornerRadius == 0.dp -> RectangleShape
    LocalSkin.current == Skin.HIT_CIRCLE -> CircleShape
    LocalSkin.current == Skin.LANE -> laneCut(cornerRadius)
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

/**
 * Lane's tap: Arcaea's hit, a dashed ring flung outward from the finger around a flash that fades, instead of Material's
 * ripple. Reaches every plain `clickable`, as [ApproachRingIndication] does. With animations off only the tint shows.
 */
internal class LaneHitIndication(private val color: Color, private val animate: Boolean) : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode = LaneHitNode(interactionSource, color, animate)

    override fun equals(other: Any?) = other is LaneHitIndication && other.color == color && other.animate == animate

    override fun hashCode() = 31 * color.hashCode() + animate.hashCode() + 1
}

private class LaneHitNode(
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
                                progress.animateTo(1f, tween(300, easing = FastOutSlowInEasing)) { invalidateDraw() }
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
        val fade = 1f - p
        drawCircle(color.copy(alpha = 0.5f * fade), radius = 10.dp.toPx() * (1f - 0.5f * p), center = c)
        val radius = 14.dp.toPx() + 30.dp.toPx() * p
        val dash = (2 * PI.toFloat() * radius) / 24f
        drawCircle(
            color = color.copy(alpha = 0.9f * fade),
            radius = radius,
            center = c,
            style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(dash * 0.6f, dash * 0.4f))),
        )
    }
}
